/**
 * Tests for hand history tracking and JSON serialization
 */

import { describe, it, expect } from 'vitest';
import {
  createHandHistory,
  handHistoryToJSON,
  handHistoryFromJSON,
  HandEvent,
  HandHistory,
} from '../../src/history/index.js';
import {
  createDefaultTableConfig,
  createPlayerId,
  TablePhase,
} from '../../src/core/table.js';
import { chips } from '../../src/core/money.js';
import { createCard, Rank, Suit } from '../../src/core/card.js';

describe('Hand History', () => {
  describe('JSON serialization', () => {
    it('should serialize and deserialize empty history', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);

      const json = handHistoryToJSON(history);
      const restored = handHistoryFromJSON(json);

      expect(restored.handId).toBe(history.handId);
      expect(restored.tableConfig.smallBlind).toBe(config.smallBlind);
      expect(restored.tableConfig.bigBlind).toBe(config.bigBlind);
      expect(restored.events).toEqual([]);
    });

    it('should serialize and deserialize hand with events', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(5, config);

      const player1 = createPlayerId('alice');
      const player2 = createPlayerId('bob');

      // Add hand started event
      const handStartedEvent: HandEvent = {
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 5,
        dealerSeat: 0,
        players: [
          { id: player1, seat: 0, stack: chips(1000) },
          { id: player2, seat: 1, stack: chips(1500) },
        ],
      };
      history.events.push(handStartedEvent);

      // Add blinds posted event
      const blindsEvent: HandEvent = {
        type: 'BLINDS_POSTED',
        timestamp: Date.now(),
        smallBlind: { playerId: player1, amount: chips(1) },
        bigBlind: { playerId: player2, amount: chips(2) },
      };
      history.events.push(blindsEvent);

      // Add cards dealt event
      const cardsEvent: HandEvent = {
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
      };
      history.events.push(cardsEvent);

      // Add action taken event
      const actionEvent: HandEvent = {
        type: 'ACTION_TAKEN',
        timestamp: Date.now(),
        playerId: player1,
        action: 'CALL',
      };
      history.events.push(actionEvent);

      // Add street ended event
      const streetEvent: HandEvent = {
        type: 'STREET_ENDED',
        timestamp: Date.now(),
        street: TablePhase.Flop,
        communityCards: [
          createCard(Rank.Ace, Suit.Hearts),
          createCard(Rank.King, Suit.Diamonds),
          createCard(Rank.Queen, Suit.Clubs),
        ],
        potTotal: chips(100),
      };
      history.events.push(streetEvent);

      // Add hand ended event
      const handEndedEvent: HandEvent = {
        type: 'HAND_ENDED',
        timestamp: Date.now(),
        handId: 5,
        finalPlayers: [
          { id: player1, finalStack: chips(1050) },
          { id: player2, finalStack: chips(1450) },
        ],
      };
      history.events.push(handEndedEvent);

      // Serialize to JSON
      const json = handHistoryToJSON(history);

      // Verify JSON is valid
      expect(() => JSON.parse(json) as HandHistory).not.toThrow();

      // Deserialize back
      const restored = handHistoryFromJSON(json);

      // Verify all data is preserved
      expect(restored.handId).toBe(history.handId);
      expect(restored.events).toHaveLength(history.events.length);

      // Verify hand started event
      const restoredHandStarted = restored.events[0];
      expect(restoredHandStarted.type).toBe('HAND_STARTED');
      if (restoredHandStarted.type === 'HAND_STARTED') {
        expect(restoredHandStarted.handId).toBe(5);
        expect(restoredHandStarted.dealerSeat).toBe(0);
        expect(restoredHandStarted.players).toHaveLength(2);

        expect(restoredHandStarted.players[0].stack).toBe(1000n);
      }

      // Verify blinds posted event
      const restoredBlinds = restored.events[1];
      expect(restoredBlinds.type).toBe('BLINDS_POSTED');
      if (restoredBlinds.type === 'BLINDS_POSTED') {
        expect(restoredBlinds.smallBlind?.amount).toBe(1n);
        expect(restoredBlinds.bigBlind?.amount).toBe(2n);
      }

      // Verify cards dealt event
      const restoredCards = restored.events[2];
      expect(restoredCards.type).toBe('CARDS_DEALT');
      if (restoredCards.type === 'CARDS_DEALT') {
        expect(restoredCards.players).toHaveLength(2);
        expect(restoredCards.players[0].cards).toHaveLength(2);
        // Verify cards are correctly deserialized
        expect(restoredCards.players[0].cards[0]).toBe(
          createCard(Rank.Ace, Suit.Spades)
        );
      }

      // Verify action taken event
      const restoredAction = restored.events[3];
      expect(restoredAction.type).toBe('ACTION_TAKEN');
      if (restoredAction.type === 'ACTION_TAKEN') {
        expect(restoredAction.playerId).toBe(player1);
        expect(restoredAction.action).toBe('CALL');
      }

      // Verify street ended event
      const restoredStreet = restored.events[4];
      expect(restoredStreet.type).toBe('STREET_ENDED');
      if (restoredStreet.type === 'STREET_ENDED') {
        expect(restoredStreet.street).toBe(TablePhase.Flop);
        expect(restoredStreet.communityCards).toHaveLength(3);
        expect(restoredStreet.potTotal).toBe(100n);
      }

      // Verify hand ended event
      const restoredHandEnded = restored.events[5];
      expect(restoredHandEnded.type).toBe('HAND_ENDED');
      if (restoredHandEnded.type === 'HAND_ENDED') {
        expect(restoredHandEnded.handId).toBe(5);
        expect(restoredHandEnded.finalPlayers).toHaveLength(2);
        expect(restoredHandEnded.finalPlayers[0].finalStack).toBe(1050n);
      }
    });

    it('should handle table config with ante and straddle', () => {
      const config = createDefaultTableConfig();
      config.ante = chips(5);
      config.straddle = chips(4);

      const history = createHandHistory(1, config);
      const json = handHistoryToJSON(history);
      const restored = handHistoryFromJSON(json);

      expect(restored.tableConfig.ante).toBe(5n);
      expect(restored.tableConfig.straddle).toBe(4n);
    });

    it('should handle table config with rake', () => {
      const config = createDefaultTableConfig();
      config.rake = {
        percentage: 0.05,
        cap: chips(10),
      };

      const history = createHandHistory(1, config);
      const json = handHistoryToJSON(history);
      const restored = handHistoryFromJSON(json);

      expect(restored.tableConfig.rake).toBeDefined();
      expect(restored.tableConfig.rake?.percentage).toBe(0.05);
      expect(restored.tableConfig.rake?.cap).toBe(10n);
    });

    it('should preserve timestamps', () => {
      const config = createDefaultTableConfig();
      const history = createHandHistory(1, config);
      const startTime = history.startTime;

      const event: HandEvent = {
        type: 'HAND_STARTED',
        timestamp: Date.now(),
        handId: 1,
        dealerSeat: 0,
        players: [],
      };
      history.events.push(event);

      const json = handHistoryToJSON(history);
      const restored = handHistoryFromJSON(json);

      expect(restored.startTime).toBe(startTime);
      expect(restored.events[0].timestamp).toBe(event.timestamp);
    });
  });

  describe('Content consistency', () => {
    it('should maintain data integrity through serialization round-trip', () => {
      const config = createDefaultTableConfig();
      config.rngSeed = 12345;
      const history = createHandHistory(42, config);

      const player1 = createPlayerId('player-1');
      const player2 = createPlayerId('player-2');

      // Create a comprehensive event set
      history.events.push({
        type: 'HAND_STARTED',
        timestamp: 1000,
        handId: 42,
        dealerSeat: 1,
        players: [
          { id: player1, seat: 0, stack: chips(5000) },
          { id: player2, seat: 1, stack: chips(3000) },
        ],
      });

      history.events.push({
        type: 'ACTION_TAKEN',
        timestamp: 1100,
        playerId: player1,
        action: 'RAISE',
        amount: chips(50),
        allIn: false,
      });

      history.events.push({
        type: 'POT_DISTRIBUTED',
        timestamp: 1200,
        pots: [
          {
            amount: chips(150),
            winners: [{ playerId: player1, share: chips(150) }],
          },
        ],
      });

      history.endTime = 2000;

      // Serialize and deserialize
      const json = handHistoryToJSON(history);
      const restored = handHistoryFromJSON(json);

      // Verify complete consistency by comparing serialized versions
      const json2 = handHistoryToJSON(restored);
      expect(json2).toBe(json);
    });
  });
});
