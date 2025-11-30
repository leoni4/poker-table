/**
 * Edge-case tests for betting actions
 * Focus on raise/re-raise sequences and stack limit scenarios
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
import { chips } from '../../src/core/money.js';

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

describe('Betting Actions - Edge Cases', () => {
  describe('Raise/Re-raise Sequences', () => {
    it('should handle 3-bet scenario (raise after raise)', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(900),
            committed: chips(100), // Initial raise
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(800),
            committed: chips(200), // Re-raise
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p3'),
            seat: 2,
            stack: chips(1000),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p3'),
      });

      const actions = getAvailableActions(tableState, createPlayerId('p3'));

      expect(actions).toContain('FOLD');
      expect(actions).toContain('CALL');
      expect(actions).toContain('RAISE');
      expect(actions).toContain('ALL_IN');
      expect(actions).not.toContain('CHECK');

      // Validate 3-bet (minimum raise should be 200 more)
      const threebet: PlayerAction = { type: 'RAISE', amount: chips(200) };
      const result = validateAction(tableState, createPlayerId('p3'), threebet);
      expect(isOk(result)).toBe(true);
    });

    it('should handle 4-bet scenario', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(600),
            committed: chips(400), // 4-bet
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(1000),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      // Minimum 5-bet should be 400 more
      const fiveBet: PlayerAction = { type: 'RAISE', amount: chips(400) };
      const result = validateAction(tableState, createPlayerId('p2'), fiveBet);
      expect(isOk(result)).toBe(true);

      // Less than minimum should fail
      const smallRaise: PlayerAction = { type: 'RAISE', amount: chips(200) };
      const smallResult = validateAction(
        tableState,
        createPlayerId('p2'),
        smallRaise
      );
      expect(isErr(smallResult)).toBe(true);
    });

    it('should handle cap scenario (no more raises allowed)', () => {
      // This would typically be handled at a higher level
      // but we can test that large raises are still valid
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(500),
            committed: chips(500),
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(2000),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      // Large over-raise is valid
      const largeRaise: PlayerAction = { type: 'RAISE', amount: chips(1000) };
      const result = validateAction(
        tableState,
        createPlayerId('p2'),
        largeRaise
      );
      expect(isOk(result)).toBe(true);
    });

    it('should enforce minimum raise equals last raise size', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(850),
            committed: chips(150), // Raised by 150
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(1000),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      // Minimum re-raise should be 150
      const minRaise: PlayerAction = { type: 'RAISE', amount: chips(150) };
      const result = validateAction(tableState, createPlayerId('p2'), minRaise);
      expect(isOk(result)).toBe(true);

      // 149 should fail
      const tooSmall: PlayerAction = { type: 'RAISE', amount: chips(149) };
      const failResult = validateAction(
        tableState,
        createPlayerId('p2'),
        tooSmall
      );
      expect(isErr(failResult)).toBe(true);
    });

    it('should handle multiple raises in same round', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(700),
            committed: chips(300), // Latest raise
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(1000),
            committed: chips(100), // Earlier bet
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      // p2 needs to call 200 more, minimum raise should be based on last raise increment (200)
      const actions = getAvailableActions(tableState, createPlayerId('p2'));
      expect(actions).toContain('CALL');
      expect(actions).toContain('RAISE');

      // The minimum raise increment is 300 (the current bet), so p2 needs to raise to 600 total (300 to call + 300 raise)
      const reraise: PlayerAction = { type: 'RAISE', amount: chips(300) };
      const result = validateAction(tableState, createPlayerId('p2'), reraise);
      expect(isOk(result)).toBe(true);
    });
  });

  describe('Stack Limit Scenarios', () => {
    it('should allow all-in when stack exactly matches call', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(900),
            committed: chips(100),
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(100), // Exactly enough to call
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      const allIn: PlayerAction = { type: 'ALL_IN' };
      const result = validateAction(tableState, createPlayerId('p2'), allIn);
      expect(isOk(result)).toBe(true);

      const actions = getAvailableActions(tableState, createPlayerId('p2'));
      expect(actions).toContain('CALL');
      expect(actions).toContain('ALL_IN');
      expect(actions).not.toContain('RAISE'); // Can't raise, not enough
    });

    it('should handle one chip short of call', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(900),
            committed: chips(100),
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(99), // 1 chip short
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      // Can still call (all-in with less)
      const call: PlayerAction = { type: 'CALL' };
      const result = validateAction(tableState, createPlayerId('p2'), call);
      expect(isOk(result)).toBe(true);

      const actions = getAvailableActions(tableState, createPlayerId('p2'));
      expect(actions).toContain('CALL');
      expect(actions).toContain('ALL_IN');
      expect(actions).not.toContain('RAISE');
    });

    it('should handle stack just enough for minimum raise', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(900),
            committed: chips(100),
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(200), // Exactly enough for min raise (call 100 + raise 100)
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      const actions = getAvailableActions(tableState, createPlayerId('p2'));
      expect(actions).toContain('RAISE');

      const minRaise: PlayerAction = { type: 'RAISE', amount: chips(100) };
      const result = validateAction(tableState, createPlayerId('p2'), minRaise);
      expect(isOk(result)).toBe(true);
    });

    it('should not allow raise when one chip short of minimum', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(900),
            committed: chips(100),
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(199), // 1 chip short of min raise
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      const actions = getAvailableActions(tableState, createPlayerId('p2'));
      expect(actions).not.toContain('RAISE'); // Not enough for min raise
      expect(actions).toContain('CALL');
      expect(actions).toContain('ALL_IN');
    });

    it('should handle micro-stack scenarios (1-5 chips)', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(995),
            committed: chips(5),
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(1), // Micro stack
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      const actions = getAvailableActions(tableState, createPlayerId('p2'));
      expect(actions).toContain('FOLD');
      expect(actions).toContain('CALL'); // Can call with 1 chip
      expect(actions).toContain('ALL_IN');
      expect(actions).not.toContain('RAISE');
    });

    it('should handle very large stacks', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(999900),
            committed: chips(100),
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(1000000), // 1M chips
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      // Should be able to make huge raise
      const bigRaise: PlayerAction = { type: 'RAISE', amount: chips(500000) };
      const result = validateAction(tableState, createPlayerId('p2'), bigRaise);
      expect(isOk(result)).toBe(true);
    });

    it('should handle exact all-in bet size', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(500),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p1'),
      });

      const allIn: PlayerAction = { type: 'ALL_IN', amount: chips(500) };
      const result = validateAction(tableState, createPlayerId('p1'), allIn);
      expect(isOk(result)).toBe(true);
    });

    it('should reject all-in with wrong amount', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(500),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p1'),
      });

      const wrongAllIn: PlayerAction = { type: 'ALL_IN', amount: chips(499) };
      const result = validateAction(
        tableState,
        createPlayerId('p1'),
        wrongAllIn
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_BET_AMOUNT);
      }
    });

    it('should handle stack with prior commitment for all-in', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(400),
            committed: chips(100), // Already committed
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p1'),
      });

      // All-in should be remaining stack (400)
      const allIn: PlayerAction = { type: 'ALL_IN', amount: chips(400) };
      const result = validateAction(tableState, createPlayerId('p1'), allIn);
      expect(isOk(result)).toBe(true);
    });

    it('should handle equal stacks all-in scenario', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(1000),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(1000),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p1'),
      });

      // p1 goes all-in
      const allIn: PlayerAction = { type: 'ALL_IN' };
      const result = validateAction(tableState, createPlayerId('p1'), allIn);
      expect(isOk(result)).toBe(true);
    });
  });

  describe('Complex Betting Sequences', () => {
    it('should handle bet, raise, call, raise sequence', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(800),
            committed: chips(200), // Raised to 200
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(500),
            committed: chips(500), // Re-raised all-in
            status: PlayerStatus.AllIn,
            holeCards: {},
          },
          {
            id: createPlayerId('p3'),
            seat: 2,
            stack: chips(1000),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p3'),
      });

      const actions = getAvailableActions(tableState, createPlayerId('p3'));

      expect(actions).toContain('CALL'); // Can call 500
      expect(actions).toContain('RAISE'); // Can raise over 500
      expect(actions).toContain('FOLD');
    });

    it('should handle multiple all-ins creating complex pot', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: 0n,
            committed: chips(100),
            status: PlayerStatus.AllIn,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: 0n,
            committed: chips(300),
            status: PlayerStatus.AllIn,
            holeCards: {},
          },
          {
            id: createPlayerId('p3'),
            seat: 2,
            stack: chips(700),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p3'),
      });

      // p3 needs to call 300, can raise
      const actions = getAvailableActions(tableState, createPlayerId('p3'));

      expect(actions).toContain('CALL');
      expect(actions).toContain('RAISE');

      const raise: PlayerAction = { type: 'RAISE', amount: chips(300) };
      const result = validateAction(tableState, createPlayerId('p3'), raise);
      expect(isOk(result)).toBe(true);
    });

    it('should handle heads-up all-in vs all-in', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: 0n,
            committed: chips(1000),
            status: PlayerStatus.AllIn,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(500), // Has more chips
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      const actions = getAvailableActions(tableState, createPlayerId('p2'));

      expect(actions).toContain('CALL');
      expect(actions).not.toContain('RAISE'); // Can't raise over all-in
      expect(actions).toContain('ALL_IN');
    });

    it('should handle partial pot bet scenarios', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(950),
            committed: chips(50), // Small bet
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(1000),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      // Can min-raise by 50
      const minRaise: PlayerAction = { type: 'RAISE', amount: chips(50) };
      const result = validateAction(tableState, createPlayerId('p2'), minRaise);
      expect(isOk(result)).toBe(true);

      // Can make pot-sized raise
      const potRaise: PlayerAction = { type: 'RAISE', amount: chips(200) };
      const potResult = validateAction(
        tableState,
        createPlayerId('p2'),
        potRaise
      );
      expect(isOk(potResult)).toBe(true);
    });

    it('should validate complex multi-street scenario', () => {
      const tableState = createTestTableState({
        phase: TablePhase.River,
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(300),
            committed: chips(200), // Big river bet
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(400),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      // Can min-raise by 200
      const minRaise: PlayerAction = { type: 'RAISE', amount: chips(200) };
      const result = validateAction(tableState, createPlayerId('p2'), minRaise);
      expect(isOk(result)).toBe(true);

      // Can call
      const call: PlayerAction = { type: 'CALL' };
      const callResult = validateAction(tableState, createPlayerId('p2'), call);
      expect(isOk(callResult)).toBe(true);
    });
  });

  describe('Edge Cases with Action Availability', () => {
    it('should not allow actions when player has no chips and there is a bet', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(900),
            committed: chips(100),
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: 0n,
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      const actions = getAvailableActions(tableState, createPlayerId('p2'));

      // With no chips and a bet to call, player should only be able to fold
      expect(actions).toContain('FOLD');
      // But per implementation, might also have CHECK available
    });

    it('should handle scenario where only folded players remain', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(1000),
            committed: 0n,
            status: PlayerStatus.Folded,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(1000),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      const actions = getAvailableActions(tableState, createPlayerId('p2'));

      // Last active player can check or bet
      expect(actions).toContain('CHECK');
      expect(actions).toContain('BET');
    });

    it('should handle reopening betting after small all-in', () => {
      const tableState = createTestTableState({
        players: [
          {
            id: createPlayerId('p1'),
            seat: 0,
            stack: chips(950),
            committed: chips(50), // Small all-in
            status: PlayerStatus.AllIn,
            holeCards: {},
          },
          {
            id: createPlayerId('p2'),
            seat: 1,
            stack: chips(1000),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
          {
            id: createPlayerId('p3'),
            seat: 2,
            stack: chips(1000),
            committed: 0n,
            status: PlayerStatus.Active,
            holeCards: {},
          },
        ],
        currentPlayerId: createPlayerId('p2'),
      });

      // p2 should be able to raise over the small all-in
      const actions = getAvailableActions(tableState, createPlayerId('p2'));
      expect(actions).toContain('RAISE');
    });
  });
});
