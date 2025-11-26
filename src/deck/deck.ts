/**
 * Deck implementation with shuffling and dealing operations
 */

import { Card, createDeck as createCardDeck } from '../core/card.js';
import { Rng } from '../rng/interface.js';
import { Result, ok, err } from '../core/result.js';
import { ErrorCode } from '../core/errors.js';

/**
 * Deck class for managing a deck of cards
 * Supports shuffling with RNG and dealing cards
 */
export class Deck {
  private cards: Card[];
  private dealtCount: number;

  /**
   * Creates a new deck with 52 cards in standard order
   */
  constructor() {
    this.cards = createCardDeck();
    this.dealtCount = 0;
  }

  /**
   * Shuffles the deck using Fisher-Yates algorithm with the provided RNG
   * Only shuffles the remaining (undealt) cards
   *
   * @param rng - Random number generator to use for shuffling
   */
  shuffle(rng: Rng): void {
    // Fisher-Yates shuffle algorithm
    // Only shuffle the remaining cards (from dealtCount onwards)
    for (let i = this.cards.length - 1; i > this.dealtCount; i--) {
      const j = this.dealtCount + rng.nextInt(i - this.dealtCount + 1);
      // Swap cards[i] and cards[j]
      const temp = this.cards[i];
      this.cards[i] = this.cards[j];
      this.cards[j] = temp;
    }
  }

  /**
   * Deals a single card from the deck
   *
   * @returns Result containing the dealt card, or an error if no cards remain
   */
  dealOne(): Result<Card, ErrorCode> {
    if (this.dealtCount >= this.cards.length) {
      return err(ErrorCode.INVALID_CARD);
    }

    const card = this.cards[this.dealtCount];
    this.dealtCount++;
    return ok(card);
  }

  /**
   * Deals multiple cards from the deck
   *
   * @param count - Number of cards to deal
   * @returns Result containing an array of dealt cards, or an error if not enough cards remain
   */
  deal(count: number): Result<Card[], ErrorCode> {
    if (count < 0) {
      return err(ErrorCode.INVALID_CARD);
    }

    if (count === 0) {
      return ok([]);
    }

    if (this.dealtCount + count > this.cards.length) {
      return err(ErrorCode.INVALID_CARD);
    }

    const dealt: Card[] = [];
    for (let i = 0; i < count; i++) {
      dealt.push(this.cards[this.dealtCount]);
      this.dealtCount++;
    }

    return ok(dealt);
  }

  /**
   * Deals hole cards (2 cards) to multiple players
   * Deals in a round-robin fashion: one card to each player, then a second card to each player
   *
   * @param playerCount - Number of players to deal to
   * @returns Result containing an array of card pairs (one pair per player), or an error if not enough cards
   */
  dealHoleCards(playerCount: number): Result<[Card, Card][], ErrorCode> {
    if (playerCount < 0) {
      return err(ErrorCode.INVALID_CARD);
    }

    if (playerCount === 0) {
      return ok([]);
    }

    const totalNeeded = playerCount * 2;
    if (this.dealtCount + totalNeeded > this.cards.length) {
      return err(ErrorCode.INVALID_CARD);
    }

    // Deal first card to each player
    const firstCards: Card[] = [];
    for (let i = 0; i < playerCount; i++) {
      firstCards.push(this.cards[this.dealtCount]);
      this.dealtCount++;
    }

    // Deal second card to each player
    const holeCards: [Card, Card][] = [];
    for (let i = 0; i < playerCount; i++) {
      const secondCard = this.cards[this.dealtCount];
      this.dealtCount++;
      holeCards.push([firstCards[i], secondCard]);
    }

    return ok(holeCards);
  }

  /**
   * Deals the flop (3 community cards)
   *
   * @returns Result containing an array of 3 cards, or an error if not enough cards remain
   */
  dealFlop(): Result<[Card, Card, Card], ErrorCode> {
    if (this.dealtCount + 3 > this.cards.length) {
      return err(ErrorCode.INVALID_CARD);
    }

    const card1 = this.cards[this.dealtCount++];
    const card2 = this.cards[this.dealtCount++];
    const card3 = this.cards[this.dealtCount++];

    return ok([card1, card2, card3]);
  }

  /**
   * Deals the turn or river (1 community card)
   *
   * @returns Result containing the dealt card, or an error if no cards remain
   */
  dealCommunityCard(): Result<Card, ErrorCode> {
    return this.dealOne();
  }

  /**
   * Returns the number of cards remaining in the deck
   */
  remaining(): number {
    return this.cards.length - this.dealtCount;
  }

  /**
   * Returns the total number of cards in the deck (always 52)
   */
  size(): number {
    return this.cards.length;
  }

  /**
   * Returns a copy of all cards in the deck (both dealt and undealt)
   * Useful for testing and debugging
   */
  getCards(): Card[] {
    return [...this.cards];
  }

  /**
   * Resets the deck to initial state (all cards undealt, same order)
   */
  reset(): void {
    this.dealtCount = 0;
  }

  /**
   * Creates a new deck with all 52 cards and resets dealt count
   */
  refresh(): void {
    this.cards = createCardDeck();
    this.dealtCount = 0;
  }
}

/**
 * Creates a new shuffled deck using the provided RNG
 *
 * @param rng - Random number generator to use for shuffling
 * @returns A new shuffled deck
 */
export function createShuffledDeck(rng: Rng): Deck {
  const deck = new Deck();
  deck.shuffle(rng);
  return deck;
}
