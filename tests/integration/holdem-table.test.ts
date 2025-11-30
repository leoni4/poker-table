/**
 * Integration tests for HoldemTable public API
 * These tests demonstrate real-world usage patterns
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HoldemTable,
  createHoldemTable,
  createDefaultTableConfig,
  createPlayerId,
  chips,
  TablePhase,
  PlayerStatus,
  isOk,
  TableConfig,
} from '../../src/index.js';

describe('HoldemTable - Public API Integration Tests', () => {
  let table: HoldemTable;
  let config: TableConfig;

  beforeEach(() => {
    config = createDefaultTableConfig();
    config.rngSeed = 42; // Deterministic for testing
    table = createHoldemTable(config);
  });

  describe('Basic table creation and seating', () => {
    it('should create a table and seat players', () => {
      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      // Seat first player
      const seat1Result = table.seatPlayer(player1, chips(1000));
      expect(isOk(seat1Result)).toBe(true);

      if (!isOk(seat1Result)) return;
      expect(seat1Result.value.players).toHaveLength(1);
      expect(seat1Result.value.players[0].id).toBe(player1);
      expect(seat1Result.value.players[0].stack).toBe(1000n);

      // Seat second player
      const seat2Result = table.seatPlayer(player2, chips(2000));
      expect(isOk(seat2Result)).toBe(true);

      if (!isOk(seat2Result)) return;
      expect(seat2Result.value.players).toHaveLength(2);
      expect(seat2Result.value.players[1].id).toBe(player2);
      expect(seat2Result.value.players[1].stack).toBe(2000n);
    });

    it('should return table configuration', () => {
      const tableConfig = table.getConfig();
      expect(tableConfig.smallBlind).toBe(1n);
      expect(tableConfig.bigBlind).toBe(2n);
      expect(tableConfig.minPlayers).toBe(2);
      expect(tableConfig.maxPlayers).toBe(10);
    });

    it('should reject player with insufficient buy-in', () => {
      const player = createPlayerId('charlie');
      const result = table.seatPlayer(player, chips(1)); // Less than big blind
      expect(isOk(result)).toBe(false);
    });
  });

  describe('Complete hand flow - heads-up', () => {
    it('should start and complete a heads-up hand', () => {
      // Setup: Seat two players
      const alice = createPlayerId('alice');
      const bob = createPlayerId('bob');

      table.seatPlayer(alice, chips(1000));
      table.seatPlayer(bob, chips(1000));

      // Start hand
      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      let state = startResult.value;

      // Verify hand started correctly
      expect(state.phase).toBe(TablePhase.Preflop);
      expect(state.handId).toBe(1);
      expect(state.dealerSeat).toBeDefined();
      expect(state.communityCards).toHaveLength(0);

      // Verify both players have hole cards
      expect(state.players[0].holeCards.cards).toHaveLength(2);
      expect(state.players[1].holeCards.cards).toHaveLength(2);

      // Verify blinds were posted
      const totalCommitted = state.players.reduce(
        (sum, p) => sum + p.committed,
        0n
      );
      expect(totalCommitted).toBe(3n); // SB (1) + BB (2)

      // Verify someone is set to act
      expect(state.currentPlayerId).toBeDefined();

      // Player to act should be the dealer (SB in heads-up)
      const currentPlayer = state.players.find(
        (p) => p.id === state.currentPlayerId
      );
      expect(currentPlayer).toBeDefined();

      // Action 1: Call the big blind
      const callResult = table.applyAction(state.currentPlayerId!, {
        type: 'CALL',
      });
      expect(isOk(callResult)).toBe(true);
      if (!isOk(callResult)) return;

      // Action 2: BB checks
      const checkResult = table.applyAction(callResult.value.currentPlayerId!, {
        type: 'CHECK',
      });
      expect(isOk(checkResult)).toBe(true);
      if (!isOk(checkResult)) return;

      state = checkResult.value;

      // Should have advanced past preflop with community cards
      expect(state.phase).not.toBe(TablePhase.Preflop);
      expect(state.communityCards.length).toBeGreaterThan(0);

      // Continue checking until showdown
      let actionsCount = 0;
      const maxActions = 20;

      while (state.phase !== TablePhase.Showdown && actionsCount < maxActions) {
        if (!state.currentPlayerId) break;

        const actionResult = table.applyAction(state.currentPlayerId, {
          type: 'CHECK',
        });
        expect(isOk(actionResult)).toBe(true);
        if (!isOk(actionResult)) break;

        state = actionResult.value;
        actionsCount++;
      }

      // Should reach showdown
      expect(state.phase).toBe(TablePhase.Showdown);
      expect(state.currentPlayerId).toBeUndefined();
      expect(state.communityCards).toHaveLength(5);
      expect(actionsCount).toBeLessThan(maxActions);
    });
  });

  describe('Complete hand flow - multi-way', () => {
    it('should handle a 3-player hand with betting', () => {
      // Setup: Seat three players
      const alice = createPlayerId('alice');
      const bob = createPlayerId('bob');
      const charlie = createPlayerId('charlie');

      table.seatPlayer(alice, chips(1000));
      table.seatPlayer(bob, chips(1000));
      table.seatPlayer(charlie, chips(1000));

      // Start hand
      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      let state = startResult.value;

      // Verify 3 players active
      expect(state.players).toHaveLength(3);
      expect(state.phase).toBe(TablePhase.Preflop);

      // First player calls
      let actionResult = table.applyAction(state.currentPlayerId!, {
        type: 'CALL',
      });
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      // Second player raises
      actionResult = table.applyAction(actionResult.value.currentPlayerId!, {
        type: 'RAISE',
        amount: 10n,
      });
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      // Third player (BB) calls
      actionResult = table.applyAction(actionResult.value.currentPlayerId!, {
        type: 'CALL',
      });
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      // First player calls the raise
      actionResult = table.applyAction(actionResult.value.currentPlayerId!, {
        type: 'CALL',
      });
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      state = actionResult.value;

      // Should advance to flop
      expect(state.phase).toBe(TablePhase.Flop);
      expect(state.communityCards).toHaveLength(3);
    });

    it('should handle early fold ending the hand', () => {
      // Setup: Seat three players
      const alice = createPlayerId('alice');
      const bob = createPlayerId('bob');
      const charlie = createPlayerId('charlie');

      table.seatPlayer(alice, chips(1000));
      table.seatPlayer(bob, chips(1000));
      table.seatPlayer(charlie, chips(1000));

      // Start hand
      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      let state = startResult.value;

      // First player folds
      let actionResult = table.applyAction(state.currentPlayerId!, {
        type: 'FOLD',
      });
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      // Second player folds
      actionResult = table.applyAction(actionResult.value.currentPlayerId!, {
        type: 'FOLD',
      });
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      state = actionResult.value;

      // Hand should end immediately
      expect(state.phase).toBe(TablePhase.Showdown);
      expect(state.currentPlayerId).toBeUndefined();

      // Only one active player should remain
      const activePlayers = state.players.filter(
        (p) => p.status === PlayerStatus.Active
      );
      expect(activePlayers).toHaveLength(1);
    });
  });

  describe('Betting actions', () => {
    it('should handle bet and raise actions', () => {
      const alice = createPlayerId('alice');
      const bob = createPlayerId('bob');

      table.seatPlayer(alice, chips(1000));
      table.seatPlayer(bob, chips(1000));

      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      // Call to see flop
      let actionResult = table.applyAction(startResult.value.currentPlayerId!, {
        type: 'CALL',
      });
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      actionResult = table.applyAction(actionResult.value.currentPlayerId!, {
        type: 'CHECK',
      });
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      // Now on flop, first player bets
      actionResult = table.applyAction(actionResult.value.currentPlayerId!, {
        type: 'BET',
        amount: 20n,
      });
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      let state = actionResult.value;
      const bettor = state.players.find((p) => p.committed === 20n);
      expect(bettor).toBeDefined();

      // Second player raises
      actionResult = table.applyAction(state.currentPlayerId!, {
        type: 'RAISE',
        amount: 40n,
      });
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      state = actionResult.value;
      const raiser = state.players.find((p) => p.committed === 60n);
      expect(raiser).toBeDefined();
    });

    it('should handle all-in action', () => {
      const alice = createPlayerId('alice');
      const bob = createPlayerId('bob');

      table.seatPlayer(alice, chips(100));
      table.seatPlayer(bob, chips(1000));

      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      // Player with short stack goes all-in
      const actionResult = table.applyAction(
        startResult.value.currentPlayerId!,
        {
          type: 'ALL_IN',
        }
      );
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      const state = actionResult.value;
      const allInPlayer = state.players.find(
        (p) => p.status === PlayerStatus.AllIn
      );
      expect(allInPlayer).toBeDefined();
      expect(allInPlayer!.stack).toBe(0n);
    });
  });

  describe('Player management', () => {
    it('should handle rebuy', () => {
      const alice = createPlayerId('alice');

      table.seatPlayer(alice, chips(100));

      const rebuyResult = table.rebuyPlayer(alice, chips(500));
      expect(isOk(rebuyResult)).toBe(true);
      if (!isOk(rebuyResult)) return;

      const state = rebuyResult.value;
      const player = state.players.find((p) => p.id === alice);
      expect(player?.stack).toBe(600n); // 100 + 500
    });

    it('should handle player removal', () => {
      const alice = createPlayerId('alice');
      const bob = createPlayerId('bob');

      table.seatPlayer(alice, chips(1000));
      table.seatPlayer(bob, chips(1000));

      const removeResult = table.removePlayer(bob);
      expect(isOk(removeResult)).toBe(true);
      if (!isOk(removeResult)) return;

      const state = removeResult.value;
      expect(state.players).toHaveLength(1);
      expect(state.players[0].id).toBe(alice);
    });
  });

  describe('Error handling', () => {
    it('should reject starting hand with insufficient players', () => {
      const alice = createPlayerId('alice');
      table.seatPlayer(alice, chips(1000));

      const result = table.startHand();
      expect(isOk(result)).toBe(false);
    });

    it('should reject invalid action (checking when there is a bet)', () => {
      const alice = createPlayerId('alice');
      const bob = createPlayerId('bob');

      table.seatPlayer(alice, chips(1000));
      table.seatPlayer(bob, chips(1000));

      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      // First player raises
      const actionResult = table.applyAction(
        startResult.value.currentPlayerId!,
        {
          type: 'RAISE',
          amount: 10n,
        }
      );
      expect(isOk(actionResult)).toBe(true);
      if (!isOk(actionResult)) return;

      // Second player tries to check (should fail)
      const checkResult = table.applyAction(
        actionResult.value.currentPlayerId!,
        {
          type: 'CHECK',
        }
      );
      expect(isOk(checkResult)).toBe(false);
    });

    it('should reject action when not player turn', () => {
      const alice = createPlayerId('alice');
      const bob = createPlayerId('bob');

      table.seatPlayer(alice, chips(1000));
      table.seatPlayer(bob, chips(1000));

      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      // Find the player who is NOT current
      const notCurrentPlayer = startResult.value.players.find(
        (p) => p.id !== startResult.value.currentPlayerId
      )?.id;

      if (!notCurrentPlayer) return;

      // Try to act out of turn
      const result = table.applyAction(notCurrentPlayer, { type: 'FOLD' });
      expect(isOk(result)).toBe(false);
    });
  });

  describe('State immutability', () => {
    it('should return independent state snapshots', () => {
      const alice = createPlayerId('alice');
      const bob = createPlayerId('bob');

      table.seatPlayer(alice, chips(1000));
      table.seatPlayer(bob, chips(1000));

      const state1 = table.getState();
      table.startHand();
      const state2 = table.getState();

      // States should be independent
      expect(state1.handId).not.toBe(state2.handId);
      expect(state1.phase).not.toBe(state2.phase);

      // Modifying state1 shouldn't affect state2
      state1.players[0].stack = 0n;
      expect(state2.players[0].stack).not.toBe(0n);
    });
  });

  describe('Real-world usage pattern', () => {
    it('should simulate a complete poker hand scenario', () => {
      // This test demonstrates a realistic usage pattern
      const config = createDefaultTableConfig();
      config.rngSeed = 123;
      const gameTable = createHoldemTable(config);

      // Seat 4 players with different stack sizes
      const players = [
        { id: createPlayerId('alice'), stack: chips(1000) },
        { id: createPlayerId('bob'), stack: chips(1500) },
        { id: createPlayerId('charlie'), stack: chips(800) },
        { id: createPlayerId('diana'), stack: chips(2000) },
      ];

      for (const player of players) {
        const result = gameTable.seatPlayer(player.id, player.stack);
        expect(isOk(result)).toBe(true);
      }

      // Verify initial state
      let state = gameTable.getState();
      expect(state.phase).toBe(TablePhase.Idle);
      expect(state.players).toHaveLength(4);

      // Start the hand
      const startResult = gameTable.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      state = startResult.value;
      expect(state.phase).toBe(TablePhase.Preflop);
      expect(state.handId).toBe(1);

      // Verify all players have cards
      for (const player of state.players) {
        expect(player.holeCards.cards).toHaveLength(2);
      }

      // Play out preflop: everyone calls
      let currentState = state;

      // Track number of actions to prevent infinite loops
      let actionsCount = 0;
      const maxActions = 20;

      while (
        currentState.phase === TablePhase.Preflop &&
        actionsCount < maxActions
      ) {
        if (!currentState.currentPlayerId) break;

        const actionResult = gameTable.applyAction(
          currentState.currentPlayerId,
          {
            type: 'CALL',
          }
        );

        expect(isOk(actionResult)).toBe(true);
        if (!isOk(actionResult)) break;

        currentState = actionResult.value;
        actionsCount++;
      }

      // Should have progressed to flop
      expect(currentState.phase).toBe(TablePhase.Flop);
      expect(currentState.communityCards).toHaveLength(3);
      expect(actionsCount).toBeLessThan(maxActions);
    });
  });
});
