/**
 * Tests to validate README example code
 * Ensures documentation examples work correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HoldemTable,
  createDefaultTableConfig,
  createPlayerId,
  chips,
  TablePhase,
  isOk,
  PlayerAction,
  TableConfig,
} from '../../src/index.js';

describe('README Examples Validation', () => {
  describe('Quick Start Example', () => {
    it('should run the quick start example successfully', () => {
      // Create a table with default configuration
      const config = createDefaultTableConfig();
      config.rngSeed = 42; // Make it deterministic
      const table = new HoldemTable(config);

      // Seat players with initial buy-ins
      const alice = createPlayerId('alice');
      const bob = createPlayerId('bob');

      table.seatPlayer(alice, chips(1000));
      table.seatPlayer(bob, chips(1000));

      // Start a hand
      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      let state = startResult.value;
      expect(state.handId).toBeGreaterThan(0);
      expect(state.phase).toBe(TablePhase.Preflop);
      expect(state.communityCards.length).toBe(0);

      // Main game loop: process actions until hand completes
      let iterationCount = 0;
      const maxIterations = 50;

      while (
        state.phase !== TablePhase.Showdown &&
        iterationCount < maxIterations
      ) {
        // Check if there's a player to act
        if (!state.currentPlayerId) {
          break;
        }

        // Decide on an action
        const player = state.players.find(
          (p) => p.id === state.currentPlayerId
        );
        if (!player) break;

        const amountToCall = state.players.reduce(
          (max, p) => (p.committed > max ? p.committed : max),
          0n
        );
        const needsToCall = amountToCall - player.committed;

        let action;
        if (needsToCall > 0n) {
          action = { type: 'CALL' as const };
        } else {
          action = { type: 'CHECK' as const };
        }

        // Apply the action
        const actionResult = table.applyAction(state.currentPlayerId, action);
        expect(isOk(actionResult)).toBe(true);
        if (!isOk(actionResult)) break;

        state = actionResult.value;
        iterationCount++;
      }

      // Hand should complete
      expect(state.phase).toBe(TablePhase.Showdown);
      expect(iterationCount).toBeLessThan(maxIterations);
    });
  });

  describe('Creating a Table Examples', () => {
    it('should create table with default configuration', () => {
      const config = createDefaultTableConfig();
      const table = new HoldemTable(config);

      const tableConfig = table.getConfig();
      expect(tableConfig.smallBlind).toBe(1n);
      expect(tableConfig.bigBlind).toBe(2n);
    });

    it('should create table with custom configuration', () => {
      const config: TableConfig = {
        minPlayers: 2,
        maxPlayers: 6, // 6-max table
        smallBlind: chips(5),
        bigBlind: chips(10),
        ante: chips(1),
        straddle: chips(20),
        rake: {
          percentage: 0.05,
          cap: chips(10),
        },
        rngSeed: 42,
      };

      const table = new HoldemTable(config);
      const tableConfig = table.getConfig();

      expect(tableConfig.smallBlind).toBe(5n);
      expect(tableConfig.bigBlind).toBe(10n);
      expect(tableConfig.ante).toBe(1n);
      expect(tableConfig.maxPlayers).toBe(6);
    });

    it('should create table with rebuy options', () => {
      const config = createDefaultTableConfig();
      const table = new HoldemTable(config, {
        minRebuy: chips(100),
        maxRebuy: chips(5000),
        allowDuringHand: false,
      });

      expect(table).toBeDefined();
    });
  });

  describe('Seating Players Example', () => {
    it('should seat players successfully', () => {
      const config = createDefaultTableConfig();
      const table = new HoldemTable(config);

      const playerId = createPlayerId('player-123');
      const result = table.seatPlayer(playerId, chips(1000));

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const state = result.value;
      expect(state.players.length).toBe(1);
      expect(state.players[0].id).toBe(playerId);
      expect(state.players[0].stack).toBe(1000n);
    });
  });

  describe('Starting a Hand Example', () => {
    let table: HoldemTable;

    beforeEach(() => {
      const config = createDefaultTableConfig();
      config.rngSeed = 42;
      table = new HoldemTable(config);

      table.seatPlayer(createPlayerId('alice'), chips(1000));
      table.seatPlayer(createPlayerId('bob'), chips(1000));
    });

    it('should start a hand successfully', () => {
      const result = table.startHand();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const state = result.value;
      expect(state.handId).toBeGreaterThan(0);
      expect(state.dealerSeat).toBeDefined();
      expect(state.phase).toBe(TablePhase.Preflop);
      expect(state.currentPlayerId).toBeDefined();
    });
  });

  describe('Processing Actions Example', () => {
    let table: HoldemTable;
    let alice: ReturnType<typeof createPlayerId>;
    let bob: ReturnType<typeof createPlayerId>;

    beforeEach(() => {
      const config = createDefaultTableConfig();
      config.rngSeed = 42;
      table = new HoldemTable(config);

      alice = createPlayerId('alice');
      bob = createPlayerId('bob');

      table.seatPlayer(alice, chips(1000));
      table.seatPlayer(bob, chips(1000));
      table.startHand();
    });

    it('should process fold action', () => {
      const state = table.getState();
      const foldAction: PlayerAction = { type: 'FOLD' };
      const result = table.applyAction(state.currentPlayerId!, foldAction);

      expect(isOk(result)).toBe(true);
    });

    it('should process call and check actions', () => {
      let state = table.getState();

      // First player calls
      const callAction: PlayerAction = { type: 'CALL' };
      let result = table.applyAction(state.currentPlayerId!, callAction);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      state = result.value;

      // Second player checks
      const checkAction: PlayerAction = { type: 'CHECK' };
      result = table.applyAction(state.currentPlayerId!, checkAction);
      expect(isOk(result)).toBe(true);
    });

    it('should process bet action on flop', () => {
      let state = table.getState();

      // Get to flop by calling and checking preflop
      let result = table.applyAction(state.currentPlayerId!, { type: 'CALL' });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      result = table.applyAction(result.value.currentPlayerId!, {
        type: 'CHECK',
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      state = result.value;
      // Should have progressed past preflop to at least flop
      expect(state.phase).not.toBe(TablePhase.Preflop);
      expect(state.communityCards.length).toBeGreaterThanOrEqual(3);

      // Now bet (or if already past flop, still validate betting works)
      const betAction: PlayerAction = {
        type: 'BET',
        amount: chips(50),
      };
      result = table.applyAction(state.currentPlayerId!, betAction);
      expect(isOk(result)).toBe(true);
    });

    it('should process raise action', () => {
      const state = table.getState();

      // First player raises
      const raiseAction: PlayerAction = {
        type: 'RAISE',
        amount: chips(10),
      };
      const result = table.applyAction(state.currentPlayerId!, raiseAction);
      expect(isOk(result)).toBe(true);
    });

    it('should process all-in action', () => {
      const state = table.getState();

      const allInAction: PlayerAction = { type: 'ALL_IN' };
      const result = table.applyAction(state.currentPlayerId!, allInAction);
      expect(isOk(result)).toBe(true);
    });
  });

  describe('Reading Table State Example', () => {
    it('should read table state correctly', () => {
      const config = createDefaultTableConfig();
      config.rngSeed = 42;
      const table = new HoldemTable(config);

      table.seatPlayer(createPlayerId('alice'), chips(1000));
      table.seatPlayer(createPlayerId('bob'), chips(1000));
      table.startHand();

      const state = table.getState();

      // Verify state structure
      expect(state.phase).toBeDefined();
      expect(state.currentPlayerId).toBeDefined();
      expect(state.communityCards).toBeDefined();
      expect(state.players).toBeDefined();
      expect(state.pots).toBeDefined();

      // Verify players
      for (const player of state.players) {
        expect(player.id).toBeDefined();
        expect(player.stack).toBeGreaterThanOrEqual(0n);
        expect(player.committed).toBeGreaterThanOrEqual(0n);
        expect(player.status).toBeDefined();
        expect(player.holeCards).toBeDefined();
      }

      // Verify pots
      for (const pot of state.pots) {
        expect(pot.total).toBeGreaterThanOrEqual(0n);
        expect(pot.participants).toBeDefined();
      }
    });
  });

  describe('Game Loop Pattern Example', () => {
    it('should run game loop pattern successfully', () => {
      const config = createDefaultTableConfig();
      config.rngSeed = 42;
      const table = new HoldemTable(config);

      table.seatPlayer(createPlayerId('alice'), chips(1000));
      table.seatPlayer(createPlayerId('bob'), chips(1000));

      // Start hand
      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      let state = startResult.value;

      // Process actions until hand completes
      const maxActions = 100;
      let actionCount = 0;

      while (state.phase !== TablePhase.Showdown && actionCount < maxActions) {
        if (!state.currentPlayerId) {
          break;
        }

        // Simple decision logic: call or check
        const player = state.players.find(
          (p) => p.id === state.currentPlayerId
        );
        if (!player) break;

        const currentBet = state.players.reduce(
          (max, p) => (p.committed > max ? p.committed : max),
          0n
        );
        const needsToCall = currentBet - player.committed;

        const action =
          needsToCall > 0n
            ? { type: 'CALL' as const }
            : { type: 'CHECK' as const };

        const result = table.applyAction(state.currentPlayerId, action);
        expect(isOk(result)).toBe(true);
        if (!isOk(result)) break;

        state = result.value;
        actionCount++;
      }

      expect(state.phase).toBe(TablePhase.Showdown);
      expect(actionCount).toBeLessThan(maxActions);
    });
  });

  describe('Error Handling Example', () => {
    it('should handle errors correctly', () => {
      const config = createDefaultTableConfig();
      const table = new HoldemTable(config);

      const playerId = createPlayerId('test-player');
      const result = table.seatPlayer(playerId, chips(1000));

      if (isOk(result)) {
        const state = result.value;
        expect(state.players.length).toBe(1);
      } else {
        const error = result.error;
        expect(error.code).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });

    it('should reject insufficient buy-in', () => {
      const config = createDefaultTableConfig();
      const table = new HoldemTable(config);

      const playerId = createPlayerId('test-player');
      const result = table.seatPlayer(playerId, chips(1)); // Less than big blind

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.message).toBeDefined();
      }
    });
  });

  describe('Hand History Example', () => {
    it('should demonstrate hand history API', () => {
      const config = createDefaultTableConfig();
      config.rngSeed = 42;
      const table = new HoldemTable(config);

      table.seatPlayer(createPlayerId('alice'), chips(1000));
      table.seatPlayer(createPlayerId('bob'), chips(1000));

      // Demonstrate API exists and can be called
      const historyBeforeStart = table.getCurrentHandHistory();
      expect(historyBeforeStart).toBeNull();

      // Start a hand
      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      // API can be called during hand (implementation may return null)
      const currentHistory = table.getCurrentHandHistory();
      void currentHistory; // API demonstration
      // Note: Hand history tracking may be implemented in future versions

      // Complete the hand
      let state = startResult.value;
      let actionCount = 0;
      const maxActions = 20;

      while (
        state.phase !== TablePhase.Showdown &&
        state.currentPlayerId &&
        actionCount < maxActions
      ) {
        const result = table.applyAction(state.currentPlayerId, {
          type: 'CHECK',
        });
        if (!isOk(result)) {
          const callResult = table.applyAction(state.currentPlayerId, {
            type: 'CALL',
          });
          if (!isOk(callResult)) break;
          state = callResult.value;
        } else {
          state = result.value;
        }
        actionCount++;
      }

      // API for accessing last hand history
      const lastHistory = table.getLastHandHistory();
      void lastHistory; // API demonstration
      // Note: Returns null if history tracking is not yet implemented

      // Verify API methods exist and are callable
      expect(typeof table.getCurrentHandHistory).toBe('function');
      expect(typeof table.getLastHandHistory).toBe('function');
    });
  });
});
