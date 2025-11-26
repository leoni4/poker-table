import { describe, it, expect } from 'vitest';
import {
  Rank,
  Suit,
  Card,
  createCard,
  getCardRank,
  getCardSuit,
  createDeck,
  cardToString,
  parseCard,
} from '../../src/index.js';

describe('Card functionality', () => {
  describe('Card creation and properties', () => {
    it('should create a card from rank and suit', () => {
      const card = createCard(Rank.Ace, Suit.Spades);
      expect(getCardRank(card)).toBe(Rank.Ace);
      expect(getCardSuit(card)).toBe(Suit.Spades);
    });

    it('should create different cards with different properties', () => {
      const card1 = createCard(Rank.King, Suit.Hearts);
      const card2 = createCard(Rank.Two, Suit.Diamonds);

      expect(getCardRank(card1)).toBe(Rank.King);
      expect(getCardSuit(card1)).toBe(Suit.Hearts);
      expect(getCardRank(card2)).toBe(Rank.Two);
      expect(getCardSuit(card2)).toBe(Suit.Diamonds);
    });

    it('should create unique values for each card', () => {
      const cards = new Set<Card>();
      for (let rank = Rank.Two; rank <= Rank.Ace; rank++) {
        for (let suit = Suit.Clubs; suit <= Suit.Spades; suit++) {
          cards.add(createCard(rank, suit));
        }
      }
      expect(cards.size).toBe(52);
    });
  });

  describe('Card string representation', () => {
    it('should convert Ace of spades to string', () => {
      const card = createCard(Rank.Ace, Suit.Spades);
      expect(cardToString(card)).toBe('As');
    });

    it('should convert King of hearts to string', () => {
      const card = createCard(Rank.King, Suit.Hearts);
      expect(cardToString(card)).toBe('Kh');
    });

    it('should convert numbered card to string', () => {
      const card = createCard(Rank.Ten, Suit.Diamonds);
      expect(cardToString(card)).toBe('Td');
    });

    it('should convert Two of clubs to string', () => {
      const card = createCard(Rank.Two, Suit.Clubs);
      expect(cardToString(card)).toBe('2c');
    });
  });

  describe('Card parsing', () => {
    it('should parse valid card strings', () => {
      const card1 = parseCard('Ah');
      expect(getCardRank(card1)).toBe(Rank.Ace);
      expect(getCardSuit(card1)).toBe(Suit.Hearts);

      const card2 = parseCard('2c');
      expect(getCardRank(card2)).toBe(Rank.Two);
      expect(getCardSuit(card2)).toBe(Suit.Clubs);

      const card3 = parseCard('Ts');
      expect(getCardRank(card3)).toBe(Rank.Ten);
      expect(getCardSuit(card3)).toBe(Suit.Spades);
    });

    it('should handle uppercase and lowercase', () => {
      const card1 = parseCard('KH');
      const card2 = parseCard('kh');
      const card3 = parseCard('Kh');

      expect(getCardRank(card1)).toBe(Rank.King);
      expect(getCardRank(card2)).toBe(Rank.King);
      expect(getCardRank(card3)).toBe(Rank.King);
      expect(getCardSuit(card1)).toBe(Suit.Hearts);
      expect(getCardSuit(card2)).toBe(Suit.Hearts);
      expect(getCardSuit(card3)).toBe(Suit.Hearts);
    });

    it('should throw on invalid card strings', () => {
      expect(() => parseCard('XX')).toThrow();
      expect(() => parseCard('A')).toThrow();
      expect(() => parseCard('Ahh')).toThrow();
      expect(() => parseCard('1h')).toThrow();
      expect(() => parseCard('Ax')).toThrow();
    });
  });

  describe('Deck creation', () => {
    it('should create a deck with 52 unique cards', () => {
      const deck = createDeck();
      expect(deck.length).toBe(52);

      const uniqueCards = new Set(deck);
      expect(uniqueCards.size).toBe(52);
    });

    it('should have all ranks and suits', () => {
      const deck = createDeck();
      const ranks = new Set<Rank>();
      const suits = new Set<Suit>();

      for (const card of deck) {
        ranks.add(getCardRank(card));
        suits.add(getCardSuit(card));
      }

      expect(ranks.size).toBe(13);
      expect(suits.size).toBe(4);
    });

    it('should have exactly 4 cards of each rank', () => {
      const deck = createDeck();
      const rankCounts = new Map<Rank, number>();

      for (const card of deck) {
        const rank = getCardRank(card);
        rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
      }

      for (let rank = Rank.Two; rank <= Rank.Ace; rank++) {
        expect(rankCounts.get(rank)).toBe(4);
      }
    });

    it('should have exactly 13 cards of each suit', () => {
      const deck = createDeck();
      const suitCounts = new Map<Suit, number>();

      for (const card of deck) {
        const suit = getCardSuit(card);
        suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1);
      }

      for (let suit = Suit.Clubs; suit <= Suit.Spades; suit++) {
        expect(suitCounts.get(suit)).toBe(13);
      }
    });
  });

  describe('Round-trip conversion', () => {
    it('should maintain card identity through string conversion', () => {
      const originalCard = createCard(Rank.Queen, Suit.Diamonds);
      const cardString = cardToString(originalCard);
      const parsedCard = parseCard(cardString);

      expect(parsedCard).toBe(originalCard);
      expect(getCardRank(parsedCard)).toBe(Rank.Queen);
      expect(getCardSuit(parsedCard)).toBe(Suit.Diamonds);
    });

    it('should work for all cards in a deck', () => {
      const deck = createDeck();

      for (const card of deck) {
        const cardString = cardToString(card);
        const parsedCard = parseCard(cardString);
        expect(parsedCard).toBe(card);
      }
    });
  });
});
