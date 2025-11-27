/**
 * Unit tests for player action model and validation
 */

import { describe, it, expect } from 'vitest';
import {
  getAvailableActions,
  validateAction,
  PlayerAction,
} from '../../src/betting/actions.js';
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

describe('getAvailableActions', () => {
  describe('when player is not found', () => {
    it('returns empty array', () => {
      const tableState = createTestTableState({
        players: [],
        currentPlayerId: createPlayerId('player1'),
      });

      const actions = getAvailableActions(
        tableState,
        createPlayerId('player1')
      );
      expect(actions).toEqual([]);
    });
  });

  describe("when it is not player's turn", () => {
    it('returns empty array', () => {
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
        currentPlayerId: createPlayerId('player2'),
      });

      const actions = getAvailableActions(
        tableState,
        createPlayerId('player1')
      );
      expect(actions).toEqual([]);
    });
  });

  describe('when player has folded', () => {
    it('returns empty array', () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const actions = getAvailableActions(
        tableState,
        createPlayerId('player1')
      );
      expect(actions).toEqual([]);
    });
  });

  describe('when player is all-in', () => {
    it('returns empty array', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 0n,
            committed: 1000n,
            status: PlayerStatus.AllIn,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const actions = getAvailableActions(
        tableState,
        createPlayerId('player1')
      );
      expect(actions).toEqual([]);
    });
  });

  describe('when no current bet', () => {
    it('returns FOLD, CHECK, BET, ALL_IN', () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const actions = getAvailableActions(
        tableState,
        createPlayerId('player1')
      );
      expect(actions).toContain('FOLD');
      expect(actions).toContain('CHECK');
      expect(actions).toContain('BET');
      expect(actions).toContain('ALL_IN');
      expect(actions).not.toContain('CALL');
      expect(actions).not.toContain('RAISE');
    });
  });

  describe('when there is a bet to call', () => {
    it('returns FOLD, CALL, RAISE, ALL_IN (no CHECK)', () => {
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

      const actions = getAvailableActions(
        tableState,
        createPlayerId('player2')
      );
      expect(actions).toContain('FOLD');
      expect(actions).toContain('CALL');
      expect(actions).toContain('RAISE');
      expect(actions).toContain('ALL_IN');
      expect(actions).not.toContain('CHECK');
      expect(actions).not.toContain('BET');
    });
  });

  describe('when player has small stack', () => {
    it('does not include RAISE if stack is too small', () => {
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
            stack: 50n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player2'),
      });

      const actions = getAvailableActions(
        tableState,
        createPlayerId('player2')
      );
      expect(actions).toContain('CALL');
      expect(actions).toContain('ALL_IN');
      expect(actions).not.toContain('RAISE');
    });
  });

  describe('when player has no chips', () => {
    it('returns only FOLD', () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const actions = getAvailableActions(
        tableState,
        createPlayerId('player1')
      );
      expect(actions).toEqual(['FOLD', 'CHECK']);
    });
  });
});

