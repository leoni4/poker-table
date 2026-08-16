import { describe, expect, it } from 'vitest';
import {
  applyActionToBettingRound,
  isBettingRoundComplete,
  startBettingRound,
} from '../../src/betting/round.js';
import {
  getAvailableActions,
  validateAction,
} from '../../src/betting/actions.js';
import {
  PlayerId,
  PlayerStatus,
  TablePhase,
  TableState,
  createPlayerId,
} from '../../src/core/table.js';
import { isErr, isOk } from '../../src/core/result.js';

function player(
  id: PlayerId,
  seat: number,
  stack: bigint,
  committed = 0n,
  status = PlayerStatus.Active
): TableState['players'][number] {
  return {
    id,
    seat,
    stack,
    committed,
    status,
    holeCards: {},
  };
}

function state(
  players: TableState['players'],
  currentPlayerId: PlayerId
): TableState {
  return {
    phase: TablePhase.Flop,
    handId: 1,
    players,
    communityCards: [],
    pots: [],
    currentPlayerId,
    bettingRound: {
      street: TablePhase.Flop,
      currentBet: players.reduce(
        (max, current) =>
          current.committed > max ? current.committed : max,
        0n
      ),
      lastRaiseSize: players.reduce(
        (max, current) =>
          current.committed > max ? current.committed : max,
        0n
      ),
      actedPlayerIds: [],
    },
  };
}

