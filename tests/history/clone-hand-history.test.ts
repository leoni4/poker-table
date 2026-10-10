import { describe, it, expect } from 'vitest';
import {
  cloneHandHistory,
  handHistoryFromJSON,
  handHistoryToJSON,
  HandEvent,
  HandHistory,
} from '../../src/history/index.js';
import { Table } from '../../src/table/index.js';
import {
  getAvailableActions,
  getCallAmount,
  getMinimumRaiseSize,
  PlayerAction,
  PlayerActionType,
} from '../../src/betting/index.js';
import {
  createPlayerId,
  PlayerStatus,
  TableConfig,
  TablePhase,
} from '../../src/core/table.js';
import { ChipAmount } from '../../src/core/money.js';
import { createCard, Rank, Suit } from '../../src/core/card.js';

const TABLES = 30;
const HANDS_PER_TABLE = 30;
const MID_HAND_CAPTURE_CHANCE = 0.1;
const MID_HAND_REMOVAL_CHANCE = 0.02;

const ALL_EVENT_TYPES: Record<HandEvent['type'], true> = {
  HAND_STARTED: true,
  BLINDS_POSTED: true,
  CARDS_DEALT: true,
  ACTION_TAKEN: true,
  STREET_ENDED: true,
  UNCALLED_BET_RETURNED: true,
  SHOWDOWN: true,
  POT_DISTRIBUTED: true,
  HAND_ENDED: true,
};

function createRandom(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canon(v: unknown): string {
  if (v === undefined) return 'u';
  if (v === null) return 'n';
  if (typeof v === 'bigint') return v.toString() + 'n';
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 't' : 'f';
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') {
    return (
      '{' +
      Object.entries(v)
        .map(([k, x]) => JSON.stringify(k) + ':' + canon(x))
        .join(',') +
      '}'
    );
  }
  throw new Error(`canon: unsupported type ${typeof v}`);
}

function collectObjects(v: unknown, into: Set<object>): Set<object> {
  if (typeof v === 'object' && v !== null) {
    into.add(v);
    for (const x of Object.values(v)) collectObjects(x, into);
  }
  return into;
}

function expectSameAsJsonRoundTrip(history: HandHistory): void {
  const expected = handHistoryFromJSON(handHistoryToJSON(history));
  const actual = cloneHandHistory(history);

  expect(actual).toStrictEqual(expected);
  expect(canon(actual)).toBe(canon(expected));

  const sourceObjects = collectObjects(history, new Set());
  for (const object of collectObjects(actual, new Set())) {
    expect(sourceObjects.has(object)).toBe(false);
  }
}

// The getters already use cloneHandHistory, so the test reads the raw stored objects.
interface StoredHandHistories {
  currentHandHistory: HandHistory | null;
  lastHandHistory: HandHistory | null;
}

function storedHistories(table: Table): StoredHandHistories {
  return table as unknown as StoredHandHistories;
}

