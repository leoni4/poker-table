import { describe, expect, it } from 'vitest';
import {
  Table,
  createTable,
} from '../../src/table/index.js';
import {
  PlayerId,
  PlayerState,
  PlayerStatus,
  TableState,
  TablePhase,
  createDefaultTableConfig,
  createPlayerId,
} from '../../src/core/table.js';
import { chips } from '../../src/core/money.js';
import { isOk } from '../../src/core/result.js';

function expectOk<T>(
  result: ReturnType<Table['applyAction']>
): T {
  expect(isOk(result)).toBe(true);
  if (!isOk(result)) {
    throw new Error(result.error.message);
  }
  return result.value as T;
}

function createHeadsUpTable(
  firstStack = chips(1000),
  secondStack = chips(1000),
  seed = 20260816
): {
  table: Table;
  first: PlayerId;
  second: PlayerId;
} {
  const config = createDefaultTableConfig();
  config.rngSeed = seed;

  const table = createTable(config);
  const first = createPlayerId('first');
  const second = createPlayerId('second');

  expect(isOk(table.seatPlayer(first, firstStack))).toBe(true);
  expect(isOk(table.seatPlayer(second, secondStack))).toBe(true);

  return { table, first, second };
}

function getDealerAndBigBlind(state: TableState): {
  dealer: PlayerState;
  bigBlind: PlayerState;
} {
  const dealer = state.players.find((p) => p.seat === state.dealerSeat);
  expect(dealer).toBeDefined();

  const bigBlind = state.players.find((p) => p.id !== dealer!.id);
  expect(bigBlind).toBeDefined();

  return { dealer: dealer!, bigBlind: bigBlind! };
}

function advanceHeadsUpToFlop(table: Table): {
  state: TableState;
  dealer: PlayerState;
  bigBlind: PlayerState;
} {
  let state = expectOk<ReturnType<Table['getState']>>(table.startHand());
  const { dealer, bigBlind } = getDealerAndBigBlind(state);

  expect(state.currentPlayerId).toBe(dealer.id);

  state = expectOk<ReturnType<Table['getState']>>(
    table.applyAction(dealer.id, { type: 'CALL' })
  );

  expect(state.phase).toBe(TablePhase.Preflop);
  expect(state.currentPlayerId).toBe(bigBlind.id);

  state = expectOk<ReturnType<Table['getState']>>(
    table.applyAction(bigBlind.id, { type: 'CHECK' })
  );

  expect(state.phase).toBe(TablePhase.Flop);
  expect(state.communityCards).toHaveLength(3);
  expect(state.currentPlayerId).toBe(bigBlind.id);

  return { state, dealer, bigBlind };
}

