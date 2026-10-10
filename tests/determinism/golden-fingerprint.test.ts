
import { createHash, Hash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  HoldemTable,
  createPlayerId,
  getAvailableActions,
  getCallAmount,
  getMinimumRaiseSize,
  evaluateHand,
  determineWinners,
  handHistoryToJSON,
  replayHand,
  createShuffledDeck,
  SeededRng,
  HandHistory,
  PlayerAction,
  PlayerHand,
  TableConfig,
} from '../../src/index.js';


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

function createRandom(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stripTimestamps(history: HandHistory): HandHistory {
  const copy: HandHistory = {
    ...history,
    startTime: 0,
    events: history.events.map((e) => ({ ...e, timestamp: 0 })),
  };
  if (history.endTime !== undefined) copy.endTime = 0;
  return copy;
}

function createRecorder(): { hash: Hash; record: (v: unknown) => void } {
  const hash = createHash('sha256');
  return {
    hash,
    record: (v: unknown): void => {
      hash.update(canon(v));
      hash.update('\n');
    },
  };
}

const TABLES = 30;
const HANDS_PER_TABLE = 40;

function tableFlowFingerprint(): string {
  const { hash, record } = createRecorder();
  const random = createRandom(2024);
  const randomInt = (n: number): number => Math.floor(random() * n);

  for (let t = 0; t < TABLES; t++) {
    const playerCount = 2 + randomInt(8);
    const bb = BigInt(2 + randomInt(10)) * 2n;
    const config: TableConfig = {
      minPlayers: 2,
      maxPlayers: 9,
      smallBlind: bb / 2n,
      bigBlind: bb,
      ante: randomInt(3) === 0 ? BigInt(1 + randomInt(3)) : undefined,
      straddle: randomInt(4) === 0 ? bb * 2n : undefined,
      rake: randomInt(3) === 0 ? { percentage: 0.05, cap: bb * 3n } : undefined,
      rngSeed: randomInt(1e9),
    };
    const table = new HoldemTable(config);
    for (let i = 0; i < playerCount; i++) {
      record(
        table.seatPlayer(
          createPlayerId(`p${i}`),
          bb * BigInt(1 + randomInt(60))
        )
      );
    }

    for (let h = 0; h < HANDS_PER_TABLE; h++) {
      for (const p of table.getState().players) {
        if (p.stack === 0n) {
          record(table.rebuyPlayer(p.id, bb * BigInt(1 + randomInt(40))));
        }
      }
      const start = table.startHand();
      record(start);
      if (!start.ok) break;

      let state = start.value;
      while (state.currentPlayerId !== undefined) {
        const id = state.currentPlayerId;
        if (randomInt(10) === 0) {
          record(table.getStateForPlayer(id));
          record(table.getStateForPlayer());
        }
        const available = getAvailableActions(state, id);
        const me = state.players.find((p) => p.id === id);
        if (me === undefined) throw new Error('current player missing');
        const action: PlayerAction = {
          type: available[randomInt(available.length)],
        };
        if (action.type === 'BET') {
          const min = state.bettingRound?.minimumBet ?? bb;
          action.amount = min + BigInt(randomInt(Number(me.stack - min) + 1));
        }
        if (action.type === 'RAISE') {
          const min = getMinimumRaiseSize(state);
          const max = me.stack - getCallAmount(state, id);
          action.amount = min + BigInt(randomInt(Number(max - min) + 1));
        }
        const result = table.applyAction(id, action);
        record(result);
        if (!result.ok) break;
        state = result.value;
      }

      record(table.getState());
      record(table.getLastHandResult());
      const history = table.getLastHandHistory();
      record(history === null ? null : stripTimestamps(history));
      if (history !== null) {
        record(handHistoryToJSON(stripTimestamps(history)));
        record(replayHand(history, history.tableConfig));
      }
    }
  }

  return hash.digest('hex');
}

function handEvaluationFingerprint(): string {
  const { hash, record } = createRecorder();
  const rng = new SeededRng(77);
  for (let i = 0; i < 6000; i++) {
    const cards = createShuffledDeck(rng).getCards();
    record(evaluateHand(cards.slice(0, 5 + (i % 3))));
    if (i % 4 === 0) {
      const players: PlayerHand[] = [0, 1, 2, 3].map((j) => ({
        playerId: `x${j}`,
        holeCards: [cards[7 + 2 * j], cards[8 + 2 * j]],
      }));
      record(determineWinners(players, cards.slice(0, 5)));
    }
  }
  return hash.digest('hex');
}

describe('Golden determinism fingerprints', () => {

  const TABLE_FLOW_FINGERPRINT =
    'fd9751c97e732e447612b60303e30f0c58167e3f9ed4595beee5b2fd56b9eb74';


  const HAND_EVALUATION_FINGERPRINT =
    '7795b31a08b476517caaa10a5e662b2c89d30d98d9289eadbde804aac15c67cb';

  it('table flow output matches the golden fingerprint', () => {
    expect(tableFlowFingerprint()).toBe(TABLE_FLOW_FINGERPRINT);
  });

  it('hand evaluation output matches the golden fingerprint', () => {
    expect(handEvaluationFingerprint()).toBe(HAND_EVALUATION_FINGERPRINT);
  });
});
