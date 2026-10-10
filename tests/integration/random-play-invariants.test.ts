

import { describe, it, expect } from 'vitest';
import {
  HoldemTable,
  createPlayerId,
  getAvailableActions,
  getCallAmount,
  getMinimumRaiseSize,
  validateAction,
  replayHand,
  TablePhase,
  ChipAmount,
  PlayerAction,
  PlayerActionType,
  TableConfig,
  TableState,
} from '../../src/index.js';

const TABLES = 40;
const HANDS_PER_TABLE = 50;
const MAX_ACTIONS_PER_HAND = 500;

function createRandom(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BETTING_PHASES = new Set<TablePhase>([
  TablePhase.Preflop,
  TablePhase.Flop,
  TablePhase.Turn,
  TablePhase.River,
]);

const BOARD_LENGTH: Partial<Record<TablePhase, number>> = {
  [TablePhase.Preflop]: 0,
  [TablePhase.Flop]: 3,
  [TablePhase.Turn]: 4,
  [TablePhase.River]: 5,
};

const ACTION_TYPES: PlayerActionType[] = [
  'FOLD',
  'CHECK',
  'CALL',
  'BET',
  'RAISE',
  'ALL_IN',
];

const ACTION_WEIGHTS: Record<PlayerActionType, number> = {
  FOLD: 2,
  CHECK: 6,
  CALL: 6,
  BET: 3,
  RAISE: 2,
  ALL_IN: 1,
};

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sumChips(values: ChipAmount[]): ChipAmount {
  return values.reduce((a, b) => a + b, 0n);
}

function chipsInPlay(state: TableState): ChipAmount {
  return (
    sumChips(state.players.map((p) => p.stack)) +
    sumChips(state.pots.map((p) => p.total))
  );
}

function playTable(tableIndex: number): { hands: number; actions: number } {
  const random = createRandom(0x5eed + tableIndex);
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
    rake: randomInt(3) === 0 ? { percentage: 0.05, cap: bb * 3n } : undefined,
    rngSeed: randomInt(1e9),
  };
  const table = new HoldemTable(config);
  const playerCount = 2 + randomInt(8);
  for (let i = 0; i < playerCount; i++) {
    const seated = table.seatPlayer(
      createPlayerId(`p${i}`),
      bb * BigInt(1 + randomInt(60))
    );
    check(seated.ok, `table ${tableIndex}: seat p${i}`);
  }

  let bank = chipsInPlay(table.getState());
  let hands = 0;
  let actions = 0;

  for (let h = 0; h < HANDS_PER_TABLE; h++) {
    const where = `table ${tableIndex} hand ${h}`;

    for (const p of table.getState().players) {
      if (p.stack === 0n) {
        const amount = bb * BigInt(1 + randomInt(40));
        const rebuy = table.rebuyPlayer(p.id, amount);
        check(rebuy.ok, `${where}: rebuy ${p.id}`);
        bank += amount;
      }
    }

    const start = table.startHand();
    check(start.ok, `${where}: startHand`);
    hands++;

    let state = start.value;
    let handActions = 0;
    while (BETTING_PHASES.has(state.phase)) {
      check(handActions < MAX_ACTIONS_PER_HAND, `${where}: hand does not end`);
      check(chipsInPlay(state) === bank, `${where}: chips during hand`);
      check(
        state.communityCards.length === BOARD_LENGTH[state.phase],
        `${where}: board size in ${state.phase}`
      );

      const current = state.currentPlayerId;
      check(current !== undefined, `${where}: no current player`);

      const view = table.getStateForPlayer(current);
      for (const p of view.players) {
        if (p.id !== current) {
          check(p.holeCards.cards === undefined, `${where}: player view leak`);
        }
      }

      const available = getAvailableActions(state, current);
      check(available.length > 0, `${where}: no actions`);

      const me = state.players.find((p) => p.id === current);
      check(me !== undefined, `${where}: current player missing`);
      const call = getCallAmount(state, current);
      const minRaise = getMinimumRaiseSize(state);
      const minBet = state.bettingRound?.minimumBet ?? bb;

      for (const type of ACTION_TYPES) {
        const probe: PlayerAction =
          type === 'BET'
            ? { type, amount: minBet }
            : type === 'RAISE'
              ? { type, amount: minRaise === 0n ? 1n : minRaise }
              : { type };
        check(
          validateAction(state, current, probe).ok === available.includes(type),
          `${where}: ${type} listed vs validateAction`
        );
      }

      const pool = available.flatMap((a) =>
        Array<PlayerActionType>(ACTION_WEIGHTS[a]).fill(a)
      );
      const type = pool[randomInt(pool.length)];
      const action: PlayerAction = { type };
      if (type === 'BET') action.amount = randomChips(minBet, me.stack);
      if (type === 'RAISE') {
        action.amount = randomChips(minRaise, me.stack - call);
      }

      const result = table.applyAction(current, action);
      check(result.ok, `${where}: listed ${type} rejected`);
      state = result.value;
      handActions++;
      actions++;
    }

    check(state.phase === TablePhase.Showdown, `${where}: end phase`);
    const handResult = table.getLastHandResult();
    check(handResult !== null, `${where}: no hand result`);
    check(
      sumChips(state.players.map((p) => p.stack)) + handResult.totalRake ===
        bank,
      `${where}: chips after hand`
    );
    bank -= handResult.totalRake;

    const history = table.getLastHandHistory();
    check(history !== null, `${where}: no hand history`);
    const replayed = replayHand(history, history.tableConfig);
    const finalState = replayed[replayed.length - 1];
    for (const p of finalState.players) {
      const live = state.players.find((q) => q.id === p.id);
      check(live?.stack === p.stack, `${where}: replay stack of ${p.id}`);
    }
  }

  return { hands, actions };
}

describe('Random-play invariants (pure play)', () => {
  it.each(Array.from({ length: TABLES }, (_, i) => i))(
    'table %i keeps all invariants',
    (tableIndex) => {
      const { hands, actions } = playTable(tableIndex);
      expect(hands).toBe(HANDS_PER_TABLE);
      expect(actions).toBeGreaterThan(0);
    }
  );
});