describe('explicit betting-round state', () => {
  it('requires both HU players to act when the street starts at 0/0', () => {
    const p1 = createPlayerId('p1');
    const p2 = createPlayerId('p2');

    const start = startBettingRound(
      state(
        [
          player(p1, 0, 100n),
          player(p2, 1, 100n),
        ],
        p1
      ),
      p1
    );

    expect(isOk(start)).toBe(true);
    if (!isOk(start)) return;

    const firstCheck = applyActionToBettingRound(start.value, p1, {
      type: 'CHECK',
    });

    expect(isOk(firstCheck)).toBe(true);
    if (!isOk(firstCheck)) return;

    expect(firstCheck.value.currentPlayerId).toBe(p2);
    expect(firstCheck.value.bettingRound?.actedPlayerIds).toEqual([p1]);
    expect(isBettingRoundComplete(firstCheck.value)).toBe(false);

    const secondCheck = applyActionToBettingRound(firstCheck.value, p2, {
      type: 'CHECK',
    });

    expect(isOk(secondCheck)).toBe(true);
    if (!isOk(secondCheck)) return;

    expect(isBettingRoundComplete(secondCheck.value)).toBe(true);
  });

  it('resets acted players after a full bet/raise', () => {
    const p1 = createPlayerId('p1');
    const p2 = createPlayerId('p2');
    const p3 = createPlayerId('p3');

    let tableState = state(
      [
        player(p1, 0, 1000n),
        player(p2, 1, 1000n),
        player(p3, 2, 1000n),
      ],
      p1
    );

    let result = applyActionToBettingRound(tableState, p1, {
      type: 'BET',
      amount: 100n,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    tableState = result.value;

    result = applyActionToBettingRound(tableState, p2, {
      type: 'CALL',
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    tableState = result.value;

    result = applyActionToBettingRound(tableState, p3, {
      type: 'RAISE',
      amount: 100n,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    tableState = result.value;

    expect(tableState.bettingRound?.actedPlayerIds).toEqual([p3]);
    expect(tableState.bettingRound?.lastAggressorId).toBe(p3);
    expect(tableState.bettingRound?.lastRaiseSize).toBe(100n);
    expect(isBettingRoundComplete(tableState)).toBe(false);
    expect(tableState.currentPlayerId).toBe(p1);
  });

  it('keeps BET and RAISE as strict separate actions', () => {
    const p1 = createPlayerId('p1');
    const p2 = createPlayerId('p2');

    const noBetState = state(
      [
        player(p1, 0, 1000n),
        player(p2, 1, 1000n),
      ],
      p1
    );

    expect(isOk(validateAction(noBetState, p1, {
      type: 'BET',
      amount: 100n,
    }))).toBe(true);
    expect(isErr(validateAction(noBetState, p1, {
      type: 'RAISE',
      amount: 100n,
    }))).toBe(true);

    const facingBet = state(
      [
        player(p1, 0, 900n, 100n),
        player(p2, 1, 1000n),
      ],
      p2
    );

    expect(isErr(validateAction(facingBet, p2, {
      type: 'BET',
      amount: 100n,
    }))).toBe(true);

    const raise = applyActionToBettingRound(facingBet, p2, {
      type: 'RAISE',
      amount: 100n,
    });

    expect(isOk(raise)).toBe(true);
    if (!isOk(raise)) return;

    // RAISE.amount is the increment: 100 call + 100 raise = 200 committed.
    expect(raise.value.players.find((p) => p.id === p2)?.committed).toBe(200n);
  });

  it('uses last full raise size as the next minimum raise', () => {
    const p1 = createPlayerId('p1');
    const p2 = createPlayerId('p2');
    const p3 = createPlayerId('p3');

    let tableState = state(
      [
        player(p1, 0, 1000n),
        player(p2, 1, 1000n),
        player(p3, 2, 1000n),
      ],
      p1
    );

    let result = applyActionToBettingRound(tableState, p1, {
      type: 'BET',
      amount: 100n,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    tableState = result.value;

    result = applyActionToBettingRound(tableState, p2, {
      type: 'RAISE',
      amount: 150n,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    tableState = result.value;

    expect(tableState.bettingRound?.lastRaiseSize).toBe(150n);
    expect(
      isErr(
        validateAction(tableState, p3, {
          type: 'RAISE',
          amount: 149n,
        })
      )
    ).toBe(true);
    expect(
      isOk(
        validateAction(tableState, p3, {
          type: 'RAISE',
          amount: 150n,
        })
      )
    ).toBe(true);
  });

  it('handles a short all-in call without changing current bet', () => {
    const bettor = createPlayerId('bettor');
    const short = createPlayerId('short');

    const tableState = state(
      [
        player(bettor, 0, 900n, 100n),
        player(short, 1, 50n),
      ],
      short
    );

    const result = applyActionToBettingRound(tableState, short, {
      type: 'ALL_IN',
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const shortPlayer = result.value.players.find((p) => p.id === short);
    expect(shortPlayer?.committed).toBe(50n);
    expect(shortPlayer?.status).toBe(PlayerStatus.AllIn);
    expect(result.value.bettingRound?.currentBet).toBe(100n);
    expect(result.value.bettingRound?.lastRaiseSize).toBe(100n);
    expect(isBettingRoundComplete(result.value)).toBe(true);
  });

  it('handles an exact all-in call without reopening betting', () => {
    const bettor = createPlayerId('bettor');
    const caller = createPlayerId('caller');
    const third = createPlayerId('third');

    const tableState = state(
      [
        player(bettor, 0, 900n, 100n),
        player(caller, 1, 100n),
        player(third, 2, 1000n),
      ],
      caller
    );
    tableState.bettingRound!.actedPlayerIds = [bettor];

    const result = applyActionToBettingRound(tableState, caller, {
      type: 'ALL_IN',
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value.bettingRound?.currentBet).toBe(100n);
    expect(result.value.bettingRound?.lastRaiseSize).toBe(100n);
    expect(result.value.bettingRound?.actedPlayerIds).toEqual([
      bettor,
      caller,
    ]);
    expect(result.value.currentPlayerId).toBe(third);
  });

  it('treats a large all-in as a full raise and resets acted players', () => {
    const bettor = createPlayerId('bettor');
    const shover = createPlayerId('shover');
    const third = createPlayerId('third');

    const tableState = state(
      [
        player(bettor, 0, 900n, 100n),
        player(shover, 1, 250n),
        player(third, 2, 1000n),
      ],
      shover
    );
    tableState.bettingRound!.actedPlayerIds = [bettor];

    const result = applyActionToBettingRound(tableState, shover, {
      type: 'ALL_IN',
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value.bettingRound?.currentBet).toBe(250n);
    expect(result.value.bettingRound?.lastRaiseSize).toBe(150n);
    expect(result.value.bettingRound?.lastAggressorId).toBe(shover);
    expect(result.value.bettingRound?.actedPlayerIds).toEqual([shover]);
  });

  it('does not reopen a prior bettor after a short all-in raise', () => {
    const bettor = createPlayerId('bettor');
    const shortRaiser = createPlayerId('short-raiser');
    const third = createPlayerId('third');

    let tableState = state(
      [
        player(bettor, 0, 1000n),
        player(shortRaiser, 1, 150n),
        player(third, 2, 1000n),
      ],
      bettor
    );

    let result = applyActionToBettingRound(tableState, bettor, {
      type: 'BET',
      amount: 100n,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    tableState = result.value;

    result = applyActionToBettingRound(tableState, shortRaiser, {
      type: 'ALL_IN',
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    tableState = result.value;

    expect(tableState.bettingRound?.currentBet).toBe(150n);
    expect(tableState.bettingRound?.lastRaiseSize).toBe(100n);

    // The third player has not acted since the full bet, so raising is open.
    expect(getAvailableActions(tableState, third)).toContain('RAISE');

    result = applyActionToBettingRound(tableState, third, {
      type: 'CALL',
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    tableState = result.value;

    // Action returns to the original bettor for the extra 50, but the short
    // all-in did not reopen raising.
    expect(tableState.currentPlayerId).toBe(bettor);
    expect(getAvailableActions(tableState, bettor)).toEqual([
      'FOLD',
      'CALL',
    ]);
  });
});

describe('short all-in and reopening rules', () => {
  it('requires ALL_IN for an opening wager below the minimum bet', () => {
    const p1 = createPlayerId('short');
    const p2 = createPlayerId('deep');
    const initial = state(
      [player(p1, 0, 1n), player(p2, 1, 100n)],
      p1
    );
    const started = startBettingRound(initial, p1, {
      currentBet: 0n,
      lastRaiseSize: 2n,
      minimumBet: 2n,
    });
    expect(isOk(started)).toBe(true);
    if (!isOk(started)) return;

    expect(getAvailableActions(started.value, p1)).toEqual([
      'FOLD',
      'CHECK',
      'ALL_IN',
    ]);
    expect(
      isErr(validateAction(started.value, p1, { type: 'BET', amount: 1n }))
    ).toBe(true);

    const shortAllIn = applyActionToBettingRound(started.value, p1, {
      type: 'ALL_IN',
    });
    expect(isOk(shortAllIn)).toBe(true);
    if (!isOk(shortAllIn)) return;

    expect(shortAllIn.value.bettingRound?.currentBet).toBe(1n);
    expect(shortAllIn.value.bettingRound?.lastRaiseSize).toBe(2n);
    expect(
      isErr(
        validateAction(shortAllIn.value, p2, { type: 'RAISE', amount: 1n })
      )
    ).toBe(true);
    expect(
      isOk(
        validateAction(shortAllIn.value, p2, { type: 'RAISE', amount: 2n })
      )
    ).toBe(true);
  });

  it('reopens raising after cumulative short all-ins reach a full raise', () => {
    const a = createPlayerId('a');
    const b = createPlayerId('b');
    const c = createPlayerId('c');
    const d = createPlayerId('d');
    const e = createPlayerId('e');
    const initial = state(
      [
        player(a, 0, 1000n),
        player(b, 1, 125n),
        player(c, 2, 1000n),
        player(d, 3, 200n),
        player(e, 4, 1000n),
      ],
      a
    );
    const started = startBettingRound(initial, a, {
      currentBet: 0n,
      lastRaiseSize: 100n,
      minimumBet: 100n,
    });
    expect(isOk(started)).toBe(true);
    if (!isOk(started)) return;

    let current = started.value;
    const actions: Array<[PlayerId, { type: 'BET' | 'CALL' | 'ALL_IN'; amount?: bigint }]> = [
      [a, { type: 'BET', amount: 100n }],
      [b, { type: 'ALL_IN' }],
      [c, { type: 'CALL' }],
      [d, { type: 'ALL_IN' }],
      [e, { type: 'CALL' }],
    ];

    for (const [playerId, action] of actions) {
      const result = applyActionToBettingRound(current, playerId, action);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      current = result.value;
    }

    expect(current.currentPlayerId).toBe(a);
    expect(current.bettingRound?.currentBet).toBe(200n);
    expect(current.bettingRound?.lastRaiseSize).toBe(100n);
    expect(getAvailableActions(current, a)).toContain('RAISE');
    expect(
      isOk(validateAction(current, a, { type: 'RAISE', amount: 100n }))
    ).toBe(true);

    const aCalls = applyActionToBettingRound(current, a, { type: 'CALL' });
    expect(isOk(aCalls)).toBe(true);
    if (!isOk(aCalls)) return;
    current = aCalls.value;

    expect(current.currentPlayerId).toBe(c);
    expect(getAvailableActions(current, c)).not.toContain('RAISE');
    expect(
      isErr(validateAction(current, c, { type: 'RAISE', amount: 100n }))
    ).toBe(true);
  });
});
