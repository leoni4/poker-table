import { describe, it, expect } from 'vitest';
import {
  HoldemTable,
  Table,
  createTable,
  createHoldemTable,
  createPlayerId,
  getAvailableActions,
  getCallAmount,
  getMinimumRaiseSize,
  ErrorCode,
  TablePhase,
  PlayerAction,
  PlayerId,
  TableConfig,
  TableOptions,
  TableState,
  PokerError,
  Result,
} from '../../src/index.js';

const TABLES = 16;
const HANDS_PER_TABLE = 30;
const MAX_ACTIONS_PER_HAND = 500;
const SIDE_BY_SIDE_TIMEOUT_MS = 60_000;

function createRandom(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function configFor(tableIndex: number): TableConfig {
  return {
    minPlayers: 2,
    maxPlayers: 9,
    smallBlind: 1n,
    bigBlind: 2n,
    ante: tableIndex % 3 === 0 ? 1n : undefined,
    straddle: tableIndex % 4 === 1 ? 4n : undefined,
    rake:
      tableIndex % 2 === 0
        ? { percentage: 5, cap: 3n, noFlopNoDrop: true }
        : undefined,
    rngSeed: 1000 + tableIndex,
  };
}

function pickAction(state: TableState, random: () => number): PlayerAction {
  const playerId = state.currentPlayerId!;
  const legal = getAvailableActions(state, playerId);
  const type = legal[Math.floor(random() * legal.length)];
  const stack = state.players.find((p) => p.id === playerId)!.stack;
  if (type === 'BET') {
    const extra = BigInt(Math.floor(random() * 8));
    const amount = state.bettingRound!.minimumBet + extra;
    return { type, amount: amount > stack ? stack : amount };
  }
  if (type === 'RAISE') {
    const minRaise = getMinimumRaiseSize(state);
    const room = stack - getCallAmount(state, playerId);
    const amount = minRaise + BigInt(Math.floor(random() * 6));
    return { type, amount: amount > room ? room : amount };
  }
  return { type };
}

type StateResult = Result<TableState, PokerError>;
type VoidResult = Result<void, PokerError>;

/**
 * Plays the same seeded sequence on three tables:
 * - `full`: default options, snapshot API;
 * - `noHistory`: `recordHistory: false`, snapshot API;
 * - `training`: `recordHistory: false`, snapshot-free API.
 */
class SideBySide {
  readonly full: HoldemTable;
  readonly noHistory: HoldemTable;
  readonly training: HoldemTable;

  constructor(config: TableConfig) {
    const options: TableOptions = { recordHistory: false };
    this.full = new HoldemTable(config, { allowDuringHand: true });
    this.noHistory = new HoldemTable(
      config,
      { allowDuringHand: true },
      options
    );
    this.training = createHoldemTable(
      config,
      { allowDuringHand: true },
      options
    );
  }

  expectSameResults(
    fullResult: StateResult,
    noHistoryResult: StateResult,
    trainingResult: VoidResult
  ): void {
    expect(noHistoryResult).toStrictEqual(fullResult);
    if (fullResult.ok) {
      expect(trainingResult).toStrictEqual({ ok: true, value: undefined });
    } else {
      expect(trainingResult).toStrictEqual(fullResult);
    }
    this.expectSameView();
  }

  expectSameView(): void {
    const state = this.full.getState();
    expect(this.noHistory.getState()).toStrictEqual(state);
    expect(this.training.getState()).toStrictEqual(state);
    for (const player of state.players) {
      expect(this.training.getStateForPlayer(player.id)).toStrictEqual(
        this.full.getStateForPlayer(player.id)
      );
    }
    expect(this.training.getStateForPlayer()).toStrictEqual(
      this.full.getStateForPlayer()
    );
    expect(this.training.getLastHandResult()).toStrictEqual(
      this.full.getLastHandResult()
    );
    expect(this.noHistory.getLastHandResult()).toStrictEqual(
      this.full.getLastHandResult()
    );

    const currentPlayerId = state.currentPlayerId;
    expect(this.training.getCurrentPlayerId()).toBe(currentPlayerId);
    expect(this.training.getPhase()).toBe(state.phase);
    expect(this.training.getAvailableActions()).toStrictEqual(
      currentPlayerId === undefined
        ? []
        : getAvailableActions(state, currentPlayerId)
    );
    expect(this.training.getCallAmount()).toBe(
      currentPlayerId === undefined ? 0n : getCallAmount(state, currentPlayerId)
    );
    expect(this.training.getMinimumRaiseSize()).toBe(
      getMinimumRaiseSize(state)
    );

    expect(this.noHistory.getCurrentHandHistory()).toBeNull();
    expect(this.noHistory.getLastHandHistory()).toBeNull();
    expect(this.training.getCurrentHandHistory()).toBeNull();
    expect(this.training.getLastHandHistory()).toBeNull();
  }

  startHand(): void {
    this.expectSameResults(
      this.full.startHand(),
      this.noHistory.startHand(),
      this.training.dealHand()
    );
  }

  act(playerId: PlayerId, action: PlayerAction): void {
    this.expectSameResults(
      this.full.applyAction(playerId, action),
      this.noHistory.applyAction(playerId, action),
      this.training.act(playerId, action)
    );
  }

  seat(playerId: PlayerId, amount: bigint): void {
    const fullResult = this.full.seatPlayer(playerId, amount);
    expect(this.noHistory.seatPlayer(playerId, amount)).toStrictEqual(
      fullResult
    );
    expect(this.training.seatPlayer(playerId, amount)).toStrictEqual(
      fullResult
    );
    this.expectSameView();
  }

  rebuy(playerId: PlayerId, amount: bigint): void {
    const fullResult = this.full.rebuyPlayer(playerId, amount);
    expect(this.noHistory.rebuyPlayer(playerId, amount)).toStrictEqual(
      fullResult
    );
    expect(this.training.rebuyPlayer(playerId, amount)).toStrictEqual(
      fullResult
    );
    this.expectSameView();
  }

  remove(playerId: PlayerId): void {
    const fullResult = this.full.removePlayer(playerId);
    expect(this.noHistory.removePlayer(playerId)).toStrictEqual(fullResult);
    expect(this.training.removePlayer(playerId)).toStrictEqual(fullResult);
    this.expectSameView();
  }
}

describe('Training mode (recordHistory: false and snapshot-free API)', () => {
  it(
    'gives the same states, results, and legal actions as a default table',
    { timeout: SIDE_BY_SIDE_TIMEOUT_MS },
    () => {
      let handsWithHistory = 0;
      let midHandRemovals = 0;
      let rejectedActions = 0;

      for (let tableIndex = 0; tableIndex < TABLES; tableIndex++) {
        const random = createRandom(7000 + tableIndex);
        const tables = new SideBySide(configFor(tableIndex));
        const playerCount = 2 + (tableIndex % 5);
        let nextPlayer = 0;
        for (; nextPlayer < playerCount; nextPlayer++) {
          tables.seat(
            createPlayerId(`p${nextPlayer}`),
            40n + BigInt(nextPlayer * 13)
          );
        }

        for (let hand = 0; hand < HANDS_PER_TABLE; hand++) {
          for (const player of tables.full.getState().players) {
            if (player.stack < 2n) {
              tables.rebuy(player.id, 60n);
            }
          }
          if (tables.full.getState().players.length < 2) {
            tables.seat(createPlayerId(`p${nextPlayer++}`), 80n);
          }

          tables.startHand();

          let actions = 0;
          while (tables.full.getState().currentPlayerId !== undefined) {
            expect(actions++).toBeLessThan(MAX_ACTIONS_PER_HAND);
            const state = tables.full.getState();
            const event = random();

            if (event < 0.02) {
              const others = state.players.filter(
                (p) => p.id !== state.currentPlayerId
              );
              tables.remove(others[Math.floor(random() * others.length)].id);
              midHandRemovals++;
              continue;
            }
            if (event < 0.03) {
              tables.seat(createPlayerId(`p${nextPlayer++}`), 50n);
              continue;
            }
            if (event < 0.05) {
              const wrongPlayer = state.players.find(
                (p) => p.id !== state.currentPlayerId
              );
              if (wrongPlayer) {
                tables.act(wrongPlayer.id, { type: 'CHECK' });
                rejectedActions++;
                continue;
              }
            }

            tables.act(state.currentPlayerId!, pickAction(state, random));
          }

          expect(tables.full.getLastHandHistory()).not.toBeNull();
          handsWithHistory++;
        }
      }

      expect(handsWithHistory).toBe(TABLES * HANDS_PER_TABLE);
      expect(midHandRemovals).toBeGreaterThan(10);
      expect(rejectedActions).toBeGreaterThan(10);
    }
  );

  it('returns the same errors from dealHand() as from startHand()', () => {
    const config = configFor(1);
    const full = new HoldemTable(config);
    const training = new HoldemTable(config, {}, { recordHistory: false });

    const notEnough = full.startHand();
    expect(notEnough.ok).toBe(false);
    expect(training.dealHand()).toStrictEqual(notEnough);

    for (const table of [full, training]) {
      table.seatPlayer(createPlayerId('a'), 100n);
      table.seatPlayer(createPlayerId('b'), 100n);
    }
    expect(full.startHand().ok).toBe(true);
    expect(training.dealHand()).toStrictEqual({ ok: true, value: undefined });

    const inProgress = full.startHand();
    expect(inProgress.ok).toBe(false);
    if (!inProgress.ok) {
      expect(inProgress.error.code).toBe(ErrorCode.INVALID_STATE);
    }
    expect(training.dealHand()).toStrictEqual(inProgress);
  });

  it('returns empty snapshot-free getters when no player is to act', () => {
    const table = new HoldemTable(configFor(1));
    expect(table.getCurrentPlayerId()).toBeUndefined();
    expect(table.getPhase()).toBe(TablePhase.Idle);
    expect(table.getAvailableActions()).toStrictEqual([]);
    expect(table.getCallAmount()).toBe(0n);
    expect(table.getMinimumRaiseSize()).toBe(
      getMinimumRaiseSize(table.getState())
    );
  });

  it('accepts the option on Table and createTable', () => {
    const tables: Table[] = [
      new Table(configFor(1), {}, { recordHistory: false }),
      createTable(configFor(1), undefined, { recordHistory: false }),
      new Table(configFor(1), {}, { recordHistory: true }),
      new Table(configFor(1)),
    ];
    for (const table of tables) {
      table.seatPlayer(createPlayerId('a'), 100n);
      table.seatPlayer(createPlayerId('b'), 100n);
      expect(table.dealHand().ok).toBe(true);
      const playerId = table.getCurrentPlayerId()!;
      expect(table.act(playerId, { type: 'FOLD' }).ok).toBe(true);
    }

    expect(tables[0].getLastHandHistory()).toBeNull();
    expect(tables[1].getLastHandHistory()).toBeNull();
    expect(tables[2].getLastHandHistory()).not.toBeNull();
    expect(tables[3].getLastHandHistory()).not.toBeNull();
    expect(tables[0].getLastHandResult()).toStrictEqual(
      tables[3].getLastHandResult()
    );
  });
});
