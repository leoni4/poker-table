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
});
