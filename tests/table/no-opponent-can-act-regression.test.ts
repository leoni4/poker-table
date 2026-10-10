import { describe, expect, it } from 'vitest';
import { Table, createTable } from '../../src/table/index.js';
import {
  PlayerId,
  TablePhase,
  TableState,
  createDefaultTableConfig,
  createPlayerId,
} from '../../src/core/table.js';
import { ErrorCode } from '../../src/core/errors.js';
import { getAvailableActions } from '../../src/betting/actions.js';
import { isErr, isOk } from '../../src/core/result.js';

function expectState(result: ReturnType<Table['applyAction']>): TableState {
  expect(isOk(result)).toBe(true);
  if (!isOk(result)) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function createSeededTable(stacks: [string, bigint][]): {
  table: Table;
  ids: PlayerId[];
} {
  const config = createDefaultTableConfig();
  config.rngSeed = 404;
  const table = createTable(config);
  const ids = stacks.map(([name, stack]) => {
    const id = createPlayerId(name);
    expect(isOk(table.seatPlayer(id, stack))).toBe(true);
    return id;
  });
  return { table, ids };
}

function expectInvalidAction(result: ReturnType<Table['applyAction']>): void {
  expect(isErr(result)).toBe(true);
  if (isErr(result)) {
    expect(result.error.code).toBe(ErrorCode.INVALID_ACTION);
  }
}

describe('no raise when no opponent can act regression', () => {
  it('heads-up: the player facing an all-in can only fold or call', () => {
    const {
      table,
      ids: [short, deep],
    } = createSeededTable([
      ['short', 50n],
      ['deep', 1000n],
    ]);

    let state = expectState(table.startHand());
    expect(state.currentPlayerId).toBe(short);

    state = expectState(table.applyAction(short, { type: 'ALL_IN' }));
    expect(state.currentPlayerId).toBe(deep);
    expect(getAvailableActions(table.getState(), deep)).toEqual([
      'FOLD',
      'CALL',
    ]);

    expectInvalidAction(
      table.applyAction(deep, { type: 'RAISE', amount: 500n })
    );
    expectInvalidAction(table.applyAction(deep, { type: 'ALL_IN' }));
    expect(table.getState().currentPlayerId).toBe(deep);

    state = expectState(table.applyAction(deep, { type: 'CALL' }));
    expect(state.phase).toBe(TablePhase.Showdown);

    const result = table.getLastHandResult();
    expect(result).not.toBeNull();
    expect(result!.pots.map((pot) => pot.total)).toEqual([100n]);
    const totalStacks = table
      .getState()
      .players.reduce((sum, player) => sum + player.stack, 0n);
    expect(totalStacks).toBe(1050n);
  });

  it('3-way: the big blind facing two all-ins cannot raise', () => {
    const {
      table,
      ids: [shortA, shortB, deep],
    } = createSeededTable([
      ['shortA', 40n],
      ['shortB', 80n],
      ['deep', 1000n],
    ]);

    let state = expectState(table.startHand());
    expect(state.currentPlayerId).toBe(shortA);

    state = expectState(table.applyAction(shortA, { type: 'ALL_IN' }));
    expect(state.currentPlayerId).toBe(shortB);
    expect(getAvailableActions(table.getState(), shortB)).toContain('ALL_IN');

    state = expectState(table.applyAction(shortB, { type: 'ALL_IN' }));
    expect(state.currentPlayerId).toBe(deep);
    expect(getAvailableActions(table.getState(), deep)).toEqual([
      'FOLD',
      'CALL',
    ]);
    expectInvalidAction(
      table.applyAction(deep, { type: 'RAISE', amount: 100n })
    );

    state = expectState(table.applyAction(deep, { type: 'CALL' }));
    expect(state.phase).toBe(TablePhase.Showdown);
    expect(table.getLastHandResult()!.pots.map((pot) => pot.total)).toEqual([
      120n,
      80n,
    ]);
  });
});
