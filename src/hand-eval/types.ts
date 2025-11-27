/**
 * Hand evaluation types for Texas Hold'em
 */

import { Card } from '../core/card';

/**
 * Hand categories in ascending order of strength
 */
export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

/**
 * Evaluated hand with category and tie-breaking information
 */
export interface EvaluatedHand {
  /** The hand category (straight flush, four of a kind, etc.) */
  category: HandCategory;
  /**
   * Primary ranks for the hand (e.g., the pair rank, or straight high card)
   * Sorted in descending order of importance for tie-breaking
   */
  primaryRanks: number[];
  /**
   * Kicker cards for tie-breaking when primary ranks are equal
   * Sorted in descending order
   */
  kickers: number[];
  /**
   * The 5 best cards that form this hand (for display/reference)
   */
  bestCards: Card[];
}

/**
 * Result of comparing two hands
 */
export enum ComparisonResult {
  /** First hand wins */
  Win = 1,
  /** Both hands tie */
  Tie = 0,
  /** Second hand wins */
  Loss = -1,
}

/**
 * Player's hole cards for hand evaluation
 */
export interface PlayerHand {
  /** Unique identifier for the player */
  playerId: string;
  /** The player's two hole cards */
  holeCards: [Card, Card];
}

/**
 * Result of determining winners among multiple players
 */
export interface WinnerResult {
  /** Player IDs of the winner(s) - multiple if split pot */
  winners: string[];
  /** The winning hand evaluation */
  winningHand: EvaluatedHand;
  /** Whether the pot is split among multiple winners */
  isSplitPot: boolean;
}