describe('validateAction', () => {
  describe('FOLD action', () => {
    it("validates successfully when it is player's turn", () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'FOLD' };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
    });
  });

  describe('CHECK action', () => {
    it('validates successfully when no bet to call', () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'CHECK' };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
    });

    it('fails when there is a bet to call', () => {
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

      const action: PlayerAction = { type: 'CHECK' };
      const result = validateAction(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_ACTION);
        expect(result.error.message).toContain('Cannot CHECK');
      }
    });
  });

  describe('CALL action', () => {
    it('validates successfully when player has enough chips', () => {
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

      const action: PlayerAction = { type: 'CALL', amount: 100n };
      const result = validateAction(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isOk(result)).toBe(true);
    });

    it('fails when there is no bet to call', () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'CALL' };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_ACTION);
        expect(result.error.message).toContain('Cannot CALL');
      }
    });

    it('allows calling all-in when player has insufficient chips to full call', () => {
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
            stack: 50n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player2'),
      });

      const action: PlayerAction = { type: 'CALL' };
      const result = validateAction(
        tableState,
        createPlayerId('player2'),
        action
      );

      // Should succeed - player can call all-in with their 50 chips
      expect(isOk(result)).toBe(true);
    });

    it('fails when call amount does not match', () => {
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

      const action: PlayerAction = { type: 'CALL', amount: 50n };
      const result = validateAction(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_BET_AMOUNT);
      }
    });
  });

  describe('BET action', () => {
    it('validates successfully when no current bet', () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'BET', amount: 100n };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
    });

    it('fails when there is already a bet', () => {
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

      const action: PlayerAction = { type: 'BET', amount: 100n };
      const result = validateAction(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_ACTION);
      }
    });

    it('fails when bet amount is not provided', () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'BET' };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_BET_AMOUNT);
      }
    });

    it('fails when bet amount exceeds stack', () => {
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
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'BET', amount: 1000n };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_BET_AMOUNT);
      }
    });

    it('fails when bet amount is zero or negative', () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'BET', amount: 0n };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_BET_AMOUNT);
      }
    });
  });

  describe('RAISE action', () => {
    it('validates successfully when raise is valid', () => {
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
      const result = validateAction(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isOk(result)).toBe(true);
    });

    it('fails when there is no bet to raise', () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'RAISE', amount: 100n };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_ACTION);
      }
    });

    it('fails when raise amount is not provided', () => {
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

      const action: PlayerAction = { type: 'RAISE' };
      const result = validateAction(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_RAISE_AMOUNT);
      }
    });

    it('fails when raise amount exceeds stack', () => {
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
            stack: 500n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player2'),
      });

      const action: PlayerAction = { type: 'RAISE', amount: 1000n };
      const result = validateAction(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_RAISE_AMOUNT);
      }
    });

    it('fails when total raise amount exceeds stack', () => {
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
            stack: 150n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player2'),
      });

      const action: PlayerAction = { type: 'RAISE', amount: 100n };
      const result = validateAction(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_RAISE_AMOUNT);
      }
    });

    it('fails when raise amount is less than minimum', () => {
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

      const action: PlayerAction = { type: 'RAISE', amount: 50n };
      const result = validateAction(
        tableState,
        createPlayerId('player2'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_RAISE_AMOUNT);
        expect(result.error.message).toContain('less than minimum');
      }
    });
  });

  describe('ALL_IN action', () => {
    it('validates successfully when player has chips', () => {
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
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'ALL_IN', amount: 500n };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
    });

    it('validates successfully without amount specified', () => {
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
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'ALL_IN' };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isOk(result)).toBe(true);
    });

    it('fails when player has no chips', () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'ALL_IN' };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INSUFFICIENT_STACK);
      }
    });

    it('fails when amount does not match stack', () => {
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
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'ALL_IN', amount: 300n };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_BET_AMOUNT);
      }
    });
  });

  describe('player turn validation', () => {
    it('fails when player not found', () => {
      const tableState = createTestTableState({
        players: [],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'FOLD' };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.PLAYER_NOT_FOUND);
      }
    });

    it("fails when not player's turn", () => {
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
        currentPlayerId: createPlayerId('player2'),
      });

      const action: PlayerAction = { type: 'FOLD' };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.NOT_PLAYER_TURN);
      }
    });

    it('fails when player has folded', () => {
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
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'CHECK' };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
      }
    });

    it('fails when player is all-in', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 0n,
            committed: 1000n,
            status: PlayerStatus.AllIn,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'CHECK' };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
      }
    });

    it('fails when player is sitting out', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('player1'),
            seat: 0,
            stack: 1000n,
            committed: 0n,
            status: PlayerStatus.SittingOut,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('player1'),
      });

      const action: PlayerAction = { type: 'CHECK' };
      const result = validateAction(
        tableState,
        createPlayerId('player1'),
        action
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
      }
    });
  });
});