function playEngineHands(visit: (history: HandHistory) => void): void {
  for (let t = 0; t < TABLES; t++) {
    const random = createRandom(0xc10e + t);
    const randomInt = (n: number): number => Math.floor(random() * n);
    const randomChips = (lo: ChipAmount, hi: ChipAmount): ChipAmount =>
      hi <= lo ? lo : lo + BigInt(randomInt(Number(hi - lo) + 1));

    const bb = BigInt(2 + randomInt(10)) * 2n;
    const config: TableConfig = {
      minPlayers: 2,
      maxPlayers: 9,
      smallBlind: bb / 2n,
      bigBlind: bb,
      ante: randomInt(3) === 0 ? BigInt(1 + randomInt(3)) : undefined,
      straddle: randomInt(4) === 0 ? bb * 2n : undefined,
      rake: randomInt(2) === 0 ? { percentage: 0.05, cap: bb * 3n } : undefined,
      rngSeed: randomInt(1e9),
    };
    const table = new Table(config);
    const stored = storedHistories(table);
    let seated = 0;
    const seat = (): void => {
      const id = createPlayerId(`p${seated++}`);
      expect(table.seatPlayer(id, bb * BigInt(1 + randomInt(60))).ok).toBe(
        true
      );
    };
    for (let i = 2 + randomInt(8); i > 0; i--) seat();

    for (let h = 0; h < HANDS_PER_TABLE; h++) {
      for (const p of table.getState().players) {
        if (p.status === PlayerStatus.SittingOut && p.stack > 0n) {
          expect(table.removePlayer(p.id).ok).toBe(true);
        } else if (p.stack === 0n) {
          const amount = bb * BigInt(1 + randomInt(40));
          expect(table.rebuyPlayer(p.id, amount).ok).toBe(true);
        }
      }
      while (table.getState().players.length < 3) seat();

      const start = table.startHand();
      expect(start.ok).toBe(true);
      if (!start.ok) break;
      let state = start.value;

      while (state.phase !== TablePhase.Showdown) {
        if (random() < MID_HAND_CAPTURE_CHANCE) {
          const current = stored.currentHandHistory;
          expect(current).not.toBeNull();
          if (current) visit(current);
        }

        if (random() < MID_HAND_REMOVAL_CHANCE) {
          const candidates = state.players.filter(
            (p) =>
              p.status === PlayerStatus.Active && p.id !== state.currentPlayerId
          );
          if (candidates.length > 0) {
            const p = candidates[randomInt(candidates.length)];
            const removal = table.removePlayer(p.id);
            expect(removal.ok).toBe(true);
            if (!removal.ok) break;
            state = removal.value;
            continue;
          }
        }

        const current = state.currentPlayerId;
        expect(current).toBeDefined();
        if (current === undefined) break;
        const me = state.players.find((p) => p.id === current);
        if (!me) break;

        const available = getAvailableActions(state, current);
        const type: PlayerActionType = available[randomInt(available.length)];
        const action: PlayerAction = { type };
        if (type === 'BET') {
          action.amount = randomChips(
            state.bettingRound?.minimumBet ?? bb,
            me.stack
          );
        }
        if (type === 'RAISE') {
          action.amount = randomChips(
            getMinimumRaiseSize(state),
            me.stack - getCallAmount(state, current)
          );
        }

        const result = table.applyAction(current, action);
        expect(result.ok).toBe(true);
        if (!result.ok) break;
        state = result.value;
      }

      const last = stored.lastHandHistory;
      expect(last).not.toBeNull();
      if (last) visit(last);
    }
  }
}

function baseHistory(): HandHistory {
  return {
    handId: 7,
    tableConfig: {
      minPlayers: 2,
      maxPlayers: 9,
      smallBlind: 1n,
      bigBlind: 2n,
    },
    events: [],
    startTime: 1000,
  };
}

