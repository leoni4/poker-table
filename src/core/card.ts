/**
 * Core card types and utilities for poker engine
 */

/**
 * Suit enum using bit-flags for efficient hand evaluation
 * clubs = 0, diamonds = 1, hearts = 2, spades = 3
 */
export enum Suit {
  Clubs = 0,
  Diamonds = 1,
  Hearts = 2,
  Spades = 3,
}

/**
 * Rank enum with values optimized for poker hand evaluation
 * 2 = 0, 3 = 1, ..., K = 11, A = 12
 */
export enum Rank {
  Two = 0,
  Three = 1,
  Four = 2,
  Five = 3,
  Six = 4,
  Seven = 5,
  Eight = 6,
  Nine = 7,
  Ten = 8,
  Jack = 9,
  Queen = 10,
  King = 11,
  Ace = 12,
}

/**
 * Card represented as a single number for efficient operations
 * Encodes both rank and suit in a compact form
 */
export type Card = number;

/**
 * Creates a card from rank and suit
 */
export function createCard(rank: Rank, suit: Suit): Card {
  return rank * 4 + suit;
}

/**
 * Extracts rank from a card
 */
export function getCardRank(card: Card): Rank {
  return Math.floor(card / 4);
}

/**
 * Extracts suit from a card
 */
export function getCardSuit(card: Card): Suit {
  return card % 4;
}

/**
 * Creates a full 52-card deck
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (let rank = Rank.Two; rank <= Rank.Ace; rank++) {
    for (let suit = Suit.Clubs; suit <= Suit.Spades; suit++) {
      deck.push(createCard(rank, suit));
    }
  }
  return deck;
}

/**
 * Converts a card to a readable string representation
 * e.g., "Ah" for Ace of hearts, "2c" for Two of clubs
 */
export function cardToString(card: Card): string {
  const rank = getCardRank(card);
  const suit = getCardSuit(card);

  const rankChars = [
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    'T',
    'J',
    'Q',
    'K',
    'A',
  ];
  const suitChars = ['c', 'd', 'h', 's'];

  return `${rankChars[rank]}${suitChars[suit]}`;
}

/**
 * Parses a string representation into a card
 * @throws Error if the string is not a valid card representation
 */
export function parseCard(str: string): Card {
  if (str.length !== 2) {
    throw new Error(`Invalid card string: ${str}`);
  }

  const rankChar = str[0];
  const suitChar = str[1].toLowerCase();

  const rankChars = [
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    't',
    'j',
    'q',
    'k',
    'a',
  ];
  const suitChars = ['c', 'd', 'h', 's'];

  const rankIndex = rankChars.indexOf(rankChar.toLowerCase());
  const suitIndex = suitChars.indexOf(suitChar);

  if (rankIndex === -1) {
    throw new Error(`Invalid rank: ${rankChar}`);
  }
  if (suitIndex === -1) {
    throw new Error(`Invalid suit: ${suitChar}`);
  }

  return createCard(rankIndex, suitIndex);
}
