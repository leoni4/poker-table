import { describe, it, expect, beforeEach } from 'vitest';
import { createTable, Table } from '../../src/table/index.js';
import {
  createDefaultTableConfig,
  createPlayerId,
  TablePhase,
  PlayerStatus,
} from '../../src/core/table.js';
import { chips } from '../../src/core/money.js';
import { isOk } from '../../src/core/result.js';

describe('Table - Full Hand Flow', () => {
  let table: Table;

  beforeEach(() => {
    const config = createDefaultTableConfig();
    config.rngSeed = 12345; // Deterministic for testing
    table = createTable(config);
  });

  describe('Happy path - normal hand progression', () => {
    it('should deal cards and handle basic betting', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      // Start hand
      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      const state = startResult.value;

      // Verify hand started correctly
      expect(state.phase).toBe(TablePhase.Preflop);
      expect(state.handId).toBe(1);
      expect(state.players[0].holeCards.cards).toBeDefined();
      expect(state.players[1].holeCards.cards).toBeDefined();
      expect(state.players[0].holeCards.cards).toHaveLength(2);
      expect(state.players[1].holeCards.cards).toHaveLength(2);

      // Verify blinds were posted
      const totalCommitted = state.players.reduce(
        (sum, p) => sum + p.committed,
        0n
      );
      expect(totalCommitted).toBeGreaterThan(0n);

      // Verify there's a current player to act
      expect(state.currentPlayerId).toBeDefined();
    });
  });

  describe('Early fold scenario', () => {
    it('should end hand early when all but one player fold', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));
      table.seatPlayer(player3, chips(1000));

      // Start hand
      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      let state = startResult.value;
      expect(state.phase).toBe(TablePhase.Preflop);

      // First player folds
      const fold1 = table.applyAction(state.currentPlayerId!, {
        type: 'FOLD',
      });
      expect(isOk(fold1)).toBe(true);
      if (!isOk(fold1)) return;

      // Second player folds
      const fold2 = table.applyAction(fold1.value.currentPlayerId!, {
        type: 'FOLD',
      });
      expect(isOk(fold2)).toBe(true);
      if (!isOk(fold2)) return;

      state = fold2.value;
      expect(state.phase).toBe(TablePhase.Showdown);
      expect(state.currentPlayerId).toBeUndefined();

      // Verify only one active player remains
      const activePlayers = state.players.filter(
        (p) => p.status === PlayerStatus.Active
      );
      expect(activePlayers).toHaveLength(1);
    });
  });

  describe('No infinite loops', () => {
    it('should complete hand without getting stuck', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      const startResult = table.startHand();
      expect(isOk(startResult)).toBe(true);
      if (!isOk(startResult)) return;

      // Immediate fold ends hand
      const state = startResult.value;
      const foldResult = table.applyAction(state.currentPlayerId!, {
        type: 'FOLD',
      });
      expect(isOk(foldResult)).toBe(true);
      if (!isOk(foldResult)) return;

      expect(foldResult.value.phase).toBe(TablePhase.Showdown);
    });
  });
});
