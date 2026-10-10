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
import {
  HandHistory,
  handHistoryFromJSON,
  handHistoryToJSON,
  replayHand,
} from '../../src/history/index.js';
import { Table, createTable } from '../../src/table/index.js';

function expectOk<T>(result: Result<T, PokerError>): T {
  expect(isOk(result)).toBe(true);
  if (!isOk(result)) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function totalChips(state: TableState): bigint {
  const stacks = state.players.reduce((sum, player) => sum + player.stack, 0n);
  if (state.phase === TablePhase.Showdown) {
    return stacks;
  }
  return stacks + state.pots.reduce((sum, pot) => sum + pot.total, 0n);
}

function createSeatedTable(stacks: bigint[]): {
  table: Table;
  players: PlayerId[];
} {
  const table = createTable({ ...createDefaultTableConfig(), rngSeed: 3 });
  const players = stacks.map((stack, index) => {
    const playerId = createPlayerId(`p${index}`);
    expectOk(table.seatPlayer(playerId, stack));
    return playerId;
  });
  return { table, players };
}

function act(
  table: Table,
  state: TableState,
  type: 'FOLD' | 'CHECK_OR_CALL' | 'ALL_IN'
): TableState {
  const current = state.currentPlayerId;
  if (current === undefined) {
    throw new Error('No current player');
  }
  if (type === 'CHECK_OR_CALL') {
    const available = getAvailableActions(state, current);
    return expectOk(
      table.applyAction(current, {
        type: available.includes('CHECK') ? 'CHECK' : 'CALL',
      })
    );
  }
  return expectOk(table.applyAction(current, { type }));
}

function playToShowdownPassively(
  table: Table,
  initial: TableState
): TableState {
  let state = initial;
  for (let step = 0; state.phase !== TablePhase.Showdown; step++) {
    expect(step).toBeLessThan(100);
    state = act(table, state, 'CHECK_OR_CALL');
  }
  return state;
}

function expectReplayStacksMatch(table: Table, state: TableState): void {
  const history = table.getLastHandHistory();
  expect(history).not.toBeNull();
  if (!history) {
    return;
  }
  const replayed = replayHand(history, history.tableConfig);
  const finalState = replayed[replayed.length - 1];
  for (const player of finalState.players) {
    expect(state.players.find((live) => live.id === player.id)?.stack).toBe(
      player.stack
    );
  }
}

function outOfTurnFolds(history: HandHistory | null): PlayerId[] {
  return (history?.events ?? []).flatMap((event) =>
    event.type === 'ACTION_TAKEN' && event.outOfTurn ? [event.playerId] : []
  );
}

function statusOf(state: TableState, playerId: PlayerId): PlayerStatus {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }
  return player.status;
}

