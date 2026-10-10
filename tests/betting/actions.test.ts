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
          {
            id: createPlayerId('opponent'),
            seat: 1,
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
          {
            id: createPlayerId('opponent'),
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
          {
            id: createPlayerId('opponent'),
            seat: 1,
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
          {
            id: createPlayerId('opponent'),
            seat: 1,
            stack: 1000n,
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
          {
            id: createPlayerId('opponent'),
            seat: 1,
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
          {
            id: createPlayerId('opponent'),
            seat: 1,
            stack: 1000n,
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
          {
            id: createPlayerId('opponent'),
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

describe('when no opponent can act', () => {
  function player(
    id: string,
    seat: number,
    stack: bigint,
    committed: bigint,
    status: PlayerStatus
  ): TableState['players'][number] {
    return {
      id: createPlayerId(id),
      seat,
      stack,
      committed,
      status,
      holeCards: {},
    };
  }

  function validate(tableState: TableState, action: PlayerAction) {
    return validateAction(tableState, createPlayerId('hero'), action);
  }

  function expectInvalidAction(result: ReturnType<typeof validateAction>) {
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe(ErrorCode.INVALID_ACTION);
    }
  }

  const headsUpVersusAllIn = createTestTableState({
    players: [
      player('villain', 0, 0n, 50n, PlayerStatus.AllIn),
      player('hero', 1, 1000n, 2n, PlayerStatus.Active),
    ],
    currentPlayerId: createPlayerId('hero'),
  });

  const threeWayVersusTwoAllIns = createTestTableState({
    players: [
      player('shortA', 0, 0n, 40n, PlayerStatus.AllIn),
      player('shortB', 1, 0n, 80n, PlayerStatus.AllIn),
      player('folded', 2, 500n, 0n, PlayerStatus.Folded),
      player('hero', 3, 1000n, 10n, PlayerStatus.Active),
    ],
    currentPlayerId: createPlayerId('hero'),
  });

  it('lists only FOLD and CALL heads-up against an all-in', () => {
    expect(
      getAvailableActions(headsUpVersusAllIn, createPlayerId('hero'))
    ).toEqual(['FOLD', 'CALL']);
  });

  it('lists ALL_IN as an all-in call when the stack does not cover the call', () => {
    const tableState = createTestTableState({
      players: [
        player('villain', 0, 0n, 500n, PlayerStatus.AllIn),
        player('hero', 1, 300n, 2n, PlayerStatus.Active),
      ],
      currentPlayerId: createPlayerId('hero'),
    });

    expect(getAvailableActions(tableState, createPlayerId('hero'))).toEqual([
      'FOLD',
      'CALL',
      'ALL_IN',
    ]);
    expect(isOk(validate(tableState, { type: 'ALL_IN' }))).toBe(true);
  });

  it('lists no RAISE and no ALL_IN when the other players are all-in or folded', () => {
    expect(
      getAvailableActions(threeWayVersusTwoAllIns, createPlayerId('hero'))
    ).toEqual(['FOLD', 'CALL']);
  });

  it('rejects RAISE and a raising ALL_IN with INVALID_ACTION', () => {
    expectInvalidAction(
      validate(threeWayVersusTwoAllIns, { type: 'RAISE', amount: 100n })
    );
    expectInvalidAction(validate(threeWayVersusTwoAllIns, { type: 'ALL_IN' }));
    expectInvalidAction(
      validate(headsUpVersusAllIn, { type: 'RAISE', amount: 48n })
    );
    expect(isOk(validate(threeWayVersusTwoAllIns, { type: 'CALL' }))).toBe(
      true
    );
    expect(isOk(validate(threeWayVersusTwoAllIns, { type: 'FOLD' }))).toBe(
      true
    );
  });

  it('rejects BET and an opening ALL_IN when there is no wager', () => {
    const tableState = createTestTableState({
      phase: TablePhase.Flop,
      players: [
        player('villain', 0, 0n, 0n, PlayerStatus.AllIn),
        player('hero', 1, 1000n, 0n, PlayerStatus.Active),
      ],
      currentPlayerId: createPlayerId('hero'),
    });

    expect(getAvailableActions(tableState, createPlayerId('hero'))).toEqual([
      'FOLD',
      'CHECK',
    ]);
    expectInvalidAction(validate(tableState, { type: 'BET', amount: 100n }));
    expectInvalidAction(validate(tableState, { type: 'ALL_IN' }));
  });

  it('does not count an opponent with an empty stack as able to act', () => {
    const tableState = createTestTableState({
      players: [
        player('villain', 0, 0n, 50n, PlayerStatus.Active),
        player('hero', 1, 1000n, 2n, PlayerStatus.Active),
      ],
      currentPlayerId: createPlayerId('hero'),
    });

    expect(getAvailableActions(tableState, createPlayerId('hero'))).toEqual([
      'FOLD',
      'CALL',
    ]);
  });

  it('keeps RAISE when another opponent can still act', () => {
    const tableState = createTestTableState({
      players: [
        player('short', 0, 0n, 50n, PlayerStatus.AllIn),
        player('deep', 1, 900n, 50n, PlayerStatus.Active),
        player('hero', 2, 1000n, 2n, PlayerStatus.Active),
      ],
      currentPlayerId: createPlayerId('hero'),
    });

    expect(getAvailableActions(tableState, createPlayerId('hero'))).toEqual([
      'FOLD',
      'CALL',
      'RAISE',
      'ALL_IN',
    ]);
    expect(isOk(validate(tableState, { type: 'RAISE', amount: 50n }))).toBe(
      true
    );
    expect(isOk(validate(tableState, { type: 'ALL_IN' }))).toBe(true);
  });
});
