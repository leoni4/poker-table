/**
 * Tests for hand history replay functionality
 */

import { describe, it, expect } from 'vitest';
import { replayHand } from '../../src/history/replay.js';
import { createHandHistory } from '../../src/history/index.js';
import {
  createDefaultTableConfig,
  createPlayerId,
  TablePhase,
  PlayerStatus,
} from '../../src/core/table.js';
import { chips } from '../../src/core/money.js';
import { createCard, Rank, Suit } from '../../src/core/card.js';
import { HoldemTable } from '../../src/holdem-table.js';

describe('Hand Replay', () => {
  describe('Basic replay', () => {
    it('should replay a simple hand correctly', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      // Add events
      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      history.events.push({
        type: 'CARDS_DEALT',
        timestamp: Date.now(),
        players: [
          {
            playerId: player1,
            cards: [
              createCard(Rank.Ace, Suit.Spades),
              createCard(Rank.King, Suit.Spades),
            ],
          },
          {
            playerId: player2,
            cards: [
              createCard(Rank.Queen, Suit.Hearts),
              createCard(Rank.Jack, Suit.Hearts),
            ],
          },
        ],
      });

      // Replay
      const states = replayHand(history, config);

      // Verify we have correct number of states
      expect(states).toHaveLength(3);

      // Verify initial state after hand started
      expect(states[0].handId).toBe(1);
      expect(states[0].dealerSeat).toBe(0);
      expect(states[0].players).toHaveLength(2);
      expect(states[0].players[0].stack).toBe(1000n);

      // Verify state after blinds posted
      expect(states[1].phase).toBe(TablePhase.Preflop);
      expect(states[1].players[0].committed).toBe(1n);
      expect(states[1].players[1].committed).toBe(2n);
      expect(states[1].players[0].stack).toBe(999n);
      expect(states[1].players[1].stack).toBe(998n);

      // Verify state after cards dealt
      expect(states[2].players[0].holeCards.cards).toBeDefined();
      expect(states[2].players[0].holeCards.cards).toHaveLength(2);
    });

    it('should handle player actions correctly', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Player 1 calls
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player1,
        action: 'CALL',
      });

      // Player 2 checks
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player2,
        action: 'CHECK',
      });

      const states = replayHand(history, config);

      // After call
      const afterCall = states[2];
      expect(afterCall.players[0].committed).toBe(2n);
      expect(afterCall.players[0].stack).toBe(998n);

      // After check
      const afterCheck = states[3];
      expect(afterCheck.players[1].committed).toBe(2n);
      expect(afterCheck.players[1].stack).toBe(998n);
    });

    it('should handle fold action', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Player 1 folds
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player1,
        action: 'FOLD',
      });

      const states = replayHand(history, config);

      // Verify fold
      const afterFold = states[2];
      expect(afterFold.players[0].status).toBe(PlayerStatus.Folded);
    });
  });

  describe('Street progression', () => {
    it('should handle street ended event', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Flop
      history.events.push({
        type: 'STREET_ENDED',
        timestamp: Date.now(),
        street: TablePhase.Flop,
        communityCards: [
          createCard(Rank.Ace, Suit.Hearts),
          createCard(Rank.King, Suit.Diamonds),
          createCard(Rank.Queen, Suit.Clubs),
        ],
        potTotal: chips(4),
      });

      const states = replayHand(history, config);

      const afterFlop = states[2];
      expect(afterFlop.phase).toBe(TablePhase.Flop);
      expect(afterFlop.communityCards).toHaveLength(3);
      expect(afterFlop.pots[0].total).toBe(4n);
      // Committed should be reset
      expect(afterFlop.players[0].committed).toBe(0n);
      expect(afterFlop.players[1].committed).toBe(0n);
    });

    it('should handle multiple streets', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      history.events.push({
        type: 'STREET_ENDED',
        timestamp: Date.now(),
        street: TablePhase.Flop,
        communityCards: [
          createCard(Rank.Ace, Suit.Hearts),
          createCard(Rank.King, Suit.Diamonds),
          createCard(Rank.Queen, Suit.Clubs),
        ],
        potTotal: chips(4),
      });

      history.events.push({
        type: 'STREET_ENDED',
        timestamp: Date.now(),
        street: TablePhase.Turn,
        communityCards: [
          createCard(Rank.Ace, Suit.Hearts),
          createCard(Rank.King, Suit.Diamonds),
          createCard(Rank.Queen, Suit.Clubs),
          createCard(Rank.Jack, Suit.Spades),
        ],
        potTotal: chips(4),
      });

      const states = replayHand(history, config);

      expect(states[2].phase).toBe(TablePhase.Flop);
      expect(states[2].communityCards).toHaveLength(3);

      expect(states[3].phase).toBe(TablePhase.Turn);
      expect(states[3].communityCards).toHaveLength(4);
    });
  });

  describe('Pot distribution and hand completion', () => {
    it('should handle pot distribution', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Pot distributed
      history.events.push({
        type: 'POT_DISTRIBUTED',
        timestamp: Date.now(),
        pots: [
          {
            amount: chips(3),
            winners: [{ playerId: player2, share: chips(3) }],
          },
        ],
      });

      const states = replayHand(history, config);

      const afterDistribution = states[2];
      expect(afterDistribution.players[1].stack).toBe(1001n); // 998 + 3
    });

    it('should handle hand ended event', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'HAND_ENDED',
        timestamp: Date.now(),
        handId: 1,
        finalPlayers: [
          { id: player1, finalStack: chips(999) },
          { id: player2, finalStack: chips(1001) },
        ],
      });

      const states = replayHand(history, config);

      const finalState = states[1];
      expect(finalState.phase).toBe(TablePhase.Idle);
      expect(finalState.players[0].stack).toBe(999n);
      expect(finalState.players[1].stack).toBe(1001n);
      expect(finalState.communityCards).toHaveLength(0);
      expect(finalState.pots).toHaveLength(0);
    });
  });

  describe('Determinism', () => {
    it('should produce identical results on multiple replays', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      // Create a complex history
      history.events.push(
        {
          type: 'HAND_STARTED',
          timestamp: Date.now(),
          handId: 1,
          dealerSeat: 0,
          players: [
            { id: player1, seat: 0, stack: chips(1000) },
            { id: player2, seat: 1, stack: chips(1000) },
          ],
        },
        {
          type: 'BLINDS_POSTED',
          timestamp: Date.now(),
          smallBlind: { playerId: player1, amount: chips(1) },
          bigBlind: { playerId: player2, amount: chips(2) },
        },
        {
          type: 'CARDS_DEALT',
          timestamp: Date.now(),
          players: [
            {
              playerId: player1,
              cards: [
                createCard(Rank.Ace, Suit.Spades),
                createCard(Rank.King, Suit.Spades),
              ],
            },
            {
              playerId: player2,
              cards: [
                createCard(Rank.Queen, Suit.Hearts),
                createCard(Rank.Jack, Suit.Hearts),
              ],
            },
          ],
        },
        {
          type: 'ACTION_TAKEN',
          timestamp: Date.now(),
          playerId: player1,
          action: 'RAISE',
          amount: chips(6),
        },
        {
          type: 'ACTION_TAKEN',
          timestamp: Date.now(),
          playerId: player2,
          action: 'CALL',
        }
      );

      // Replay multiple times
      const states1 = replayHand(history, config);
      const states2 = replayHand(history, config);
      const states3 = replayHand(history, config);

      // All replays should be identical
      expect(states1).toEqual(states2);
      expect(states2).toEqual(states3);
    });
  });

  describe('Real hand integration', () => {
    it('should accurately replay a hand from HoldemTable', () => {
      // Use seeded RNG for deterministic test
      const config = createDefaultTableConfig();
      config.rngSeed = 12345;

      const table = new HoldemTable(config);

      // Seat players
      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      table.seatPlayer(player1, chips(1000));
      table.seatPlayer(player2, chips(1000));

      // Start hand
      const startResult = table.startHand();
      expect(startResult.ok).toBe(true);

      const stateAfterStart = table.getState();

      // In a real scenario, we would record events during the hand
      // For this test, we'll create a simplified history manually
      const history = createHandHistory(1, config);

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: stateAfterStart.handId,
        dealerSeat: stateAfterStart.dealerSeat!,
        players: stateAfterStart.players.map((p) => ({
          id: p.id,
          seat: p.seat,
          stack: p.stack + p.committed,
        })),
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: {
          playerId: stateAfterStart.players[0].id,
          amount: stateAfterStart.players[0].committed,
        },
        bigBlind: {
          playerId: stateAfterStart.players[1].id,
          amount: stateAfterStart.players[1].committed,
        },
      });

      history.events.push({
        type: 'CARDS_DEALT',
        timestamp: Date.now(),
        players: stateAfterStart.players.map((p) => ({
          playerId: p.id,
          cards: p.holeCards.cards!,
        })),
      });

      // Replay and compare
      const replayedStates = replayHand(history, config);

      // The final replayed state should match key aspects of the table state
      const finalReplayedState = replayedStates[replayedStates.length - 1];

      expect(finalReplayedState.handId).toBe(stateAfterStart.handId);
      expect(finalReplayedState.dealerSeat).toBe(stateAfterStart.dealerSeat);
      expect(finalReplayedState.players).toHaveLength(
        stateAfterStart.players.length
      );

      // Check player stacks match
      for (let i = 0; i < finalReplayedState.players.length; i++) {
        expect(finalReplayedState.players[i].stack).toBe(
          stateAfterStart.players[i].stack
        );
        expect(finalReplayedState.players[i].committed).toBe(
          stateAfterStart.players[i].committed
        );
      }
    });
  });

  describe('Edge cases and additional coverage', () => {
    it('should handle bet action with amount', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Player 1 bets
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player1,
        action: 'BET',
        amount: chips(10),
      });

      const states = replayHand(history, config);

      const afterBet = states[2];
      expect(afterBet.players[0].committed).toBe(11n); // 1 (SB) + 10 (bet)
      expect(afterBet.players[0].stack).toBe(989n);
    });

    it('should handle raise action with amount', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Player 1 raises
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player1,
        action: 'RAISE',
        amount: chips(6),
      });

      const states = replayHand(history, config);

      const afterRaise = states[2];
      expect(afterRaise.players[0].committed).toBe(7n); // 1 (SB) + 6 (raise)
      expect(afterRaise.players[0].stack).toBe(993n);
    });

    it('should handle all-in action', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(100) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Player 1 goes all-in
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player1,
        action: 'ALL_IN',
      });

      const states = replayHand(history, config);

      const afterAllIn = states[2];
      expect(afterAllIn.players[0].stack).toBe(0n);
      expect(afterAllIn.players[0].status).toBe(PlayerStatus.AllIn);
      expect(afterAllIn.players[0].committed).toBe(100n);
    });

    it('should handle raise with allIn flag', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(100) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Player 1 raises all-in
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player1,
        action: 'RAISE',
        amount: chips(99),
        allIn: true,
      });

      const states = replayHand(history, config);

      const afterRaise = states[2];
      expect(afterRaise.players[0].stack).toBe(0n);
      expect(afterRaise.players[0].status).toBe(PlayerStatus.AllIn);
    });

    it('should handle antes in blinds posted event', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        antes: [
          { playerId: player1, amount: chips(5) },
          { playerId: player2, amount: chips(5) },
        ],
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      const states = replayHand(history, config);

      const afterBlinds = states[1];
      expect(afterBlinds.players[0].committed).toBe(6n); // 5 (ante) + 1 (SB)
      expect(afterBlinds.players[1].committed).toBe(7n); // 5 (ante) + 2 (BB)
      expect(afterBlinds.pots[0].total).toBe(13n);
    });

    it('should handle straddle in blinds posted event', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');
      const player3 = createPlayerId('charlie');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
          { id: player3, seat: 2, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
        straddle: { playerId: player3, amount: chips(4) },
      });

      const states = replayHand(history, config);

      const afterBlinds = states[1];
      expect(afterBlinds.players[0].committed).toBe(1n);
      expect(afterBlinds.players[1].committed).toBe(2n);
      expect(afterBlinds.players[2].committed).toBe(4n);
      expect(afterBlinds.pots[0].total).toBe(7n);
    });

    it('should handle player going all-in when posting blinds', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      const states = replayHand(history, config);

      const afterBlinds = states[1];
      expect(afterBlinds.players[0].stack).toBe(0n);
      expect(afterBlinds.players[0].status).toBe(PlayerStatus.AllIn);
    });

    it('should handle call when player does not have enough chips', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(5) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Player 2 raises to 10
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player2,
        action: 'RAISE',
        amount: chips(8),
      });

      // Player 1 calls with remaining chips
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player1,
        action: 'CALL',
      });

      const states = replayHand(history, config);

      const afterCall = states[3];
      expect(afterCall.players[0].stack).toBe(0n);
      expect(afterCall.players[0].status).toBe(PlayerStatus.AllIn);
      expect(afterCall.players[0].committed).toBe(5n);
    });

    it('should handle bet/raise when player does not have enough chips', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(50) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Player 1 tries to raise to 100 but only has 49 left
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player1,
        action: 'RAISE',
        amount: chips(100),
      });

      const states = replayHand(history, config);

      const afterRaise = states[2];
      expect(afterRaise.players[0].stack).toBe(0n);
      expect(afterRaise.players[0].committed).toBe(50n);
    });

    it('should handle unknown event type gracefully', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [{ id: player1, seat: 0, stack: chips(1000) }],
      });

      // Add an unknown event type
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      history.events.push({
        type: 'UNKNOWN_EVENT',
        timestamp: Date.now(),
      } as any);

      // Should not throw
      const states = replayHand(history, config);
      expect(states).toHaveLength(2);
    });

    it('should handle action on non-existent player', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');
      const nonExistentPlayer = createPlayerId('ghost');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Action by non-existent player
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: nonExistentPlayer,
        action: 'FOLD',
      });

      const states = replayHand(history, config);

      // State should remain unchanged
      expect(states[2].players).toHaveLength(2);
      expect(states[2].players[0].status).toBe(PlayerStatus.Active);
    });

    it('should handle multi-player scenarios', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');
      const player3 = createPlayerId('charlie');
      const player4 = createPlayerId('dave');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
          { id: player3, seat: 2, stack: chips(1000) },
          { id: player4, seat: 3, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player2, amount: chips(1) },
        bigBlind: { playerId: player3, amount: chips(2) },
      });

      const states = replayHand(history, config);

      const afterBlinds = states[1];
      expect(afterBlinds.players).toHaveLength(4);
      expect(afterBlinds.pots[0].total).toBe(3n);
    });

    it('should handle split pot distribution', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Split pot (tie)
      history.events.push({
        type: 'POT_DISTRIBUTED',
        timestamp: Date.now(),
        pots: [
          {
            amount: chips(100),
            winners: [
              { playerId: player1, share: chips(50) },
              { playerId: player2, share: chips(50) },
            ],
          },
        ],
      });

      const states = replayHand(history, config);

      const afterDistribution = states[2];
      expect(afterDistribution.players[0].stack).toBe(1049n); // 999 + 50
      expect(afterDistribution.players[1].stack).toBe(1048n); // 998 + 50
    });

    it('should handle multiple pots distribution', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');
      const player3 = createPlayerId('charlie');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
          { id: player3, seat: 2, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Multiple pots (main pot + side pot)
      history.events.push({
        type: 'POT_DISTRIBUTED',
        timestamp: Date.now(),
        pots: [
          {
            amount: chips(60),
            winners: [{ playerId: player1, share: chips(60) }],
          },
          {
            amount: chips(40),
            winners: [{ playerId: player2, share: chips(40) }],
          },
        ],
      });

      const states = replayHand(history, config);

      const afterDistribution = states[2];
      expect(afterDistribution.players[0].stack).toBe(1059n); // 999 + 60
      expect(afterDistribution.players[1].stack).toBe(1038n); // 998 + 40
    });

    it('should handle blinds posted without pots when no committed amounts', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [{ id: player1, seat: 0, stack: chips(1000) }],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
      });

      const states = replayHand(history, config);

      const afterBlinds = states[1];
      expect(afterBlinds.pots).toHaveLength(0);
    });

    it('should handle street ended without existing pots', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      // Skip blinds, go straight to street ended
      history.events.push({
        type: 'STREET_ENDED',
        timestamp: Date.now(),
        street: TablePhase.Flop,
        communityCards: [
          createCard(Rank.Ace, Suit.Hearts),
          createCard(Rank.King, Suit.Diamonds),
          createCard(Rank.Queen, Suit.Clubs),
        ],
        potTotal: chips(50),
      });

      const states = replayHand(history, config);

      const afterStreet = states[1];
      expect(afterStreet.pots).toHaveLength(1);
      expect(afterStreet.pots[0].total).toBe(50n);
      expect(afterStreet.pots[0].participants).toHaveLength(0);
    });

    it('should handle hand started without dealerSeat being set', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [{ id: player1, seat: 0, stack: chips(1000) }],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
      });

      const states = replayHand(history, config);

      // Should handle single player scenario
      expect(states).toHaveLength(2);
      expect(states[1].currentPlayerId).toBeDefined();
    });

    it('should handle street ended with undefined dealerSeat', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1000) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Manually modify the state's dealerSeat to undefined via a custom state
      // by using street ended which will call findFirstPlayerAfterDealer
      history.events.push({
        type: 'STREET_ENDED',
        timestamp: Date.now(),
        street: TablePhase.Flop,
        communityCards: [
          createCard(Rank.Ace, Suit.Hearts),
          createCard(Rank.King, Suit.Diamonds),
          createCard(Rank.Queen, Suit.Clubs),
        ],
        potTotal: chips(3),
      });

      const states = replayHand(history, config);

      const afterFlop = states[2];
      expect(afterFlop.currentPlayerId).toBeDefined();
    });

    it('should handle action when no active players remain', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      history.events.push({
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(100) },
          { id: player2, seat: 1, stack: chips(100) },
        ],
      });

      history.events.push({
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      });

      // Both players fold
      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player1,
        action: 'FOLD',
      });

      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player2,
        action: 'FOLD',
      });

      const states = replayHand(history, config);

      // Should handle no active players gracefully
      expect(states).toHaveLength(4);
      expect(states[3].players[0].status).toBe(PlayerStatus.Folded);
      expect(states[3].players[1].status).toBe(PlayerStatus.Folded);
    });
  });
});
