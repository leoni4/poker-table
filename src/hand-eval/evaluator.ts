/**
 * Hand evaluation logic for Texas Hold'em
 */

import { Card, getCardRank, getCardSuit } from '../core/card';
import { HandCategory, EvaluatedHand } from './types';

/**
 * Evaluates a poker hand from up to 7 cards (hole cards + board)
 * Returns the best 5-card hand possible
 */
export function evaluateHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error('Hand evaluation requires 5 to 7 cards');
  }

  // Generate all 5-card combinations from the available cards
  const combinations = generateCombinations(cards, 5);

  // Evaluate each combination and find the best one
  let bestHand: EvaluatedHand | null = null;

  for (const combo of combinations) {
    const hand = evaluateFiveCards(combo);

    if (!bestHand || isHandBetter(hand, bestHand)) {
      bestHand = hand;
    }
  }

  return bestHand!;
}

/**
 * Generates all k-sized combinations from an array
 */
function generateCombinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];

  function backtrack(start: number, current: T[]): void {
    if (current.length === k) {
      result.push([...current]);
      return;
    }

    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

/**
 * Evaluates exactly 5 cards to determine hand category and ranking
 */
function evaluateFiveCards(cards: Card[]): EvaluatedHand {
  if (cards.length !== 5) {
    throw new Error('Must evaluate exactly 5 cards');
  }

  const ranks = cards.map(getCardRank).sort((a, b) => b - a);
  const suits = cards.map(getCardSuit);

  // Check for flush
  const isFlush = suits.every((s) => s === suits[0]);

  // Check for straight
  const straightHigh = checkStraight(ranks);
  const isStraight = straightHigh !== null;

  // Count rank frequencies
  const rankCounts = new Map<number, number>();
  for (const rank of ranks) {
    rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
  }

  // Sort by count (descending) then rank (descending)
  const groups = Array.from(rankCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // Determine hand category
  if (isStraight && isFlush) {
    return {
      category: HandCategory.StraightFlush,
      primaryRanks: [straightHigh],
      kickers: [],
      bestCards: [...cards],
    };
  }

  if (groups[0][1] === 4) {
    // Four of a kind
    const quadRank = groups[0][0];
    const kicker = groups[1][0];
    return {
      category: HandCategory.FourOfAKind,
      primaryRanks: [quadRank],
      kickers: [kicker],
      bestCards: [...cards],
    };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    // Full house
    const tripRank = groups[0][0];
    const pairRank = groups[1][0];
    return {
      category: HandCategory.FullHouse,
      primaryRanks: [tripRank, pairRank],
      kickers: [],
      bestCards: [...cards],
    };
  }

  if (isFlush) {
    return {
      category: HandCategory.Flush,
      primaryRanks: [],
      kickers: [...ranks],
      bestCards: [...cards],
    };
  }

  if (isStraight) {
    return {
      category: HandCategory.Straight,
      primaryRanks: [straightHigh],
      kickers: [],
      bestCards: [...cards],
    };
  }

  if (groups[0][1] === 3) {
    // Three of a kind
    const tripRank = groups[0][0];
    const kickers = groups.slice(1).map((g) => g[0]);
    return {
      category: HandCategory.ThreeOfAKind,
      primaryRanks: [tripRank],
      kickers,
      bestCards: [...cards],
    };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    // Two pair
    const pair1 = groups[0][0];
    const pair2 = groups[1][0];
    const kicker = groups[2][0];
    return {
      category: HandCategory.TwoPair,
      primaryRanks: [pair1, pair2],
      kickers: [kicker],
      bestCards: [...cards],
    };
  }

  if (groups[0][1] === 2) {
    // One pair
    const pairRank = groups[0][0];
    const kickers = groups.slice(1).map((g) => g[0]);
    return {
      category: HandCategory.Pair,
      primaryRanks: [pairRank],
      kickers,
      bestCards: [...cards],
    };
  }

  // High card
  return {
    category: HandCategory.HighCard,
    primaryRanks: [],
    kickers: [...ranks],
    bestCards: [...cards],
  };
}

/**
 * Checks if the ranks form a straight and returns the high card rank
 * Returns null if not a straight
 * Handles both regular straights and A-2-3-4-5 (wheel)
 */
function checkStraight(sortedRanks: number[]): number | null {
  // Check for wheel (A-2-3-4-5)
  if (
    sortedRanks[0] === 12 && // Ace
    sortedRanks[1] === 3 && // 5
    sortedRanks[2] === 2 && // 4
    sortedRanks[3] === 1 && // 3
    sortedRanks[4] === 0 // 2
  ) {
    return 3; // Return 5 (rank 3) as the high card for wheel
  }

  // Check for regular straight
  for (let i = 1; i < sortedRanks.length; i++) {
    if (sortedRanks[i] !== sortedRanks[i - 1] - 1) {
      return null;
    }
  }

  return sortedRanks[0]; // Return the highest card
}

/**
 * Compares two hands to determine if hand1 is better than hand2
 */
function isHandBetter(hand1: EvaluatedHand, hand2: EvaluatedHand): boolean {
  // First compare by category
  if (hand1.category !== hand2.category) {
    return hand1.category > hand2.category;
  }

  // Same category, compare primary ranks
  for (
    let i = 0;
    i < Math.max(hand1.primaryRanks.length, hand2.primaryRanks.length);
    i++
  ) {
    const rank1 = hand1.primaryRanks[i] ?? -1;
    const rank2 = hand2.primaryRanks[i] ?? -1;

    if (rank1 !== rank2) {
      return rank1 > rank2;
    }
  }

  // Primary ranks are equal, compare kickers
  for (
    let i = 0;
    i < Math.max(hand1.kickers.length, hand2.kickers.length);
    i++
  ) {
    const kicker1 = hand1.kickers[i] ?? -1;
    const kicker2 = hand2.kickers[i] ?? -1;

    if (kicker1 !== kicker2) {
      return kicker1 > kicker2;
    }
  }

  // Hands are equal
  return false;
}