describe('removePlayer during a hand', () => {
  it('ends the hand when only the current player stays in the hand', () => {
    const { table } = createSeatedTable([100n, 100n, 100n]);
    let state = expectOk(table.startHand());
    const chipsBefore = totalChips(state);
    state = act(table, state, 'FOLD');
    state = act(table, state, 'CHECK_OR_CALL');
    state = act(table, state, 'CHECK_OR_CALL');
    expect(state.phase).toBe(TablePhase.Flop);

    const current = state.currentPlayerId!;
    const leaving = state.players.find(
      (player) => player.status === PlayerStatus.Active && player.id !== current
    )!.id;
    state = expectOk(table.removePlayer(leaving));

    expect(state.phase).toBe(TablePhase.Showdown);
    expect(state.currentPlayerId).toBeUndefined();
    expect(statusOf(state, leaving)).toBe(PlayerStatus.SittingOut);
    expect(table.getLastHandResult()?.reason).toBe('fold');
    expect(table.getLastHandResult()?.pots[0].winnerIds).toEqual([current]);
    expect(totalChips(state)).toBe(chipsBefore);
    expect(outOfTurnFolds(table.getLastHandHistory())).toEqual([leaving]);
    expectReplayStacksMatch(table, state);
  });

  it('folds a non-current player who has chips committed on the street', () => {
    const { table } = createSeatedTable([100n, 100n, 100n]);
    let state = expectOk(table.startHand());
    const chipsBefore = totalChips(state);
    const bigBlind = state.players.find((player) => player.committed === 2n)!;

    state = expectOk(table.removePlayer(bigBlind.id));
    expect(state.phase).toBe(TablePhase.Preflop);
    expect(statusOf(state, bigBlind.id)).toBe(PlayerStatus.SittingOut);
    expect(totalChips(state)).toBe(chipsBefore);
    expect(state.pots[0].participants).not.toContain(bigBlind.id);

    state = act(table, state, 'FOLD');
    expect(state.phase).toBe(TablePhase.Showdown);
    expect(totalChips(state)).toBe(chipsBefore);
    expect(table.getLastHandResult()?.pots[0].total).toBe(3n);
    expectReplayStacksMatch(table, state);
  });

  it('keeps a removed all-in player in the hand until the hand ends', () => {
    const { table, players } = createSeatedTable([20n, 100n, 100n]);
    let state = expectOk(table.startHand());
    const chipsBefore = totalChips(state);
    expect(state.currentPlayerId).toBe(players[0]);
    state = act(table, state, 'ALL_IN');
    state = act(table, state, 'CHECK_OR_CALL');
    state = act(table, state, 'CHECK_OR_CALL');
    expect(state.phase).toBe(TablePhase.Flop);
    expect(state.currentPlayerId).not.toBe(players[0]);

    state = expectOk(table.removePlayer(players[0]));
    expect(statusOf(state, players[0])).toBe(PlayerStatus.AllIn);
    expect(state.pots[0].participants).toContain(players[0]);
    expect(totalChips(state)).toBe(chipsBefore);

    state = playToShowdownPassively(table, state);
    expect(statusOf(state, players[0])).toBe(PlayerStatus.SittingOut);
    expect(
      table.getLastHandResult()?.revealedPlayers.map((p) => p.playerId)
    ).toContain(players[0]);
    expect(totalChips(state)).toBe(chipsBefore);
    expect(outOfTurnFolds(table.getLastHandHistory())).toEqual([]);
    expectReplayStacksMatch(table, state);

    const next = expectOk(table.startHand());
    expect(statusOf(next, players[0])).toBe(PlayerStatus.SittingOut);
    expect(
      next.players.find((player) => player.id === players[0])?.holeCards.cards
    ).toBeUndefined();
  });

  it('runs out the board when the removal leaves one player who can act', () => {
    const { table, players } = createSeatedTable([20n, 100n, 100n]);
    let state = expectOk(table.startHand());
    const chipsBefore = totalChips(state);
    state = act(table, state, 'ALL_IN');
    state = act(table, state, 'CHECK_OR_CALL');
    state = act(table, state, 'CHECK_OR_CALL');
    expect(state.phase).toBe(TablePhase.Flop);

    const current = state.currentPlayerId!;
    const leaving = players.find((id) => id !== current && id !== players[0])!;
    state = expectOk(table.removePlayer(leaving));

    expect(state.phase).toBe(TablePhase.Showdown);
    expect(state.communityCards).toHaveLength(5);
    expect(table.getLastHandResult()?.reason).toBe('showdown');
    expect(statusOf(state, leaving)).toBe(PlayerStatus.SittingOut);
    expect(totalChips(state)).toBe(chipsBefore);
    expect(outOfTurnFolds(table.getLastHandHistory())).toEqual([leaving]);
    expectReplayStacksMatch(table, state);
  });

  it('gives dead chips of a removed top contributor to the remaining players', () => {
    const { table, players } = createSeatedTable([1000n, 50n, 100n]);
    let state = expectOk(table.startHand());
    expect(state.currentPlayerId).toBe(players[0]);
    state = expectOk(
      table.applyAction(players[0], { type: 'RAISE', amount: 498n })
    );

    state = expectOk(table.removePlayer(players[0]));
    expect(state.pots.every((pot) => pot.participants.length > 0)).toBe(true);
    state = act(table, state, 'CHECK_OR_CALL');
    state = act(table, state, 'CHECK_OR_CALL');

    expect(state.phase).toBe(TablePhase.Showdown);
    expect(totalChips(state)).toBe(1150n);
    expect(table.getLastHandResult()?.pots.map((pot) => pot.total)).toEqual([
      150n,
      500n,
    ]);
    expect(table.getLastHandResult()?.pots[1].winnerIds).toEqual([players[2]]);
    expectReplayStacksMatch(table, state);
  });

  it('keeps the current player in replay and in serialized history', () => {
    const { table, players } = createSeatedTable([100n, 100n, 100n, 100n]);
    let state = expectOk(table.startHand());
    for (let i = 0; i < 4; i++) {
      state = act(table, state, 'CHECK_OR_CALL');
    }
    expect(state.phase).toBe(TablePhase.Flop);

    const current = state.currentPlayerId!;
    const leaving = players.find(
      (id) => id !== current && statusOf(state, id) === PlayerStatus.Active
    )!;
    state = expectOk(table.removePlayer(leaving));
    expect(state.phase).toBe(TablePhase.Flop);
    expect(state.currentPlayerId).toBe(current);

    const history = table.getCurrentHandHistory();
    expect(outOfTurnFolds(history)).toEqual([leaving]);
    const replayed = replayHand(history!, history!.tableConfig);
    expect(replayed[replayed.length - 1].currentPlayerId).toBe(current);
    expect(
      outOfTurnFolds(handHistoryFromJSON(handHistoryToJSON(history!)))
    ).toEqual([leaving]);

    state = playToShowdownPassively(table, state);
    expectReplayStacksMatch(table, state);
  });

  it('folds the current player even with chips committed on the street', () => {
    const { table } = createSeatedTable([100n, 100n, 100n]);
    let state = expectOk(table.startHand());
    const chipsBefore = totalChips(state);
    state = act(table, state, 'CHECK_OR_CALL');
    const current = state.currentPlayerId!;
    expect(
      state.players.find((player) => player.id === current)?.committed
    ).toBeGreaterThan(0n);

    state = expectOk(table.removePlayer(current));
    expect(statusOf(state, current)).toBe(PlayerStatus.SittingOut);
    expect(state.currentPlayerId).not.toBe(current);
    expect(totalChips(state)).toBe(chipsBefore);
    expect(outOfTurnFolds(table.getCurrentHandHistory())).toEqual([]);

    state = playToShowdownPassively(table, state);
    expect(totalChips(state)).toBe(chipsBefore);
    expectReplayStacksMatch(table, state);
  });
});
