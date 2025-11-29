import { describe, it, expect, beforeEach } from 'vitest';
import { createTable, Table, RebuyOptions } from '../../src/table/index.js';
import {
  createDefaultTableConfig,
  createPlayerId,
  TableConfig,
  TablePhase,
  PlayerStatus,
} from '../../src/core/table.js';
import { chips } from '../../src/core/money.js';
import { ErrorCode } from '../../src/core/errors.js';
import { isOk, isErr } from '../../src/core/result.js';

describe('Table - Seat Management', () => {
  let table: Table;
  let config: TableConfig;

  beforeEach(() => {
    config = createDefaultTableConfig();
    table = createTable(config);
  });

  describe('seatPlayer', () => {
    it('should successfully seat a player with valid buy-in', () => {
      const playerId = createPlayerId('player-1');
      const buyInAmount = chips(1000);

      const result = table.seatPlayer(playerId, buyInAmount);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;
        expect(state.players).toHaveLength(1);
        expect(state.players[0].id).toBe(playerId);
        expect(state.players[0].stack).toBe(buyInAmount);
        expect(state.players[0].seat).toBe(0);
        expect(state.players[0].committed).toBe(0n);
        expect(state.players[0].status).toBe(PlayerStatus.Active);
      }
    });

    it('should seat multiple players at different seats', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(2000));
      const result = table.seatPlayer(player3, chips(1500));

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;
        expect(state.players).toHaveLength(3);
        expect(state.players[0].seat).toBe(0);
        expect(state.players[1].seat).toBe(1);
        expect(state.players[2].seat).toBe(2);
      }
    });

    it('should seat player with minimum buy-in (big blind)', () => {
      const playerId = createPlayerId('player-1');
      const buyInAmount = config.bigBlind;

      const result = table.seatPlayer(playerId, buyInAmount);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.players[0].stack).toBe(buyInAmount);
      }
    });

    it('should reject seating when table is full', () => {
      // Seat max players
      for (let i = 0; i < config.maxPlayers; i++) {
        const playerId = createPlayerId(`player-${i}`);
        table.seatPlayer(playerId, chips(1000));
      }

      // Try to seat one more
      const extraPlayer = createPlayerId('extra-player');
      const result = table.seatPlayer(extraPlayer, chips(1000));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.TABLE_FULL);
        expect(result.error.message).toContain('Table is full');
      }
    });

    it('should reject seating the same player twice', () => {
      const playerId = createPlayerId('player-1');

      table.seatPlayer(playerId, chips(1000));
      const result = table.seatPlayer(playerId, chips(2000));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
        expect(result.error.message).toContain('already seated');
      }
    });

    it('should reject buy-in less than big blind', () => {
      const playerId = createPlayerId('player-1');
      const buyInAmount = config.bigBlind - 1n;

      const result = table.seatPlayer(playerId, buyInAmount);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INSUFFICIENT_STACK);
        expect(result.error.message).toContain('less than big blind');
      }
    });

    it('should reject buy-in of zero', () => {
      const playerId = createPlayerId('player-1');
      const result = table.seatPlayer(playerId, chips(0));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INSUFFICIENT_STACK);
      }
    });

    it('should assign seats in order', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));
      table.seatPlayer(player3, chips(1000));

      const state = table.getState();
      expect(state.players[0].seat).toBe(0);
      expect(state.players[1].seat).toBe(1);
      expect(state.players[2].seat).toBe(2);
    });

    it('should fill empty seats after player removal', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));
      table.removePlayer(player1); // Remove seat 0

      const result = table.seatPlayer(player3, chips(1000));

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const newPlayer = result.value.players.find((p) => p.id === player3);
        expect(newPlayer?.seat).toBe(0); // Should take the vacant seat 0
      }
    });
  });

  describe('removePlayer', () => {
    it('should successfully remove a player from idle table', () => {
      const playerId = createPlayerId('player-1');
      table.seatPlayer(playerId, chips(1000));

      const result = table.removePlayer(playerId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.players).toHaveLength(0);
      }
    });

    it('should remove player and maintain other players', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(2000));
      table.seatPlayer(player3, chips(1500));

      const result = table.removePlayer(player2);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;
        expect(state.players).toHaveLength(2);
        expect(state.players.find((p) => p.id === player1)).toBeDefined();
        expect(state.players.find((p) => p.id === player2)).toBeUndefined();
        expect(state.players.find((p) => p.id === player3)).toBeDefined();
      }
    });

    it('should reject removing non-existent player', () => {
      const playerId = createPlayerId('non-existent');
      const result = table.removePlayer(playerId);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.PLAYER_NOT_FOUND);
        expect(result.error.message).toContain('not found');
      }
    });

    it('should set player to sitting out during active hand without committed chips', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      // Simulate active hand by changing phase
      table.setPhase(TablePhase.Preflop);

      const result = table.removePlayer(player1);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;
        const player = state.players.find((p) => p.id === player1);
        expect(player).toBeDefined();
        expect(player?.status).toBe(PlayerStatus.SittingOut);
      }
    });

    it('should reject removing player with committed chips during active hand', () => {
      const player1 = createPlayerId('player-1');
      table.seatPlayer(player1, chips(1000));

      // Simulate active hand with committed chips
      table.setPhase(TablePhase.Preflop);
      table.setPlayerCommitted(player1, chips(50));

      const result = table.removePlayer(player1);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
        expect(result.error.message).toContain('committed chips');
      }
    });

    it('should clear currentPlayerId if removed player was current', () => {
      const player1 = createPlayerId('player-1');
      table.seatPlayer(player1, chips(1000));

      table.setCurrentPlayer(player1);

      const result = table.removePlayer(player1);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.currentPlayerId).toBeUndefined();
      }
    });
  });

  describe('rebuyPlayer', () => {
    it('should successfully rebuy for existing player', () => {
      const playerId = createPlayerId('player-1');
      const initialStack = chips(500);
      const rebuyAmount = chips(1000);

      table.seatPlayer(playerId, initialStack);
      const result = table.rebuyPlayer(playerId, rebuyAmount);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player = result.value.players.find((p) => p.id === playerId);
        expect(player?.stack).toBe(initialStack + rebuyAmount);
      }
    });

    it('should reject rebuy for non-existent player', () => {
      const playerId = createPlayerId('non-existent');
      const result = table.rebuyPlayer(playerId, chips(1000));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.PLAYER_NOT_FOUND);
      }
    });

    it('should reject rebuy amount less than minimum', () => {
      const playerId = createPlayerId('player-1');
      table.seatPlayer(playerId, chips(1000));

      const rebuyAmount = config.bigBlind - 1n;
      const result = table.rebuyPlayer(playerId, rebuyAmount);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INSUFFICIENT_STACK);
        expect(result.error.message).toContain('less than minimum');
      }
    });

    it('should reject rebuy during active hand by default', () => {
      const playerId = createPlayerId('player-1');
      table.seatPlayer(playerId, chips(1000));

      // Simulate active hand
      table.setPhase(TablePhase.Flop);

      const result = table.rebuyPlayer(playerId, chips(1000));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
        expect(result.error.message).toContain(
          'not allowed during an active hand'
        );
      }
    });

    it('should allow rebuy during active hand when configured', () => {
      const rebuyOptions: RebuyOptions = {
        allowDuringHand: true,
      };
      const tableWithRebuy = createTable(config, rebuyOptions);
      const playerId = createPlayerId('player-1');

      tableWithRebuy.seatPlayer(playerId, chips(1000));

      // Simulate active hand
      tableWithRebuy.setPhase(TablePhase.Turn);

      const result = tableWithRebuy.rebuyPlayer(playerId, chips(500));

      expect(isOk(result)).toBe(true);
    });

    it('should enforce custom minimum rebuy amount', () => {
      const customMin = chips(500);
      const rebuyOptions: RebuyOptions = {
        minRebuy: customMin,
      };
      const tableWithRebuy = createTable(config, rebuyOptions);
      const playerId = createPlayerId('player-1');

      tableWithRebuy.seatPlayer(playerId, chips(1000));

      const result1 = tableWithRebuy.rebuyPlayer(playerId, customMin - 1n);
      expect(isErr(result1)).toBe(true);

      const result2 = tableWithRebuy.rebuyPlayer(playerId, customMin);
      expect(isOk(result2)).toBe(true);
    });

    it('should enforce maximum rebuy amount when set', () => {
      const maxRebuy = chips(2000);
      const rebuyOptions: RebuyOptions = {
        maxRebuy,
      };
      const tableWithRebuy = createTable(config, rebuyOptions);
      const playerId = createPlayerId('player-1');

      tableWithRebuy.seatPlayer(playerId, chips(1000));

      const result = tableWithRebuy.rebuyPlayer(playerId, maxRebuy + 1n);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
        expect(result.error.message).toContain('exceeds maximum');
      }
    });

    it('should allow rebuy up to maximum amount', () => {
      const maxRebuy = chips(2000);
      const rebuyOptions: RebuyOptions = {
        maxRebuy,
      };
      const tableWithRebuy = createTable(config, rebuyOptions);
      const playerId = createPlayerId('player-1');

      tableWithRebuy.seatPlayer(playerId, chips(1000));
      const result = tableWithRebuy.rebuyPlayer(playerId, maxRebuy);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player = result.value.players.find((p) => p.id === playerId);
        expect(player?.stack).toBe(chips(1000) + maxRebuy);
      }
    });

    it('should reactivate sitting out player on rebuy', () => {
      const playerId = createPlayerId('player-1');
      table.seatPlayer(playerId, chips(1000));

      // Set player to sitting out
      table.setPlayerStatus(playerId, PlayerStatus.SittingOut);

      const result = table.rebuyPlayer(playerId, chips(500));

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const updatedPlayer = result.value.players.find(
          (p) => p.id === playerId
        );
        expect(updatedPlayer?.status).toBe(PlayerStatus.Active);
      }
    });

    it('should allow multiple rebuys for the same player', () => {
      const playerId = createPlayerId('player-1');
      const initialStack = chips(1000);

      table.seatPlayer(playerId, initialStack);
      table.rebuyPlayer(playerId, chips(500));
      const result = table.rebuyPlayer(playerId, chips(300));

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const player = result.value.players.find((p) => p.id === playerId);
        expect(player?.stack).toBe(initialStack + chips(500) + chips(300));
      }
    });
  });

  describe('Table state management', () => {
    it('should maintain correct table state after operations', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      // Initial state
      let state = table.getState();
      expect(state.phase).toBe(TablePhase.Idle);
      expect(state.handId).toBe(0);
      expect(state.players).toHaveLength(0);

      // After seating players
      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(2000));
      state = table.getState();
      expect(state.players).toHaveLength(2);

      // After rebuy
      table.rebuyPlayer(player1, chips(500));
      state = table.getState();
      expect(state.players[0].stack).toBe(chips(1500));

      // After removal
      table.removePlayer(player2);
      state = table.getState();
      expect(state.players).toHaveLength(1);
    });

    it('should return a copy of state to prevent external mutation', () => {
      const playerId = createPlayerId('player-1');
      table.seatPlayer(playerId, chips(1000));

      const state1 = table.getState();
      const state2 = table.getState();

      // Modifying state1 should not affect state2
      state1.players[0].stack = chips(5000);
      expect(state2.players[0].stack).toBe(chips(1000));
    });

    it('should handle complex scenario: seat, rebuy, remove, seat again', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      // Seat player 1
      table.seatPlayer(player1, chips(1000));
      expect(table.getState().players).toHaveLength(1);

      // Rebuy
      table.rebuyPlayer(player1, chips(500));
      expect(table.getState().players[0].stack).toBe(chips(1500));

      // Remove
      table.removePlayer(player1);
      expect(table.getState().players).toHaveLength(0);

      // Seat player 2 in the vacated seat
      const result = table.seatPlayer(player2, chips(2000));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.players).toHaveLength(1);
        expect(result.value.players[0].id).toBe(player2);
        expect(result.value.players[0].seat).toBe(0);
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle table with only 1 player', () => {
      const playerId = createPlayerId('player-1');
      const result = table.seatPlayer(playerId, chips(1000));

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.players).toHaveLength(1);
      }
    });

    it('should handle maximum capacity table (10 players)', () => {
      for (let i = 0; i < config.maxPlayers; i++) {
        const result = table.seatPlayer(
          createPlayerId(`player-${i}`),
          chips(1000)
        );
        expect(isOk(result)).toBe(true);
      }

      const state = table.getState();
      expect(state.players).toHaveLength(config.maxPlayers);
    });

    it('should handle seating at custom max players limit', () => {
      const customConfig: TableConfig = {
        ...config,
        maxPlayers: 6,
      };
      const customTable = createTable(customConfig);

      for (let i = 0; i < 6; i++) {
        const result = customTable.seatPlayer(
          createPlayerId(`player-${i}`),
          chips(1000)
        );
        expect(isOk(result)).toBe(true);
      }

      const result = customTable.seatPlayer(
        createPlayerId('player-7'),
        chips(1000)
      );
      expect(isErr(result)).toBe(true);
    });

    it('should handle very large buy-in amounts', () => {
      const playerId = createPlayerId('whale');
      const largeBuyIn = chips(1000000);

      const result = table.seatPlayer(playerId, largeBuyIn);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.players[0].stack).toBe(largeBuyIn);
      }
    });

    it('should handle rebuy with exact minimum amount', () => {
      const playerId = createPlayerId('player-1');
      table.seatPlayer(playerId, chips(1000));

      const result = table.rebuyPlayer(playerId, config.bigBlind);

      expect(isOk(result)).toBe(true);
    });
  });
});
