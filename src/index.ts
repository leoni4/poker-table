/**
 * Represents a playing card suit
 */
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

/**
 * Represents a playing card rank
 */
export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A';

/**
 * Represents a playing card with a rank and suit
 */
export interface Card {
  rank: Rank;
  suit: Suit;
}

/**
 * Creates a new card with the specified rank and suit
 */
export function createCard(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

/**
 * Returns a string representation of a card
 */
export function cardToString(card: Card): string {
  return `${card.rank}${card.suit.charAt(0).toUpperCase()}`;
}

/**
 * Validates if a given rank is valid
 */
export function isValidRank(rank: string): rank is Rank {
  const validRanks: Rank[] = [
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    'J',
    'Q',
    'K',
    'A',
  ];
  return validRanks.includes(rank as Rank);
}

/**
 * Validates if a given suit is valid
 */
export function isValidSuit(suit: string): suit is Suit {
  const validSuits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  return validSuits.includes(suit as Suit);
}
