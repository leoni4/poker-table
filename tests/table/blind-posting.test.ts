import { describe, it, expect, beforeEach } from 'vitest';
import { createTable, Table } from '../../src/table/index.js';
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

describe('Table - Blind/Ante/Straddle Posting', () => {
  let table: Table;
  let config: TableConfig;

  beforeEach(() => {
    config = createDefaultTableConfig();
    table = createTable(config);
  });

  describe('startNewHand - Basic functionality', () => {
    it('should start a new hand with 2 players', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      const result = table.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;
        expect(state.phase).toBe(TablePhase.Preflop);
        expect(state.handId).toBe(1);
        expect(state.dealerSeat).toBeDefined();
      }
    });

    it('should reject starting hand with insufficient players', () => {
      const player1 = createPlayerId('player-1');
      table.seatPlayer(player1, chips(1000));

      const result = table.startNewHand();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.NOT_ENOUGH_PLAYERS);
      }
    });

    it('should reject starting hand during active hand', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));
      table.startNewHand();

      const result = table.startNewHand();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
      }
    });
  });

  describe('Dealer button movement', () => {
    it('should set dealer button on first hand', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      const result = table.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.dealerSeat).toBe(0);
      }
    });

    it('should move dealer button clockwise each hand', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));
      table.seatPlayer(player3, chips(1000));

      // First hand
      table.startNewHand();
      let state = table.getState();
      const firstDealer = state.dealerSeat;
      expect(firstDealer).toBe(0);

      // End hand (set back to idle)
      table.setPhase(TablePhase.Idle);

      // Second hand
      table.startNewHand();
      state = table.getState();
      expect(state.dealerSeat).toBe(1);

      // End hand
      table.setPhase(TablePhase.Idle);

      // Third hand
      table.startNewHand();
      state = table.getState();
      expect(state.dealerSeat).toBe(2);

      // End hand
      table.setPhase(TablePhase.Idle);

      // Fourth hand (wraps around)
      table.startNewHand();
      state = table.getState();
      expect(state.dealerSeat).toBe(0);
    });

    it('should skip sitting out players when moving dealer button', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));
      table.seatPlayer(player3, chips(1000));

      table.startNewHand();
      expect(table.getState().dealerSeat).toBe(0);

      // Set player 2 to sitting out
      table.setPhase(TablePhase.Idle);
      table.setPlayerStatus(player2, PlayerStatus.SittingOut);

      // Next hand should skip player 2
      table.startNewHand();
      expect(table.getState().dealerSeat).toBe(2); // Skips seat 1
    });
  });

  describe('Blind posting - Heads-up (2 players)', () => {
    it('should post SB by dealer and BB by other player', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      const result = table.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        // Dealer (seat 0) should have posted SB
        const dealer = state.players.find((p) => p.seat === 0);
        expect(dealer?.committed).toBe(config.smallBlind);
        expect(dealer?.stack).toBe(chips(1000) - config.smallBlind);

        // Other player (seat 1) should have posted BB
        const bb = state.players.find((p) => p.seat === 1);
        expect(bb?.committed).toBe(config.bigBlind);
        expect(bb?.stack).toBe(chips(1000) - config.bigBlind);
      }
    });

    it('should set first to act as dealer (SB) in heads-up', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      const result = table.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;
        const dealer = state.players.find((p) => p.seat === state.dealerSeat);
        // In heads-up, dealer acts first preflop
        expect(state.currentPlayerId).toBe(dealer?.id);
      }
    });
  });

  describe('Blind posting - Multi-way (3+ players)', () => {
    it('should post SB and BB correctly with 3 players', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));
      table.seatPlayer(player3, chips(1000));

      const result = table.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        // Dealer is at seat 0
        expect(state.dealerSeat).toBe(0);

        // SB should be at seat 1
        const sb = state.players.find((p) => p.seat === 1);
        expect(sb?.committed).toBe(config.smallBlind);

        // BB should be at seat 2
        const bb = state.players.find((p) => p.seat === 2);
        expect(bb?.committed).toBe(config.bigBlind);

        // Dealer should not have posted
        const dealer = state.players.find((p) => p.seat === 0);
        expect(dealer?.committed).toBe(0n);
      }
    });

    it('should set first to act as player after BB', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));
      table.seatPlayer(player3, chips(1000));

      const result = table.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;
        // First to act should be seat 0 (after BB at seat 2)
        const firstToAct = state.players.find((p) => p.seat === 0);
        expect(state.currentPlayerId).toBe(firstToAct?.id);
      }
    });

    it('should handle 10 players correctly', () => {
      for (let i = 0; i < 10; i++) {
        table.seatPlayer(createPlayerId(`player-${i}`), chips(1000));
      }

      const result = table.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        // Count total committed
        const totalCommitted = state.players.reduce(
          (sum, p) => sum + p.committed,
          0n
        );
        expect(totalCommitted).toBe(config.smallBlind + config.bigBlind);

        // Verify only 2 players posted blinds
        const playersWithCommitted = state.players.filter(
          (p) => p.committed > 0n
        );
        expect(playersWithCommitted).toHaveLength(2);
      }
    });
  });

  describe('Ante posting', () => {
    it('should post antes from all active players', () => {
      const anteConfig: TableConfig = {
        ...config,
        ante: chips(5),
      };
      const anteTable = createTable(anteConfig);

      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      anteTable.seatPlayer(player1, chips(1000));
      anteTable.seatPlayer(player2, chips(1000));
      anteTable.seatPlayer(player3, chips(1000));

      const result = anteTable.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        // Each player should have posted ante + blinds
        const totalCommitted = state.players.reduce(
          (sum, p) => sum + p.committed,
          0n
        );
        const expectedTotal =
          anteConfig.ante! * 3n + anteConfig.smallBlind + anteConfig.bigBlind;
        expect(totalCommitted).toBe(expectedTotal);
      }
    });

    it('should not post ante from sitting out players', () => {
      const anteConfig: TableConfig = {
        ...config,
        ante: chips(5),
      };
      const anteTable = createTable(anteConfig);

      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      anteTable.seatPlayer(player1, chips(1000));
      anteTable.seatPlayer(player2, chips(1000));
      anteTable.seatPlayer(player3, chips(1000));

      // Set player 3 to sitting out
      anteTable.setPlayerStatus(player3, PlayerStatus.SittingOut);

      const result = anteTable.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;
        const sittingOutPlayer = state.players.find((p) => p.id === player3);
        expect(sittingOutPlayer?.committed).toBe(0n);
      }
    });
  });

  describe('Straddle posting', () => {
    it('should post straddle from player after BB with 3+ players', () => {
      const straddleConfig: TableConfig = {
        ...config,
        straddle: chips(4),
      };
      const straddleTable = createTable(straddleConfig);

      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      straddleTable.seatPlayer(player1, chips(1000));
      straddleTable.seatPlayer(player2, chips(1000));
      straddleTable.seatPlayer(player3, chips(1000));

      const result = straddleTable.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        // Dealer at 0, SB at 1, BB at 2, Straddle at 0 (wraps around)
        const totalCommitted = state.players.reduce(
          (sum, p) => sum + p.committed,
          0n
        );
        const expectedTotal =
          straddleConfig.smallBlind +
          straddleConfig.bigBlind +
          straddleConfig.straddle!;
        expect(totalCommitted).toBe(expectedTotal);

        // Player 0 should have straddle
        const straddlePlayer = state.players.find((p) => p.seat === 0);
        expect(straddlePlayer?.committed).toBe(straddleConfig.straddle);
      }
    });

    it('should not post straddle with only 2 players', () => {
      const straddleConfig: TableConfig = {
        ...config,
        straddle: chips(4),
      };
      const straddleTable = createTable(straddleConfig);

      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      straddleTable.seatPlayer(player1, chips(1000));
      straddleTable.seatPlayer(player2, chips(1000));

      const result = straddleTable.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        const totalCommitted = state.players.reduce(
          (sum, p) => sum + p.committed,
          0n
        );
        // Should only have blinds, no straddle
        expect(totalCommitted).toBe(
          straddleConfig.smallBlind + straddleConfig.bigBlind
        );
      }
    });

    it('should set first to act after straddle', () => {
      const straddleConfig: TableConfig = {
        ...config,
        straddle: chips(4),
      };
      const straddleTable = createTable(straddleConfig);

      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      straddleTable.seatPlayer(player1, chips(1000));
      straddleTable.seatPlayer(player2, chips(1000));
      straddleTable.seatPlayer(player3, chips(1000));

      const result = straddleTable.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;
        // First to act should be after straddle player
        // Dealer at 0, SB at 1, BB at 2, Straddle at 0, so first to act is 1
        const firstToAct = state.players.find((p) => p.seat === 1);
        expect(state.currentPlayerId).toBe(firstToAct?.id);
      }
    });
  });

  describe('Insufficient stack handling', () => {
    it('should handle player with stack equal to SB', () => {
      const customConfig: TableConfig = {
        ...config,
        smallBlind: chips(10),
        bigBlind: chips(20),
      };
      const customTable = createTable(customConfig);

      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      customTable.seatPlayer(player1, chips(20)); // Can seat but will post all for SB
      customTable.seatPlayer(player2, chips(1000));

      const result = customTable.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        // Player 1 (dealer in heads-up) should have posted SB
        const shortStack = state.players.find((p) => p.id === player1);
        expect(shortStack?.stack).toBe(chips(10));
        expect(shortStack?.committed).toBe(chips(10));
      }
    });

    it('should handle player with insufficient stack for BB', () => {
      const customConfig: TableConfig = {
        ...config,
        smallBlind: chips(10),
        bigBlind: chips(20),
      };
      const customTable = createTable(customConfig);

      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      customTable.seatPlayer(player1, chips(1000));
      customTable.seatPlayer(player2, chips(20)); // Seated but < BB

      const result = customTable.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        // Player 2 should be all-in for whatever they have
        const shortStack = state.players.find((p) => p.id === player2);
        expect(shortStack?.stack).toBe(0n);
        expect(shortStack?.committed).toBe(chips(20));
        expect(shortStack?.status).toBe(PlayerStatus.AllIn);
      }
    });

    it('should handle player with insufficient stack for ante', () => {
      const anteConfig: TableConfig = {
        ...config,
        ante: chips(5),
      };
      const anteTable = createTable(anteConfig);

      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      anteTable.seatPlayer(player1, chips(1000));
      anteTable.seatPlayer(player2, chips(1000));
      anteTable.seatPlayer(player3, chips(3)); // Less than ante

      const result = anteTable.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        // Player 3 should be all-in for ante
        const shortStack = state.players.find((p) => p.id === player3);
        expect(shortStack?.committed).toBe(chips(3));
        expect(shortStack?.stack).toBe(0n);
        expect(shortStack?.status).toBe(PlayerStatus.AllIn);
      }
    });

    it('should handle multiple short stacks', () => {
      const customConfig: TableConfig = {
        ...config,
        smallBlind: chips(10),
        bigBlind: chips(20),
      };
      const customTable = createTable(customConfig);

      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      customTable.seatPlayer(player1, chips(1000)); // Full stack - seat 0 (dealer)
      customTable.seatPlayer(player2, chips(20)); // Short stack - seat 1 (SB)
      customTable.seatPlayer(player3, chips(20)); // Short stack - seat 2 (BB)

      const result = customTable.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        // Verify positions
        const p1 = state.players.find((p) => p.id === player1);
        const p2 = state.players.find((p) => p.id === player2);
        const p3 = state.players.find((p) => p.id === player3);

        // Player 1 at seat 0 (dealer) - no blind posted
        expect(p1?.committed).toBe(0n);

        // Player 2 at seat 1 (SB) - posted SB
        expect(p2?.committed).toBe(chips(10));
        expect(p2?.stack).toBe(chips(10));

        // Player 3 at seat 2 (BB) - all-in for BB
        expect(p3?.committed).toBe(chips(20));
        expect(p3?.stack).toBe(0n);
        expect(p3?.status).toBe(PlayerStatus.AllIn);
      }
    });
  });

  describe('Pot creation', () => {
    it('should create pot with correct total', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      const result = table.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        expect(state.pots).toHaveLength(1);
        expect(state.pots[0].total).toBe(config.smallBlind + config.bigBlind);
        expect(state.pots[0].participants).toHaveLength(2);
      }
    });

    it('should create pot with antes included', () => {
      const anteConfig: TableConfig = {
        ...config,
        ante: chips(5),
      };
      const anteTable = createTable(anteConfig);

      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');
      const player3 = createPlayerId('player-3');

      anteTable.seatPlayer(player1, chips(1000));
      anteTable.seatPlayer(player2, chips(1000));
      anteTable.seatPlayer(player3, chips(1000));

      const result = anteTable.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        const expectedTotal =
          anteConfig.ante! * 3n + anteConfig.smallBlind + anteConfig.bigBlind;
        expect(state.pots[0].total).toBe(expectedTotal);
      }
    });
  });

  describe('Hand state reset', () => {
    it('should reset player committed amounts', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      // Set some committed from previous hand
      table.setPlayerCommitted(player1, chips(100));
      table.setPlayerCommitted(player2, chips(200));

      const result = table.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        // Committed should be reset and only blinds posted
        const p1 = state.players.find((p) => p.id === player1);
        const p2 = state.players.find((p) => p.id === player2);

        expect(p1?.committed).toBe(config.smallBlind);
        expect(p2?.committed).toBe(config.bigBlind);
      }
    });

    it('should clear hole cards', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      const result = table.startNewHand();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const state = result.value;

        state.players.forEach((player) => {
          expect(player.holeCards.cards).toBeUndefined();
        });
      }
    });

    it('should increment hand ID', () => {
      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      table.startNewHand();
      expect(table.getState().handId).toBe(1);

      table.setPhase(TablePhase.Idle);
      table.startNewHand();
      expect(table.getState().handId).toBe(2);

      table.setPhase(TablePhase.Idle);
      table.startNewHand();
      expect(table.getState().handId).toBe(3);
    });
  });
});
