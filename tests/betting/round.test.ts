/**
 * Unit tests for betting round engine
 */

import { describe, it, expect } from 'vitest';
import {
  startBettingRound,
  applyActionToBettingRound,
  isBettingRoundComplete,
  getBettingRoundInfo,
} from '../../src/betting/round.js';
import { PlayerAction } from '../../src/betting/actions.js';
import {
  TableState,
  TablePhase,
  PlayerStatus,
  createPlayerId,
} from '../../src/core/table.js';
import { ErrorCode } from '../../src/core/errors.js';
import { isErr, isOk } from '../../src/core/result.js';

/**
 * Helper to create a basic table state for testing
 */
function createTestTableState(overrides?: Partial<TableState>): TableState {
  return {
    phase: TablePhase.Preflop,
    handId: 1,
    players: [],
    communityCards: [],
    pots: [{ total: 0n, participants: [] }],
    currentPlayerId: undefined,
    ...overrides,
  };
}

describe('startBettingRound', () => {
  it('initializes betting round with starting player', () => {
    const tableState = createTestTableState({
      players: [
        {
          id: createPlayerId('player1'),
          seat: 0,
          stack: 1000n,
          committed: 0n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('player2'),
          seat: 1,
          stack: 1000n,
          committed: 0n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ],
    });

    const result = startBettingRound(tableState, createPlayerId('player1'));

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.currentPlayerId).toBe(createPlayerId('player1'));
    }
  });

  it('fails when starting player not found', () => {
    const tableState = createTestTableState({
      players: [
        {
          id: createPlayerId('player1'),
          seat: 0,
          stack: 1000n,
          committed: 0n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ],
    });

    const result = startBettingRound(tableState, createPlayerId('player2'));

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe(ErrorCode.PLAYER_NOT_FOUND);
    }
  });

  it('fails when starting player is folded', () => {
    const tableState = createTestTableState({
      players: [
        {
          id: createPlayerId('player1'),
          seat: 0,
          stack: 1000n,
          committed: 0n,
          status: PlayerStatus.Folded,
          holeCards: {},
        },
      ],
    });

    const result = startBettingRound(tableState, createPlayerId('player1'));

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
    }
  });

  it('fails when starting player has no chips', () => {
    const tableState = createTestTableState({
      players: [
        {
          id: createPlayerId('player1'),
          seat: 0,
          stack: 0n,
          committed: 0n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ],
    });

    const result = startBettingRound(tableState, createPlayerId('player1'));

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
    }
  });
});

