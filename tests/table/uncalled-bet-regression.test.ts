import { describe, expect, it } from 'vitest';
import { Table, createTable } from '../../src/table/index.js';
import {
  PlayerId,
  PlayerStatus,
  TableConfig,
  TablePhase,
  TableState,
  createDefaultTableConfig,
  createPlayerId,
} from '../../src/core/table.js';
import { ChipAmount } from '../../src/core/money.js';
import { isOk } from '../../src/core/result.js';
import { replayHand } from '../../src/history/replay.js';
import {
  handHistoryFromJSON,
  handHistoryToJSON,
} from '../../src/history/hand-history.js';

function expectState(result: ReturnType<Table['applyAction']>): TableState {
  expect(isOk(result)).toBe(true);
  if (!isOk(result)) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function createSeededTable(
  stacks: [string, bigint][],
  config: TableConfig = createDefaultTableConfig()
): {
  table: Table;
  ids: PlayerId[];
} {
  const table = createTable({ ...config, rngSeed: 404 });
  const ids = stacks.map(([name, stack]) => {
    const id = createPlayerId(name);
    expect(isOk(table.seatPlayer(id, stack))).toBe(true);
    return id;
  });
  return { table, ids };
}

function sumStacks(state: TableState): ChipAmount {
  return state.players.reduce((sum, player) => sum + player.stack, 0n);
}

function uncalledEvents(table: Table): unknown[] {
  return table
    .getLastHandHistory()!
    .events.filter((event) => event.type === 'UNCALLED_BET_RETURNED')
    .map((event) => ({ ...event, timestamp: 0 }));
}

function eventTypes(table: Table): string[] {
  return table.getLastHandHistory()!.events.map((event) => event.type);
}

function expectReplayStacks(table: Table): void {
  const history = table.getLastHandHistory()!;
  const states = replayHand(history, history.tableConfig);
  const afterPayout = states[states.length - 2];
  for (const player of table.getState().players) {
    expect(afterPayout.players.find((p) => p.id === player.id)?.stack).toBe(
      player.stack
    );
  }
}

describe('uncalled bet regression', () => {
  it('heads-up: an all-in call for less returns the unmatched raise', () => {
    const {
      table,
      ids: [deep, short],
    } = createSeededTable([
      ['deep', 1000n],
      ['short', 50n],
    ]);

    let state = expectState(table.startHand());
    expect(state.currentPlayerId).toBe(deep);
    state = expectState(
      table.applyAction(deep, { type: 'RAISE', amount: 198n })
    );
    state = expectState(table.applyAction(short, { type: 'ALL_IN' }));
    expect(state.phase).toBe(TablePhase.Showdown);

    const result = table.getLastHandResult()!;
    expect(result.pots.map((pot) => pot.total)).toEqual([100n]);
    expect(result.pots[0].payouts.reduce((s, p) => s + p.amount, 0n)).toBe(
      100n
    );
    expect(uncalledEvents(table)).toEqual([
      {
        type: 'UNCALLED_BET_RETURNED',
        timestamp: 0,
        playerId: deep,
        amount: 150n,
      },
    ]);
    const types = eventTypes(table);
    expect(types.indexOf('UNCALLED_BET_RETURNED')).toBeLessThan(
      types.indexOf('STREET_ENDED')
    );
    expect(sumStacks(state)).toBe(1050n);
    const deepStack = state.players.find((p) => p.id === deep)!.stack;
    expect([950n, 1050n]).toContain(deepStack);
    expectReplayStacks(table);
  });

  it('heads-up: an all-in bettor who gets chips back is active again', () => {
    const {
      table,
      ids: [deep, short],
    } = createSeededTable([
      ['deep', 1000n],
      ['short', 50n],
    ]);

    expectState(table.startHand());
    expectState(table.applyAction(deep, { type: 'ALL_IN' }));
    const state = expectState(table.applyAction(short, { type: 'CALL' }));
    expect(state.phase).toBe(TablePhase.Showdown);

    expect(uncalledEvents(table)).toEqual([
      {
        type: 'UNCALLED_BET_RETURNED',
        timestamp: 0,
        playerId: deep,
        amount: 950n,
      },
    ]);
    expect(state.players.find((p) => p.id === deep)!.status).toBe(
      PlayerStatus.Active
    );
    expect(table.getLastHandResult()!.pots.map((pot) => pot.total)).toEqual([
      100n,
    ]);
    expectReplayStacks(table);
  });

  it('3-way: a short all-in and a fold return the raise above the all-in', () => {
    const {
      table,
      ids: [a, b, c],
    } = createSeededTable([
      ['a', 1000n],
      ['b', 1000n],
      ['c', 30n],
    ]);

    let state = expectState(table.startHand());
    expect(state.currentPlayerId).toBe(a);
    state = expectState(table.applyAction(a, { type: 'RAISE', amount: 98n }));
    state = expectState(table.applyAction(b, { type: 'FOLD' }));
    state = expectState(table.applyAction(c, { type: 'ALL_IN' }));
    expect(state.phase).toBe(TablePhase.Showdown);

    const result = table.getLastHandResult()!;
    expect(result.pots.map((pot) => pot.total)).toEqual([3n, 58n]);
    expect(uncalledEvents(table)).toEqual([
      {
        type: 'UNCALLED_BET_RETURNED',
        timestamp: 0,
        playerId: a,
        amount: 70n,
      },
    ]);
    expect(sumStacks(state)).toBe(2030n);
    expect(state.players.find((p) => p.id === b)!.stack).toBe(999n);
    expectReplayStacks(table);
  });

  it('fold win: the bet nobody called is not part of the pot', () => {
    const {
      table,
      ids: [sb, bb],
    } = createSeededTable([
      ['sb', 1000n],
      ['bb', 1000n],
    ]);

    expectState(table.startHand());
    expectState(table.applyAction(sb, { type: 'RAISE', amount: 8n }));
    const state = expectState(table.applyAction(bb, { type: 'FOLD' }));
    expect(state.phase).toBe(TablePhase.Showdown);

    const result = table.getLastHandResult()!;
    expect(result.reason).toBe('fold');
    expect(result.pots).toEqual([
      {
        potIndex: 0,
        total: 4n,
        winnerIds: [sb],
        payouts: [{ playerId: sb, amount: 4n }],
        rake: 0n,
      },
    ]);
    expect(uncalledEvents(table)).toEqual([
      {
        type: 'UNCALLED_BET_RETURNED',
        timestamp: 0,
        playerId: sb,
        amount: 8n,
      },
    ]);
    const types = eventTypes(table);
    expect(types.indexOf('UNCALLED_BET_RETURNED')).toBeLessThan(
      types.indexOf('POT_DISTRIBUTED')
    );
    const winner = state.players.find((p) => p.id === sb)!;
    expect(winner.stack).toBe(1002n);
    expect(winner.committed).toBe(2n);
    expect(state.players.find((p) => p.id === bb)!.stack).toBe(998n);
    expectReplayStacks(table);
  });

  it('forced bets: the big blind gets back what a short small blind cannot match', () => {
    const {
      table,
      ids: [short, deep],
    } = createSeededTable(
      [
        ['short', 10n],
        ['deep', 1000n],
      ],
      { ...createDefaultTableConfig(), smallBlind: 5n, bigBlind: 10n, ante: 5n }
    );

    const state = expectState(table.startHand());
    expect(state.phase).toBe(TablePhase.Showdown);
    expect(table.getLastHandResult()!.pots.map((pot) => pot.total)).toEqual([
      20n,
    ]);
    expect(uncalledEvents(table)).toEqual([
      {
        type: 'UNCALLED_BET_RETURNED',
        timestamp: 0,
        playerId: deep,
        amount: 5n,
      },
    ]);
    expect(sumStacks(state)).toBe(1010n);
    expect([990n, 1010n]).toContain(
      state.players.find((p) => p.id === deep)!.stack
    );
    expect(state.players.find((p) => p.id === short)).toBeDefined();
    expectReplayStacks(table);
  });

  it('forced bets: an unmatched ante above the live wager is also returned', () => {
    const {
      table,
      ids: [short, deep],
    } = createSeededTable(
      [
        ['short', 10n],
        ['deep', 1000n],
      ],
      {
        ...createDefaultTableConfig(),
        smallBlind: 5n,
        bigBlind: 10n,
        ante: 20n,
      }
    );

    const state = expectState(table.startHand());
    expect(state.phase).toBe(TablePhase.Showdown);
    expect(table.getLastHandResult()!.pots.map((pot) => pot.total)).toEqual([
      20n,
    ]);
    expect(uncalledEvents(table)).toEqual([
      {
        type: 'UNCALLED_BET_RETURNED',
        timestamp: 0,
        playerId: deep,
        amount: 20n,
      },
    ]);
    expect(sumStacks(state)).toBe(1010n);
    expect(state.players.find((p) => p.id === short)).toBeDefined();
    expectReplayStacks(table);
  });

  it('keeps the returned event through a JSON round trip', () => {
    const {
      table,
      ids: [sb, bb],
    } = createSeededTable([
      ['sb', 1000n],
      ['bb', 1000n],
    ]);

    expectState(table.startHand());
    expectState(table.applyAction(sb, { type: 'RAISE', amount: 8n }));
    expectState(table.applyAction(bb, { type: 'FOLD' }));

    const history = table.getLastHandHistory()!;
    const restored = handHistoryFromJSON(handHistoryToJSON(history));
    expect(restored.events).toEqual(history.events);
    expect(restored.events.map((event) => event.type)).toContain(
      'UNCALLED_BET_RETURNED'
    );
  });
});