describe('cloneHandHistory', () => {
  it('equals the JSON round trip for engine histories with every event type', () => {
    let count = 0;
    const types = new Set<string>();
    let outOfTurn = false;
    let allIn = false;
    let antes = false;
    let straddle = false;
    let rakedPot = false;
    let inProgress = false;
    playEngineHands((history) => {
      expectSameAsJsonRoundTrip(history);
      count++;
      if (history.endTime === undefined) inProgress = true;
      for (const event of history.events) {
        types.add(event.type);
        if (event.type === 'ACTION_TAKEN') {
          if (event.outOfTurn) outOfTurn = true;
          if (event.allIn) allIn = true;
        }
        if (event.type === 'BLINDS_POSTED') {
          if (event.antes) antes = true;
          if (event.straddle) straddle = true;
        }
        if (event.type === 'POT_DISTRIBUTED') {
          if (event.pots.some((pot) => pot.rake !== undefined)) {
            rakedPot = true;
          }
        }
      }
    });

    expect(count).toBeGreaterThan(TABLES * HANDS_PER_TABLE);
    expect([...types].sort()).toEqual(Object.keys(ALL_EVENT_TYPES).sort());
    expect({ outOfTurn, allIn, antes, straddle, rakedPot, inProgress }).toEqual(
      {
        outOfTurn: true,
        allIn: true,
        antes: true,
        straddle: true,
        rakedPot: true,
        inProgress: true,
      }
    );
  });

  it('equals the JSON round trip for config edge cases', () => {
    const configs: TableConfig[] = [
      { ...baseHistory().tableConfig, ante: 0n, straddle: 0n },
      {
        minPlayers: -0,
        maxPlayers: Infinity,
        smallBlind: 1n,
        bigBlind: 2n,
        ante: 1n,
        straddle: 4n,
        rake: { percentage: -0, cap: 0n },
        rngSeed: NaN,
      },
      {
        ...baseHistory().tableConfig,
        rake: { percentage: NaN, cap: 3n },
        rngSeed: -0,
      },
      {
        rngSeed: 42,
        rake: undefined,
        straddle: undefined,
        ante: undefined,
        bigBlind: 2n,
        smallBlind: 1n,
        maxPlayers: 6,
        minPlayers: 2,
      },
    ];
    for (const tableConfig of configs) {
      expectSameAsJsonRoundTrip({ ...baseHistory(), tableConfig });
    }
  });

  it('equals the JSON round trip for history and event edge cases', () => {
    const alice = createPlayerId('alice');
    const bob = createPlayerId('bob');
    const aceSpades = createCard(Rank.Ace, Suit.Spades);
    const twoClubs = createCard(Rank.Two, Suit.Clubs);
    const eventWithExtraKey = {
      timestamp: 4,
      type: 'UNCALLED_BET_RETURNED' as const,
      playerId: alice,
      amount: 5n,
      extra: 'dropped',
    };
    const events: HandEvent[] = [
      {
        type: 'BLINDS_POSTED',
        timestamp: -0,
        smallBlind: undefined,
        bigBlind: { playerId: bob, amount: 2n },
        antes: [],
      },
      {
        type: 'ACTION_TAKEN',
        playerId: alice,
        action: 'FOLD',
        timestamp: 3,
        amount: undefined,
        committedAfter: undefined,
        allIn: undefined,
        outOfTurn: true,
      },
      {
        timestamp: NaN,
        type: 'ACTION_TAKEN',
        playerId: bob,
        action: 'ALL_IN',
        amount: 0n,
        committedAfter: 10n,
        allIn: false,
      },
      eventWithExtraKey,
      {
        timestamp: 5,
        type: 'STREET_ENDED',
        street: TablePhase.Flop,
        communityCards: [
          aceSpades,
          twoClubs,
          createCard(Rank.Ten, Suit.Hearts),
        ],
        potTotal: 0n,
      },
      {
        timestamp: 6,
        type: 'SHOWDOWN',
        players: [
          { playerId: alice, mucked: true },
          { playerId: bob, cards: [aceSpades, twoClubs] },
          { playerId: alice, cards: [twoClubs, aceSpades], mucked: false },
        ],
      },
      {
        timestamp: 7,
        type: 'POT_DISTRIBUTED',
        pots: [
          { amount: 10n, winners: [{ playerId: bob, share: 10n }] },
          { amount: 4n, rake: 0n, winners: [] },
          { amount: 4n, rake: undefined, winners: [] },
        ],
      },
      {
        timestamp: 8,
        type: 'HAND_ENDED',
        handId: 7,
        finalPlayers: [{ id: bob, finalStack: 0n }],
      },
    ];

    expectSameAsJsonRoundTrip({ ...baseHistory(), events });
    expectSameAsJsonRoundTrip({ ...baseHistory(), events, endTime: undefined });
    expectSameAsJsonRoundTrip({ ...baseHistory(), events, endTime: -0 });
    expectSameAsJsonRoundTrip({
      ...baseHistory(),
      events,
      startTime: Infinity,
      endTime: NaN,
    });
  });
});