describe('heads-up betting-round regression', () => {
  it('keeps HU blind posting and preflop action order correct', () => {
    const { table } = createHeadsUpTable();
    const state = expectOk<ReturnType<Table['getState']>>(table.startHand());
    const { dealer, bigBlind } = getDealerAndBigBlind(state);

    expect(dealer.committed).toBe(1n);
    expect(bigBlind.committed).toBe(2n);
    expect(state.currentPlayerId).toBe(dealer.id);
    expect(state.bettingRound).toEqual({
      street: TablePhase.Preflop,
      currentBet: 2n,
      lastRaiseSize: 2n,
      actedPlayerIds: [],
    });
  });

  it('advances HU preflop only after SB call and BB check', () => {
    const { table } = createHeadsUpTable();
    const { state, bigBlind } = advanceHeadsUpToFlop(table);

    expect(state.phase).toBe(TablePhase.Flop);
    expect(state.communityCards).toHaveLength(3);
    expect(state.currentPlayerId).toBe(bigBlind.id);
  });

  it('does not advance the flop after the first check', () => {
    const { table } = createHeadsUpTable();
    const { state: flopState, dealer, bigBlind } =
      advanceHeadsUpToFlop(table);

    expect(flopState.currentPlayerId).toBe(bigBlind.id);

    const afterFirstCheck = expectOk<ReturnType<Table['getState']>>(
      table.applyAction(bigBlind.id, { type: 'CHECK' })
    );

    expect(afterFirstCheck.phase).toBe(TablePhase.Flop);
    expect(afterFirstCheck.communityCards).toHaveLength(3);
    expect(afterFirstCheck.currentPlayerId).toBe(dealer.id);
    expect(afterFirstCheck.bettingRound?.actedPlayerIds).toEqual([
      bigBlind.id,
    ]);
  });

  it('advances only after postflop check/check', () => {
    const { table } = createHeadsUpTable();
    const { dealer, bigBlind } = advanceHeadsUpToFlop(table);

    let state = expectOk<ReturnType<Table['getState']>>(
      table.applyAction(bigBlind.id, { type: 'CHECK' })
    );
    state = expectOk<ReturnType<Table['getState']>>(
      table.applyAction(dealer.id, { type: 'CHECK' })
    );

    expect(state.phase).toBe(TablePhase.Turn);
    expect(state.communityCards).toHaveLength(4);
    expect(state.currentPlayerId).toBe(bigBlind.id);
    expect(state.bettingRound?.street).toBe(TablePhase.Turn);
    expect(state.bettingRound?.actedPlayerIds).toEqual([]);
  });

  it('advances after postflop bet/call', () => {
    const { table } = createHeadsUpTable();
    const { dealer, bigBlind } = advanceHeadsUpToFlop(table);

    let state = expectOk<ReturnType<Table['getState']>>(
      table.applyAction(bigBlind.id, { type: 'BET', amount: chips(4) })
    );

    expect(state.phase).toBe(TablePhase.Flop);
    expect(state.currentPlayerId).toBe(dealer.id);

    state = expectOk<ReturnType<Table['getState']>>(
      table.applyAction(dealer.id, { type: 'CALL' })
    );

    expect(state.phase).toBe(TablePhase.Turn);
    expect(state.communityCards).toHaveLength(4);
  });

  it('ends and pays the hand after postflop bet/fold', () => {
    const { table } = createHeadsUpTable(chips(100), chips(100));
    const { dealer, bigBlind } = advanceHeadsUpToFlop(table);

    let state = expectOk<ReturnType<Table['getState']>>(
      table.applyAction(bigBlind.id, { type: 'BET', amount: chips(10) })
    );
    state = expectOk<ReturnType<Table['getState']>>(
      table.applyAction(dealer.id, { type: 'FOLD' })
    );

    expect(state.phase).toBe(TablePhase.Showdown);
    expect(state.currentPlayerId).toBeUndefined();
    expect(
      state.players.find((p) => p.id === bigBlind.id)?.status
    ).toBe(PlayerStatus.Active);
    expect(
      state.players.reduce((sum, player) => sum + player.stack, 0n)
    ).toBe(200n);
  });

  it('advances after a preflop raise/call', () => {
    const { table } = createHeadsUpTable();
    let state = expectOk<ReturnType<Table['getState']>>(table.startHand());
    const { dealer, bigBlind } = getDealerAndBigBlind(state);

    state = expectOk<ReturnType<Table['getState']>>(
      table.applyAction(dealer.id, { type: 'RAISE', amount: chips(2) })
    );

    expect(state.phase).toBe(TablePhase.Preflop);
    expect(state.players.find((p) => p.id === dealer.id)?.committed).toBe(4n);
    expect(state.currentPlayerId).toBe(bigBlind.id);

    state = expectOk<ReturnType<Table['getState']>>(
      table.applyAction(bigBlind.id, { type: 'CALL' })
    );

    expect(state.phase).toBe(TablePhase.Flop);
    expect(state.communityCards).toHaveLength(3);
  });

  it('runs the board to five cards and settles an all-in/call', () => {
    const { table } = createHeadsUpTable(chips(100), chips(100), 9001);
    let state = expectOk<ReturnType<Table['getState']>>(table.startHand());
    const { dealer, bigBlind } = getDealerAndBigBlind(state);

    state = expectOk<ReturnType<Table['getState']>>(
      table.applyAction(dealer.id, { type: 'ALL_IN' })
    );

    expect(state.phase).toBe(TablePhase.Preflop);
    expect(state.currentPlayerId).toBe(bigBlind.id);

    state = expectOk<ReturnType<Table['getState']>>(
      table.applyAction(bigBlind.id, { type: 'CALL' })
    );

    expect(state.phase).toBe(TablePhase.Showdown);
    expect(state.currentPlayerId).toBeUndefined();
    expect(state.communityCards).toHaveLength(5);
    expect(state.pots.reduce((sum, pot) => sum + pot.total, 0n)).toBe(200n);
    expect(
      state.players.reduce((sum, player) => sum + player.stack, 0n)
    ).toBe(200n);
  });

  it('constructs and settles side pots when three players are all-in', () => {
    const config = createDefaultTableConfig();
    config.rngSeed = 9002;
    config.maxPlayers = 3;

    const table = createTable(config);
    const p0 = createPlayerId('p0');
    const p1 = createPlayerId('p1');
    const p2 = createPlayerId('p2');

    expect(isOk(table.seatPlayer(p0, chips(20)))).toBe(true);
    expect(isOk(table.seatPlayer(p1, chips(50)))).toBe(true);
    expect(isOk(table.seatPlayer(p2, chips(100)))).toBe(true);

    let state = expectOk<ReturnType<Table['getState']>>(table.startHand());

    for (let i = 0; i < 3; i++) {
      expect(state.currentPlayerId).toBeDefined();
      state = expectOk<ReturnType<Table['getState']>>(
        table.applyAction(state.currentPlayerId!, { type: 'ALL_IN' })
      );
    }

    expect(state.phase).toBe(TablePhase.Showdown);
    expect(state.communityCards).toHaveLength(5);
    expect(state.pots.map((pot) => pot.total)).toEqual([60n, 60n, 50n]);
    expect(
      state.players.reduce((sum, player) => sum + player.stack, 0n)
    ).toBe(170n);
  });
});
