import { describe, expect, it } from 'vitest';
import {
  PlayerId,
  PlayerStatus,
  TablePhase,
  TableState,
  createDefaultTableConfig,
  createPlayerId,
} from '../../src/core/table.js';
import { PokerError } from '../../src/core/errors.js';
import { Result, isOk } from '../../src/core/result.js';
import { getAvailableActions } from '../../src/betting/index.js';
import { RebuyOptions, Table, createTable } from '../../src/table/index.js';

function expectOk<T>(result: Result<T, PokerError>): T {
  expect(isOk(result)).toBe(true);
  if (!isOk(result)) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function totalStacks(state: TableState): bigint {
  return state.players.reduce((sum, player) => sum + player.stack, 0n);
}

function totalChips(state: TableState): bigint {
  return (
    state.players.reduce((sum, player) => sum + player.stack, 0n) +
    state.pots.reduce((sum, pot) => sum + pot.total, 0n)
  );
}

function createSeatedTable(
  ids: string[],
  stack = 100n,
  rebuyOptions: RebuyOptions = {}
): { table: Table; players: PlayerId[] } {
  const table = createTable(
    { ...createDefaultTableConfig(), rngSeed: 1 },
    rebuyOptions
  );
  const players = ids.map((id) => {
    const playerId = createPlayerId(id);
    expectOk(table.seatPlayer(playerId, stack));
    return playerId;
  });
  return { table, players };
}

function playToShowdownPassively(
  table: Table,
  initial: TableState,
  late: PlayerId
): TableState {
  let state = initial;
  for (let step = 0; state.phase !== TablePhase.Showdown; step++) {
    expect(step).toBeLessThan(100);
    const current = state.currentPlayerId;
    expect(current).toBeDefined();
    if (current === undefined) {
      throw new Error('No current player');
    }
    expect(current).not.toBe(late);
    const available = getAvailableActions(state, current);
    const type = available.includes('CHECK') ? 'CHECK' : 'CALL';
    state = expectOk(table.applyAction(current, { type }));
  }
  return state;
}

describe('players who join during a hand wait for the next hand', () => {
  it('seats a player during a hand as sitting out and deals them in next hand', () => {
    const { table } = createSeatedTable(['a', 'b']);
    const started = expectOk(table.startHand());
    const chipsBefore = totalChips(started) + 500n;

    const late = createPlayerId('late');
    const seated = expectOk(table.seatPlayer(late, 500n));
    const latePlayer = seated.players.find((player) => player.id === late);
    expect(latePlayer?.status).toBe(PlayerStatus.SittingOut);
    expect(latePlayer?.holeCards.cards).toBeUndefined();
    expect(getAvailableActions(seated, late)).toEqual([]);
    expect(isOk(table.applyAction(late, { type: 'ALL_IN' }))).toBe(false);

    const finished = playToShowdownPassively(table, seated, late);
    expect(totalStacks(finished)).toBe(chipsBefore);
    expect(finished.players.find((player) => player.id === late)?.stack).toBe(
      500n
    );

    const next = expectOk(table.startHand());
    const lateNext = next.players.find((player) => player.id === late);
    expect(lateNext?.status).toBe(PlayerStatus.Active);
    expect(lateNext?.holeCards.cards).toHaveLength(2);
    const handStarted = table
      .getCurrentHandHistory()
      ?.events.find((event) => event.type === 'HAND_STARTED');
    expect(
      handStarted?.type === 'HAND_STARTED' &&
        handStarted.players.some((player) => player.id === late)
    ).toBe(true);
  });

  it('starts the next hand when the only opponent left and a late player waits', () => {
    const { table, players } = createSeatedTable(['a', 'b']);
    const started = expectOk(table.startHand());
    const late = createPlayerId('late');
    playToShowdownPassively(
      table,
      expectOk(table.seatPlayer(late, 100n)),
      late
    );
    expect(started.handId).toBe(1);

    expectOk(table.removePlayer(players[1]));
    const next = expectOk(table.startHand());
    expect(next.phase).toBe(TablePhase.Preflop);
    expect(next.players.map((player) => [player.id, player.status])).toEqual([
      [players[0], PlayerStatus.Active],
      [late, PlayerStatus.Active],
    ]);
    expect(next.currentPlayerId).toBeDefined();
  });

  it('does not let a sitting-out player act after a rebuy during a hand', () => {
    const { table, players } = createSeatedTable(['a', 'b', 'c'], 100n, {
      allowDuringHand: true,
    });
    const waiting = players[2];
    table.setPlayerStatus(waiting, PlayerStatus.SittingOut);
    const started = expectOk(table.startHand());
    const chipsBefore = totalChips(started) + 200n;

    const rebought = expectOk(table.rebuyPlayer(waiting, 200n));
    const waitingPlayer = rebought.players.find(
      (player) => player.id === waiting
    );
    expect(waitingPlayer?.status).toBe(PlayerStatus.SittingOut);
    expect(waitingPlayer?.stack).toBe(300n);

    const finished = playToShowdownPassively(table, rebought, waiting);
    expect(totalStacks(finished)).toBe(chipsBefore);

    const next = expectOk(table.startHand());
    const waitingNext = next.players.find((player) => player.id === waiting);
    expect(waitingNext?.status).toBe(PlayerStatus.Active);
    expect(waitingNext?.holeCards.cards).toHaveLength(2);
  });

  it('keeps the status of a player in the hand who rebuys during the hand', () => {
    const { table, players } = createSeatedTable(['a', 'b', 'c'], 100n, {
      allowDuringHand: true,
    });
    let state = expectOk(table.startHand());
    const current = state.currentPlayerId;
    if (current === undefined) {
      throw new Error('No current player');
    }
    state = expectOk(table.applyAction(current, { type: 'ALL_IN' }));
    const other = players.find(
      (player) => player !== current && player !== state.currentPlayerId
    );
    if (other === undefined) {
      throw new Error('No other player');
    }

    const allInAfter = expectOk(table.rebuyPlayer(current, 50n));
    const allInPlayer = allInAfter.players.find(
      (player) => player.id === current
    );
    expect(allInPlayer?.status).toBe(PlayerStatus.AllIn);
    expect(allInPlayer?.stack).toBe(50n);

    const activeAfter = expectOk(table.rebuyPlayer(other, 50n));
    const activePlayer = activeAfter.players.find(
      (player) => player.id === other
    );
    expect(activePlayer?.status).toBe(PlayerStatus.Active);
    expect(activePlayer?.stack).toBeGreaterThan(50n);
  });

  it('does not activate a waiting player who leaves during the hand', () => {
    const { table } = createSeatedTable(['a', 'b']);
    expectOk(table.startHand());
    const late = createPlayerId('late');
    expectOk(table.seatPlayer(late, 100n));
    playToShowdownPassively(table, expectOk(table.removePlayer(late)), late);

    const next = expectOk(table.startHand());
    expect(next.players.find((player) => player.id === late)?.status).toBe(
      PlayerStatus.SittingOut
    );
  });
});