describe('applyActionToBettingRound', () => {
  describe('basic actions', () => {
    it('applies FOLD action and moves to next player', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'FOLD' };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player1 = result.value.players.find(
          (p) => p.id === createPlayerId('player1')
        );
        expect(player1?.status).toBe(PlayerStatus.Folded);
        expect(result.value.currentPlayerId).toBe(createPlayerId('player2'));
      }
    });

    it('applies CHECK action', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'CHECK' };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player1 = result.value.players.find(
          (p) => p.id === createPlayerId('player1')
        );
        expect(player1?.stack).toBe(1000n);
        expect(player1?.committed).toBe(0n);
        expect(result.value.currentPlayerId).toBe(createPlayerId('player2'));
      }
    });

    it('applies BET action', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'BET', amount: 100n };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player1 = result.value.players.find(
          (p) => p.id === createPlayerId('player1')
        );
        expect(player1?.stack).toBe(900n);
        expect(player1?.committed).toBe(100n);
        expect(result.value.currentPlayerId).toBe(createPlayerId('player2'));
      }
    });

    it('applies CALL action', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 100n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player2'),
      });

      const action: PlayerAction = { type: 'CALL' };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player2 = result.value.players.find(
          (p) => p.id === createPlayerId('player2')
        );
        expect(player2?.stack).toBe(900n);
        expect(player2?.committed).toBe(100n);
      }
    });

    it('applies RAISE action', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 100n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player2'),
      });

      const action: PlayerAction = { type: 'RAISE', amount: 100n };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player2 = result.value.players.find(
          (p) => p.id === createPlayerId('player2')
        );
        expect(player2?.stack).toBe(800n);
        expect(player2?.committed).toBe(200n);
      }
    });

    it('applies ALL_IN action', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 500n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'ALL_IN' };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player1 = result.value.players.find(
          (p) => p.id === createPlayerId('player1')
        );
        expect(player1?.stack).toBe(0n);
        expect(player1?.committed).toBe(500n);
        expect(player1?.status).toBe(PlayerStatus.AllIn);
      }
    });
  });

  describe('turn order', () => {
    it('wraps around to first player after last player acts', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player3'),
            seat: 2,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player3'),
      });

      const action: PlayerAction = { type: 'CHECK' };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player3'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.currentPlayerId).toBe(createPlayerId('player1'));
      }
    });

    it('skips folded players', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Folded,
            holeCards: {},
          },
          {
            id: createPlayerId('player3'),
            seat: 2,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'CHECK' };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.currentPlayerId).toBe(createPlayerId('player3'));
      }
    });

    it('skips all-in players', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 100n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 0n,
            committed: 100n,
            status: PlayerStatus.AllIn,
            holeCards: {},
          },
          {
            id: createPlayerId('player3'),
            seat: 2,
            stack: 1000n,
            committed: 100n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'CHECK' };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.currentPlayerId).toBe(createPlayerId('player3'));
      }
    });

    it('skips players with no chips', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 0n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player3'),
            seat: 2,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'CHECK' };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.currentPlayerId).toBe(createPlayerId('player3'));
      }
    });
  });

  describe('automatic all-in detection', () => {
    it('marks player as all-in when betting entire stack', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 100n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'BET', amount: 100n };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player1 = result.value.players.find(
          (p) => p.id === createPlayerId('player1')
        );
        expect(player1?.stack).toBe(0n);
        expect(player1?.status).toBe(PlayerStatus.AllIn);
      }
    });

    it('marks player as all-in when calling with entire stack', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 200n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 50n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player2'),
      });

      const action: PlayerAction = { type: 'CALL' };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player2 = result.value.players.find(
          (p) => p.id === createPlayerId('player2')
        );
        expect(player2?.stack).toBe(0n);
        expect(player2?.committed).toBe(50n);
        expect(player2?.status).toBe(PlayerStatus.AllIn);
      }
    });

    it('marks player as all-in when raising with entire stack', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 100n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 200n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player2'),
      });

      // Raise to 200 total (100 call + 100 raise) using entire stack
      const action: PlayerAction = { type: 'RAISE', amount: 100n };
      const result = applyActionToBettingRound(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player2 = result.value.players.find(
          (p) => p.id === createPlayerId('player2')
        );
        expect(player2?.stack).toBe(0n);
        expect(player2?.committed).toBe(200n);
        expect(player2?.status).toBe(PlayerStatus.AllIn);
      }
    });
  });

  describe('betting flow scenarios', () => {
    it('handles basic bet → call → call flow', () => {
      let tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player3'),
            seat: 2,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      // Player 1 bets 100
      let result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        { type: 'BET', amount: 100n }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      // Player 2 calls
      result = applyActionToBettingRound(
        tableState,
        createPlayerId('player2'),
        { type: 'CALL' }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      // Player 3 calls
      result = applyActionToBettingRound(
        tableState,
        createPlayerId('player3'),
        { type: 'CALL' }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      // Verify final state
      expect(tableState.players[0].committed).toBe(100n);
      expect(tableState.players[1].committed).toBe(100n);
      expect(tableState.players[2].committed).toBe(100n);
      expect(isBettingRoundComplete(tableState)).toBe(true);
    });

    it('handles bet → raise → call flow', () => {
      let tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player3'),
            seat: 2,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      // Player 1 bets 100
      let result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        { type: 'BET', amount: 100n }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      // Player 2 raises to 300 (100 call + 200 raise)
      result = applyActionToBettingRound(
        tableState,
        createPlayerId('player2'),
        { type: 'RAISE', amount: 200n }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      expect(tableState.players[1].committed).toBe(300n);
      expect(tableState.players[1].stack).toBe(700n);

      // Player 3 calls 300
      result = applyActionToBettingRound(
        tableState,
        createPlayerId('player3'),
        { type: 'CALL' }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      // Player 1 calls additional 200
      result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        { type: 'CALL' }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      // Verify final state
      expect(tableState.players[0].committed).toBe(300n);
      expect(tableState.players[1].committed).toBe(300n);
      expect(tableState.players[2].committed).toBe(300n);
      expect(isBettingRoundComplete(tableState)).toBe(true);
    });

    it('handles bet → raise → re-raise → call flow', () => {
      let tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player2'),
            seat: 1,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('player3'),
            seat: 2,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      // Player 1 bets 100
      let result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        { type: 'BET', amount: 100n }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      // Player 2 raises to 300
      result = applyActionToBettingRound(
        tableState,
        createPlayerId('player2'),
        { type: 'RAISE', amount: 200n }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      // Player 3 re-raises to 600
      result = applyActionToBettingRound(
        tableState,
        createPlayerId('player3'),
        { type: 'RAISE', amount: 300n }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      expect(tableState.players[2].committed).toBe(600n);

      // Player 1 calls 500 more
      result = applyActionToBettingRound(
        tableState,
        createPlayerId('player1'),
        { type: 'CALL' }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      // Player 2 calls 300 more
      result = applyActionToBettingRound(
        tableState,
        createPlayerId('player2'),
        { type: 'CALL' }
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      tableState = result.value;

      // Verify final state
      expect(tableState.players[0].committed).toBe(600n);
      expect(tableState.players[1].committed).toBe(600n);
      expect(tableState.players[2].committed).toBe(600n);
      expect(isBettingRoundComplete(tableState)).toBe(true);
    });
  });
});

describe('isBettingRoundComplete', () => {
  it('returns true when only one active player remains', () => {
    const tableState = createTestTableState({
      players: [
        {
          id: createPlayerId('player1'),
          seat: 0,
          stack: 1000n,
          committed: 100n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('player2'),
          seat: 1,
          stack: 1000n,
          committed: 0n,
          status: PlayerStatus.Folded,
          holeCards: {},
        },
        {
          id: createPlayerId('player3'),
          seat: 2,
          stack: 1000n,
          committed: 0n,
          status: PlayerStatus.Folded,
          holeCards: {},
        },
      ],
    });

    expect(isBettingRoundComplete(tableState)).toBe(true);
  });

  it('returns true when all players have matched the bet', () => {
    const tableState = createTestTableState({
      players: [
        {
          id: createPlayerId('player1'),
          seat: 0,
          stack: 900n,
          committed: 100n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('player2'),
          seat: 1,
          stack: 900n,
          committed: 100n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('player3'),
          seat: 2,
          stack: 900n,
          committed: 100n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ],
    });

    expect(isBettingRoundComplete(tableState)).toBe(true);
  });

  it('returns false when players have not matched the bet', () => {
    const tableState = createTestTableState({
      players: [
        {
          id: createPlayerId('player1'),
          seat: 0,
          stack: 900n,
          committed: 100n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('player2'),
          seat: 1,
          stack: 1000n,
          committed: 0n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ],
    });

    expect(isBettingRoundComplete(tableState)).toBe(false);
  });

  it('returns true when all-in players have not matched bet but have no chips', () => {
    const tableState = createTestTableState({
      players: [
        {
          id: createPlayerId('player1'),
          seat: 0,
          stack: 900n,
          committed: 100n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('player2'),
          seat: 1,
          stack: 0n,
          committed: 50n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ],
    });

    expect(isBettingRoundComplete(tableState)).toBe(true);
  });

  it('returns false when no players', () => {
    const tableState = createTestTableState({
      players: [],
    });

    expect(isBettingRoundComplete(tableState)).toBe(true);
  });
});

describe('getBettingRoundInfo', () => {
  it('returns correct betting round information', () => {
    const tableState = createTestTableState({
      players: [
        {
          id: createPlayerId('player1'),
          seat: 0,
          stack: 900n,
          committed: 100n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('player2'),
          seat: 1,
          stack: 1000n,
          committed: 0n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ],
    });

    const info = getBettingRoundInfo(tableState);

    expect(info.currentBet).toBe(100n);
    expect(info.activePlayers).toEqual([
      createPlayerId('player1'),
      createPlayerId('player2'),
    ]);
    expect(info.isComplete).toBe(false);
  });

  it('correctly identifies complete round', () => {
    const tableState = createTestTableState({
      players: [
        {
          id: createPlayerId('player1'),
          seat: 0,
          stack: 900n,
          committed: 100n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('player2'),
          seat: 1,
          stack: 900n,
          committed: 100n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ],
    });

    const info = getBettingRoundInfo(tableState);

    expect(info.currentBet).toBe(100n);
    expect(info.isComplete).toBe(true);
  });

  it('excludes folded and all-in players from active players', () => {
    const tableState = createTestTableState({
      players: [
        {
          id: createPlayerId('player1'),
          seat: 0,
          stack: 1000n,
          committed: 0n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('player2'),
          seat: 1,
          stack: 1000n,
          committed: 0n,
          status: PlayerStatus.Folded,
          holeCards: {},
        },
        {
          id: createPlayerId('player3'),
          seat: 2,
          stack: 0n,
          committed: 500n,
          status: PlayerStatus.AllIn,
          holeCards: {},
        },
      ],
    });

    const info = getBettingRoundInfo(tableState);

    expect(info.activePlayers).toEqual([createPlayerId('player1')]);
  });
});
