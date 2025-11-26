/**
 * Unit tests for Deck module
 */

import { describe, it, expect } from 'vitest';
import { Deck, createShuffledDeck } from '../../src/deck/index.js';
import { createDeck, getCardRank, getCardSuit } from '../../src/core/card.js';
import { SeededRng } from '../../src/rng/seeded-rng.js';
import { isOk, isErr, unwrap } from '../../src/core/result.js';
import { ErrorCode } from '../../src/core/errors.js';

describe('Deck', () => {
  describe('constructor', () => {
    it('should create a deck with exactly 52 cards', () => {
      const deck = new Deck();
      expect(deck.size()).toBe(52);
      expect(deck.remaining()).toBe(52);
    });

    it('should contain 52 unique cards', () => {
      const deck = new Deck();
      const cards = deck.getCards();

      expect(cards.length).toBe(52);

      // Check all cards are unique
      const uniqueCards = new Set(cards);
      expect(uniqueCards.size).toBe(52);
    });

    it('should have all 13 ranks for each suit', () => {
      const deck = new Deck();
      const cards = deck.getCards();

      // Count cards by suit
      const suitCounts = new Map<number, number>();
      for (const card of cards) {
        const suit = getCardSuit(card);
        suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1);
      }

      // Each suit should have exactly 13 cards
      expect(suitCounts.size).toBe(4);
      for (const count of suitCounts.values()) {
        expect(count).toBe(13);
      }
    });

    it('should have 4 cards of each rank', () => {
      const deck = new Deck();
      const cards = deck.getCards();

      // Count cards by rank
      const rankCounts = new Map<number, number>();
      for (const card of cards) {
        const rank = getCardRank(card);
        rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
      }

      // Each rank should have exactly 4 cards
      expect(rankCounts.size).toBe(13);
      for (const count of rankCounts.values()) {
        expect(count).toBe(4);
      }
    });

    it('should create deck in standard order', () => {
      const deck = new Deck();
      const cards = deck.getCards();
      const expectedDeck = createDeck();

      expect(cards).toEqual(expectedDeck);
    });
  });

  describe('shuffle', () => {
    it('should change the order of cards', () => {
      const deck = new Deck();
      const originalOrder = deck.getCards();

      const rng = new SeededRng(42);
      deck.shuffle(rng);

      const shuffledOrder = deck.getCards();
      expect(shuffledOrder).not.toEqual(originalOrder);
    });

    it('should produce different orders with different seeds', () => {
      const deck1 = new Deck();
      const deck2 = new Deck();

      deck1.shuffle(new SeededRng(111));
      deck2.shuffle(new SeededRng(222));

      expect(deck1.getCards()).not.toEqual(deck2.getCards());
    });

    it('should produce the same order with the same seed', () => {
      const deck1 = new Deck();
      const deck2 = new Deck();

      deck1.shuffle(new SeededRng(12345));
      deck2.shuffle(new SeededRng(12345));

      expect(deck1.getCards()).toEqual(deck2.getCards());
    });

    it('should not lose or duplicate any cards after shuffling', () => {
      const deck = new Deck();
      const originalCards = new Set(deck.getCards());

      deck.shuffle(new SeededRng(999));

      const shuffledCards = new Set(deck.getCards());
      expect(shuffledCards).toEqual(originalCards);
      expect(deck.size()).toBe(52);
    });

    it('should only shuffle remaining cards after dealing', () => {
      const deck = new Deck();
      const rng = new SeededRng(42);

      // Deal 5 cards
      const dealResult = deck.deal(5);
      expect(isOk(dealResult)).toBe(true);
      const dealtCards = unwrap(dealResult);

      // Shuffle remaining cards
      deck.shuffle(rng);

      // The dealt cards should not be affected
      const allCards = deck.getCards();
      for (let i = 0; i < 5; i++) {
        expect(allCards[i]).toBe(dealtCards[i]);
      }
    });

    it('should handle shuffling multiple times', () => {
      const deck = new Deck();
      const rng = new SeededRng(777);

      deck.shuffle(rng);
      const firstShuffle = deck.getCards();

      deck.shuffle(rng);
      const secondShuffle = deck.getCards();

      // Different shuffles should produce different results
      expect(firstShuffle).not.toEqual(secondShuffle);

      // But should still have all 52 unique cards
      expect(new Set(secondShuffle).size).toBe(52);
    });
  });

  describe('dealOne', () => {
    it('should deal a single card', () => {
      const deck = new Deck();
      const result = deck.dealOne();

      expect(isOk(result)).toBe(true);
      expect(deck.remaining()).toBe(51);
    });

    it('should deal cards in order', () => {
      const deck = new Deck();
      const allCards = deck.getCards();

      const result1 = deck.dealOne();
      const result2 = deck.dealOne();
      const result3 = deck.dealOne();

      expect(unwrap(result1)).toBe(allCards[0]);
      expect(unwrap(result2)).toBe(allCards[1]);
      expect(unwrap(result3)).toBe(allCards[2]);
    });

    it('should reduce remaining count with each deal', () => {
      const deck = new Deck();

      for (let i = 52; i > 0; i--) {
        expect(deck.remaining()).toBe(i);
        const result = deck.dealOne();
        expect(isOk(result)).toBe(true);
      }

      expect(deck.remaining()).toBe(0);
    });

    it('should return error when deck is empty', () => {
      const deck = new Deck();

      // Deal all cards
      for (let i = 0; i < 52; i++) {
        deck.dealOne();
      }

      // Try to deal one more
      const result = deck.dealOne();
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(ErrorCode.INVALID_CARD);
      }
    });
  });

  describe('deal', () => {
    it('should deal multiple cards at once', () => {
      const deck = new Deck();
      const result = deck.deal(5);

      expect(isOk(result)).toBe(true);
      const cards = unwrap(result);
      expect(cards.length).toBe(5);
      expect(deck.remaining()).toBe(47);
    });

    it('should deal cards in correct order', () => {
      const deck = new Deck();
      const allCards = deck.getCards();

      const result = deck.deal(3);
      const dealtCards = unwrap(result);

      expect(dealtCards[0]).toBe(allCards[0]);
      expect(dealtCards[1]).toBe(allCards[1]);
      expect(dealtCards[2]).toBe(allCards[2]);
    });

    it('should handle dealing 0 cards', () => {
      const deck = new Deck();
      const result = deck.deal(0);

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toEqual([]);
      expect(deck.remaining()).toBe(52);
    });

    it('should return error when dealing negative count', () => {
      const deck = new Deck();
      const result = deck.deal(-5);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(ErrorCode.INVALID_CARD);
      }
    });

    it('should return error when not enough cards remain', () => {
      const deck = new Deck();

      // Deal 50 cards
      deck.deal(50);

      // Try to deal 5 more (only 2 remain)
      const result = deck.deal(5);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(ErrorCode.INVALID_CARD);
      }
    });

    it('should deal all remaining cards exactly', () => {
      const deck = new Deck();
      const result = deck.deal(52);

      expect(isOk(result)).toBe(true);
      expect(unwrap(result).length).toBe(52);
      expect(deck.remaining()).toBe(0);
    });
  });

  describe('dealHoleCards', () => {
    it('should deal 2 cards to each player', () => {
      const deck = new Deck();
      const result = deck.dealHoleCards(3);

      expect(isOk(result)).toBe(true);
      const holeCards = unwrap(result);
      expect(holeCards.length).toBe(3);
      expect(holeCards[0].length).toBe(2);
      expect(holeCards[1].length).toBe(2);
      expect(holeCards[2].length).toBe(2);
      expect(deck.remaining()).toBe(46);
    });

    it('should deal in round-robin fashion', () => {
      const deck = new Deck();
      const allCards = deck.getCards();

      const result = deck.dealHoleCards(3);
      const holeCards = unwrap(result);

      // First card to each player: cards 0, 1, 2
      // Second card to each player: cards 3, 4, 5
      expect(holeCards[0]).toEqual([allCards[0], allCards[3]]);
      expect(holeCards[1]).toEqual([allCards[1], allCards[4]]);
      expect(holeCards[2]).toEqual([allCards[2], allCards[5]]);
    });

    it('should handle dealing to 0 players', () => {
      const deck = new Deck();
      const result = deck.dealHoleCards(0);

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toEqual([]);
      expect(deck.remaining()).toBe(52);
    });

    it('should return error for negative player count', () => {
      const deck = new Deck();
      const result = deck.dealHoleCards(-1);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(ErrorCode.INVALID_CARD);
      }
    });

    it('should return error when not enough cards for all players', () => {
      const deck = new Deck();

      // Deal 48 cards, leaving only 4
      deck.deal(48);

      // Try to deal hole cards to 3 players (needs 6 cards)
      const result = deck.dealHoleCards(3);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(ErrorCode.INVALID_CARD);
      }
    });

    it('should handle maximum players (23 players = 46 cards)', () => {
      const deck = new Deck();
      const result = deck.dealHoleCards(23);

      expect(isOk(result)).toBe(true);
      expect(unwrap(result).length).toBe(23);
      expect(deck.remaining()).toBe(6);
    });
  });

  describe('dealFlop', () => {
    it('should deal exactly 3 cards', () => {
      const deck = new Deck();
      const result = deck.dealFlop();

      expect(isOk(result)).toBe(true);
      const flop = unwrap(result);
      expect(flop.length).toBe(3);
      expect(deck.remaining()).toBe(49);
    });

    it('should deal cards in order', () => {
      const deck = new Deck();
      const allCards = deck.getCards();

      const result = deck.dealFlop();
      const flop = unwrap(result);

      expect(flop[0]).toBe(allCards[0]);
      expect(flop[1]).toBe(allCards[1]);
      expect(flop[2]).toBe(allCards[2]);
    });

    it('should return error when less than 3 cards remain', () => {
      const deck = new Deck();

      // Deal 50 cards
      deck.deal(50);

      const result = deck.dealFlop();
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(ErrorCode.INVALID_CARD);
      }
    });
  });

  describe('dealCommunityCard', () => {
    it('should deal a single card', () => {
      const deck = new Deck();
      const result = deck.dealCommunityCard();

      expect(isOk(result)).toBe(true);
      expect(deck.remaining()).toBe(51);
    });

    it('should return error when deck is empty', () => {
      const deck = new Deck();
      deck.deal(52);

      const result = deck.dealCommunityCard();
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(ErrorCode.INVALID_CARD);
      }
    });
  });

  describe('reset', () => {
    it('should reset dealt count to 0', () => {
      const deck = new Deck();

      deck.deal(10);
      expect(deck.remaining()).toBe(42);

      deck.reset();
      expect(deck.remaining()).toBe(52);
    });

    it('should not change card order', () => {
      const deck = new Deck();
      const originalOrder = deck.getCards();

      deck.shuffle(new SeededRng(42));
      const shuffledOrder = deck.getCards();

      deck.reset();
      const afterReset = deck.getCards();

      expect(afterReset).toEqual(shuffledOrder);
      expect(afterReset).not.toEqual(originalOrder);
    });

    it('should allow dealing again after reset', () => {
      const deck = new Deck();
      const allCards = deck.getCards();

      const result1 = deck.dealOne();
      deck.reset();
      const result2 = deck.dealOne();

      expect(unwrap(result1)).toBe(allCards[0]);
      expect(unwrap(result2)).toBe(allCards[0]);
    });
  });

  describe('refresh', () => {
    it('should create a new deck and reset dealt count', () => {
      const deck = new Deck();

      deck.shuffle(new SeededRng(42));
      deck.deal(10);

      deck.refresh();

      expect(deck.remaining()).toBe(52);
      expect(deck.getCards()).toEqual(createDeck());
    });
  });

  describe('integration scenarios', () => {
    it('should handle a typical poker hand flow', () => {
      const deck = new Deck();
      deck.shuffle(new SeededRng(12345));

      // Deal hole cards to 6 players
      const holeCardsResult = deck.dealHoleCards(6);
      expect(isOk(holeCardsResult)).toBe(true);
      expect(deck.remaining()).toBe(40);

      // Deal flop
      const flopResult = deck.dealFlop();
      expect(isOk(flopResult)).toBe(true);
      expect(deck.remaining()).toBe(37);

      // Deal turn
      const turnResult = deck.dealCommunityCard();
      expect(isOk(turnResult)).toBe(true);
      expect(deck.remaining()).toBe(36);

      // Deal river
      const riverResult = deck.dealCommunityCard();
      expect(isOk(riverResult)).toBe(true);
      expect(deck.remaining()).toBe(35);
    });

    it('should handle multiple hands with reset', () => {
      const deck = new Deck();
      const rng = new SeededRng(999);

      for (let hand = 0; hand < 3; hand++) {
        deck.shuffle(rng);
        deck.dealHoleCards(4); // 8 cards
        deck.dealFlop(); // 3 cards
        deck.dealCommunityCard(); // turn - 1 card
        deck.dealCommunityCard(); // river - 1 card
        // Total: 8 + 3 + 1 + 1 = 13 cards dealt

        expect(deck.remaining()).toBe(39); // 52 - 13 = 39
        deck.reset();
      }
    });
  });
});

describe('createShuffledDeck', () => {
  it('should create a shuffled deck', () => {
    const rng = new SeededRng(42);
    const deck = createShuffledDeck(rng);

    expect(deck.size()).toBe(52);
    expect(deck.remaining()).toBe(52);

    // Should be in different order than standard deck
    expect(deck.getCards()).not.toEqual(createDeck());
  });

  it('should create deterministic shuffled decks with same seed', () => {
    const deck1 = createShuffledDeck(new SeededRng(777));
    const deck2 = createShuffledDeck(new SeededRng(777));

    expect(deck1.getCards()).toEqual(deck2.getCards());
  });

  it('should create different shuffled decks with different seeds', () => {
    const deck1 = createShuffledDeck(new SeededRng(111));
    const deck2 = createShuffledDeck(new SeededRng(222));

    expect(deck1.getCards()).not.toEqual(deck2.getCards());
  });
});
