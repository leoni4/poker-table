import { describe, expect, it } from 'vitest';
import {
  PlayerId,
  PlayerStatus,
  TableConfig,
  TablePhase,
  TableState,
  createDefaultTableConfig,
  createPlayerId,
} from '../../src/core/table.js';
import { PokerError } from '../../src/core/errors.js';
import { Result, isOk } from '../../src/core/result.js';
import { calculateRake } from '../../src/pot/index.js';
import { replayHand } from '../../src/history/replay.js';
import {
  handHistoryFromJSON,
  handHistoryToJSON,
} from '../../src/history/hand-history.js';
import { Table, createTable } from '../../src/table/index.js';

function expectOk<T>(result: Result<T, PokerError>): T {
  expect(isOk(result)).toBe(true);
  if (!isOk(result)) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function seat(
  table: Table,
  id: string,
  stack = 100n
): PlayerId {
  const playerId = createPlayerId(id);
  expectOk(table.seatPlayer(playerId, stack));
  return playerId;
}

function totalStacks(state: TableState): bigint {
  return state.players.reduce((sum, player) => sum + player.stack, 0n);
}

function totalPots(state: TableState): bigint {
  return state.pots.reduce((sum, pot) => sum + pot.total, 0n);
}

function createHeadsUp(
  seed: number,
  stack = 100n,
  configOverrides: Partial<TableConfig> = {}
): { table: Table; first: PlayerId; second: PlayerId } {
  const config: TableConfig = {
    ...createDefaultTableConfig(),
    ...configOverrides,
    rngSeed: seed,
  };
  const table = createTable(config);
  const first = seat(table, 'first', stack);
  const second = seat(table, 'second', stack);
  return { table, first, second };
}

function foldCurrentPlayer(table: Table): TableState {
  const state = table.getState();
  expect(state.currentPlayerId).toBeDefined();
  return expectOk(
    table.applyAction(state.currentPlayerId!, { type: 'FOLD' })
  );
}

describe('deep audit regressions', () => {
  it('treats antes as dead money, not live preflop commitment', () => {
    const config: TableConfig = {
      ...createDefaultTableConfig(),
      ante: 5n,
      rngSeed: 1,
    };
    const table = createTable(config);
    const dealer = seat(table, 'dealer');
    seat(table, 'small-blind');
    seat(table, 'big-blind');

    let state = expectOk(table.startHand());

    expect(state.currentPlayerId).toBe(dealer);
    expect(state.bettingRound?.currentBet).toBe(2n);
    expect(state.players.map((player) => player.committed)).toEqual([
      0n,
      1n,
      2n,
    ]);
    expect(totalPots(state)).toBe(18n);
    expect(totalStacks(state) + totalPots(state)).toBe(300n);

    state = expectOk(table.applyAction(dealer, { type: 'CALL' }));
    expect(state.players.find((player) => player.id === dealer)?.committed).toBe(
      2n
    );
    expect(totalStacks(state) + totalPots(state)).toBe(300n);
  });

  it('keeps the nominal big blind as the preflop price when the BB is short after ante', () => {
    const config: TableConfig = {
      ...createDefaultTableConfig(),
      ante: 5n,
      rngSeed: 2,
    };
    const table = createTable(config);
    const dealer = seat(table, 'dealer', 100n);
    seat(table, 'small-blind', 100n);
    const shortBigBlind = seat(table, 'short-big-blind', 3n);

    const state = expectOk(table.startHand());
    const bb = state.players.find((player) => player.id === shortBigBlind);

    expect(bb?.stack).toBe(0n);
    expect(bb?.committed).toBe(0n);
    expect(bb?.status).toBe(PlayerStatus.AllIn);
    expect(state.bettingRound?.currentBet).toBe(2n);
    expect(state.currentPlayerId).toBe(dealer);
  });

  it('adjusts the button correctly when a table becomes heads-up', () => {
    const table = createTable({
      ...createDefaultTableConfig(),
      minPlayers: 2,
      maxPlayers: 3,
      rngSeed: 31,
    });
    const p0 = seat(table, 'p0');
    const p1 = seat(table, 'p1');
    const p2 = seat(table, 'p2');

    let state = expectOk(table.startHand());
    expect(state.dealerSeat).toBe(0);
    expect(state.players.find((player) => player.id === p2)?.committed).toBe(2n);

    state = expectOk(table.applyAction(p0, { type: 'FOLD' }));
    state = expectOk(table.applyAction(p1, { type: 'FOLD' }));
    expect(state.phase).toBe(TablePhase.Showdown);
    expectOk(table.removePlayer(p0));

    state = expectOk(table.startHand());
    expect(state.dealerSeat).toBe(2);
    expect(state.players.find((player) => player.id === p2)?.committed).toBe(1n);
    expect(state.players.find((player) => player.id === p1)?.committed).toBe(2n);
    expect(state.currentPlayerId).toBe(p2);
  });

  it('can start consecutive hands and normalizes hand-local statuses', () => {
    const { table } = createHeadsUp(1234);

    let firstHand = expectOk(table.startHand());
    const firstDealer = firstHand.dealerSeat;
    const firstCards = firstHand.players.map((player) => player.holeCards.cards);
    firstHand = foldCurrentPlayer(table);

    expect(firstHand.phase).toBe(TablePhase.Showdown);
    expect(firstHand.players.some((player) => player.status === PlayerStatus.Folded)).toBe(
      true
    );

    const secondHand = expectOk(table.startHand());
    expect(secondHand.handId).toBe(2);
    expect(secondHand.dealerSeat).not.toBe(firstDealer);
    expect(secondHand.players.every((player) => player.status === PlayerStatus.Active)).toBe(
      true
    );
    expect(secondHand.players.map((player) => player.holeCards.cards)).not.toEqual(
      firstCards
    );
  });

  it('uses a deterministic RNG stream that advances across hands', () => {
    const left = createHeadsUp(987654);
    const right = createHeadsUp(987654);

    const leftFirst = expectOk(left.table.startHand());
    const rightFirst = expectOk(right.table.startHand());
    expect(leftFirst.players.map((player) => player.holeCards.cards)).toEqual(
      rightFirst.players.map((player) => player.holeCards.cards)
    );

    foldCurrentPlayer(left.table);
    foldCurrentPlayer(right.table);

    const leftSecond = expectOk(left.table.startHand());
    const rightSecond = expectOk(right.table.startHand());
    expect(leftSecond.players.map((player) => player.holeCards.cards)).toEqual(
      rightSecond.players.map((player) => player.holeCards.cards)
    );
    expect(leftSecond.players.map((player) => player.holeCards.cards)).not.toEqual(
      leftFirst.players.map((player) => player.holeCards.cards)
    );
  });

  it('records a complete history and exposes a structured showdown result', () => {
    const { table } = createHeadsUp(777);
    let state = expectOk(table.startHand());
    const opener = state.currentPlayerId!;
    state = expectOk(table.applyAction(opener, { type: 'ALL_IN' }));
    state = expectOk(
      table.applyAction(state.currentPlayerId!, { type: 'CALL' })
    );

    expect(state.phase).toBe(TablePhase.Showdown);
    expect(state.communityCards).toHaveLength(5);

    const history = table.getLastHandHistory();
    expect(history).not.toBeNull();
    expect(history?.events.map((event) => event.type)).toEqual([
      'HAND_STARTED',
      'BLINDS_POSTED',
      'CARDS_DEALT',
      'ACTION_TAKEN',
      'ACTION_TAKEN',
      'STREET_ENDED',
      'STREET_ENDED',
      'STREET_ENDED',
      'SHOWDOWN',
      'POT_DISTRIBUTED',
      'HAND_ENDED',
    ]);

    const result = table.getLastHandResult();
    expect(result).not.toBeNull();
    expect(result?.reason).toBe('showdown');
    expect(result?.finalBoard).toHaveLength(5);
    expect(result?.revealedPlayers).toHaveLength(2);
    expect(result?.pots).toHaveLength(1);
    expect(result?.pots[0].winnerIds.length).toBeGreaterThan(0);
    expect(result?.pots[0].winningHand?.bestCards).toHaveLength(5);
    expect(
      result?.pots[0].payouts.reduce((sum, payout) => sum + payout.amount, 0n)
    ).toBe(200n);
    expect(state.lastHandResult).toEqual(result);
  });

  it('returns defensive copies for nested state, config, history and result data', () => {
    const { table } = createHeadsUp(888, 100n, {
      rake: { percentage: 0.05, cap: 10n },
    });
    const started = expectOk(table.startHand());
    const snapshot = table.getState();
    const originalCard = started.players[0].holeCards.cards![0];

    snapshot.players[0].holeCards.cards![0] = 999;
    snapshot.bettingRound?.actedPlayerIds.push(createPlayerId('fake'));
    const config = table.getConfig();
    config.rake!.cap = 999n;

    const fresh = table.getState();
    expect(fresh.players[0].holeCards.cards![0]).toBe(originalCard);
    expect(fresh.bettingRound?.actedPlayerIds).not.toContain(
      createPlayerId('fake')
    );
    expect(table.getConfig().rake?.cap).toBe(10n);

    let state = expectOk(
      table.applyAction(started.currentPlayerId!, { type: 'ALL_IN' })
    );
    state = expectOk(table.applyAction(state.currentPlayerId!, { type: 'CALL' }));
    expect(state.phase).toBe(TablePhase.Showdown);

    const history = table.getLastHandHistory()!;
    const historyEventCount = history.events.length;
    history.events.pop();
    expect(table.getLastHandHistory()?.events).toHaveLength(historyEventCount);

    const result = table.getLastHandResult()!;
    const resultCard = result.finalBoard[0];
    result.finalBoard[0] = 999;
    expect(table.getLastHandResult()?.finalBoard[0]).toBe(resultCard);
  });

  it('provides a player-safe state projection without leaking opponent hole cards', () => {
    const { table, first, second } = createHeadsUp(999);
    let state = expectOk(table.startHand());

    const firstView = table.getStateForPlayer(first);
    expect(firstView.players.find((player) => player.id === first)?.holeCards.cards).toBeDefined();
    expect(firstView.players.find((player) => player.id === second)?.holeCards.cards).toBeUndefined();
    expect(
      table.getStateForPlayer().players.some((player) => player.holeCards.cards)
    ).toBe(false);

    state = expectOk(table.applyAction(state.currentPlayerId!, { type: 'ALL_IN' }));
    state = expectOk(table.applyAction(state.currentPlayerId!, { type: 'CALL' }));
    expect(state.phase).toBe(TablePhase.Showdown);
    expect(
      table.getStateForPlayer().players.every((player) => player.holeCards.cards)
    ).toBe(true);
  });

  it('does not leave currentPlayerId stuck when the acting player leaves postflop', () => {
    const { table } = createHeadsUp(222);
    let state = expectOk(table.startHand());
    state = expectOk(table.applyAction(state.currentPlayerId!, { type: 'CALL' }));
    state = expectOk(table.applyAction(state.currentPlayerId!, { type: 'CHECK' }));
    expect(state.phase).toBe(TablePhase.Flop);

    const leavingPlayer = state.currentPlayerId!;
    state = expectOk(table.removePlayer(leavingPlayer));

    expect(state.phase).toBe(TablePhase.Showdown);
    expect(state.currentPlayerId).toBeUndefined();
    expect(
      state.players.find((player) => player.id === leavingPlayer)?.status
    ).toBe(PlayerStatus.SittingOut);
    expect(table.getLastHandResult()?.reason).toBe('fold');
  });

  it('allows a funded player to rebuy between completed hands', () => {
    const config = { ...createDefaultTableConfig(), rngSeed: 42 };
    const table = createTable(config, { minRebuy: 2n });
    const first = seat(table, 'first', 100n);
    seat(table, 'second', 100n);

    expectOk(table.startHand());
    foldCurrentPlayer(table);
    table.setPlayerStatus(first, PlayerStatus.SittingOut);

    const state = expectOk(table.rebuyPlayer(first, 10n));
    expect(state.players.find((player) => player.id === first)?.status).toBe(
      PlayerStatus.Active
    );
  });

  it('conserves chips through showdown plus rake', () => {
    const { table } = createHeadsUp(31415, 100n, {
      rake: { percentage: 0.05, cap: 10n },
    });
    let state = expectOk(table.startHand());
    state = expectOk(table.applyAction(state.currentPlayerId!, { type: 'ALL_IN' }));
    state = expectOk(table.applyAction(state.currentPlayerId!, { type: 'CALL' }));

    const result = table.getLastHandResult()!;
    expect(result.totalRake).toBe(10n);
    expect(totalStacks(state) + result.totalRake).toBe(200n);
    const distributionEvent = table
      .getLastHandHistory()!
      .events.find((event) => event.type === 'POT_DISTRIBUTED');
    expect(
      distributionEvent?.type === 'POT_DISTRIBUTED'
        ? distributionEvent.pots.reduce(
            (sum, pot) => sum + (pot.rake ?? 0n),
            0n
          )
        : undefined
    ).toBe(10n);
  });

  it("awards an odd Hold'em chip to the first tied winner left of the button", () => {
    const table = createTable({
      ...createDefaultTableConfig(),
      rngSeed: 5,
    });
    const p0 = seat(table, 'p0');
    const p1 = seat(table, 'p1');
    const p2 = seat(table, 'p2');

    let state = expectOk(table.startHand());
    expect(state.dealerSeat).toBe(0);
    state = expectOk(table.applyAction(p0, { type: 'CALL' }));
    state = expectOk(table.applyAction(p1, { type: 'FOLD' }));
    state = expectOk(table.applyAction(p2, { type: 'CHECK' }));

    while (state.phase !== TablePhase.Showdown) {
      state = expectOk(
        table.applyAction(state.currentPlayerId!, { type: 'CHECK' })
      );
    }

    const pot = table.getLastHandResult()!.pots[0];
    expect(pot.total).toBe(5n);
    expect(pot.winnerIds).toEqual([p2, p0]);
    expect(pot.payouts).toEqual([
      { playerId: p2, amount: 3n },
      { playerId: p0, amount: 2n },
    ]);
  });

  it('replays sparse-seat preflop order and next actor after a fold', () => {
    const table = createTable({
      ...createDefaultTableConfig(),
      maxPlayers: 4,
      rngSeed: 17,
    });
    const p0 = seat(table, 'p0');
    const removed = seat(table, 'removed');
    const p2 = seat(table, 'p2');
    const p3 = seat(table, 'p3');
    expectOk(table.removePlayer(removed));

    let state = expectOk(table.startHand());
    expect(state.players.map((player) => player.seat)).toEqual([0, 2, 3]);
    expect(state.currentPlayerId).toBe(p0);

    let replayed = replayHand(table.getCurrentHandHistory()!, table.getConfig());
    expect(replayed[replayed.length - 1].currentPlayerId).toBe(p0);

    state = expectOk(table.applyAction(p0, { type: 'CALL' }));
    expect(state.currentPlayerId).toBe(p2);
    state = expectOk(table.applyAction(p2, { type: 'FOLD' }));
    expect(state.currentPlayerId).toBe(p3);

    replayed = replayHand(table.getCurrentHandHistory()!, table.getConfig());
    expect(replayed[replayed.length - 1].currentPlayerId).toBe(p3);
  });

  it('calculates rake exactly for bigint pots above Number.MAX_SAFE_INTEGER', () => {
    const pot = 9007199254740995n;
    expect(
      calculateRake(pot, {
        percentage: 0.5,
        cap: pot,
      })
    ).toBe(4503599627370497n);
  });

  it('serializes committedAfter and replays a nominal-BB call exactly', () => {
    const config: TableConfig = {
      ...createDefaultTableConfig(),
      ante: 5n,
      rngSeed: 2026,
    };
    const table = createTable(config);
    const dealer = seat(table, 'dealer', 100n);
    seat(table, 'small-blind', 100n);
    seat(table, 'short-big-blind', 3n);

    let state = expectOk(table.startHand());
    expect(state.currentPlayerId).toBe(dealer);
    state = expectOk(table.applyAction(dealer, { type: 'CALL' }));
    expect(state.players.find((player) => player.id === dealer)?.committed).toBe(
      2n
    );

    const history = table.getCurrentHandHistory()!;
    const restored = handHistoryFromJSON(handHistoryToJSON(history));
    const action = restored.events.find((event) => event.type === 'ACTION_TAKEN');
    expect(action?.type === 'ACTION_TAKEN' ? action.committedAfter : undefined).toBe(
      2n
    );

    const replayed = replayHand(restored, config);
    const afterAction = replayed[replayed.length - 1];
    const replayedDealer = afterAction.players.find(
      (player) => player.id === dealer
    );
    expect(replayedDealer?.committed).toBe(2n);
    expect(replayedDealer?.stack).toBe(93n);
  });
});
