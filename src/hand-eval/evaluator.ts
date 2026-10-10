/**
 * Hand evaluation logic for Texas Hold'em
 */

import { Card, getCardRank, getCardSuit } from '../core/card.js';
import { HandCategory, EvaluatedHand } from './types.js';

/**
 * Evaluates a poker hand from up to 7 cards (hole cards + board)
 * Returns the best 5-card hand possible
 */
export function evaluateHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error('Hand evaluation requires 5 to 7 cards');
  }

  if (!hasDistinctValidCards(cards)) {
    return evaluateHandByCombinations(cards);
  }

  return evaluateDistinctValidCards(cards);
}

const CATEGORY_SHIFT = 20;

const PRIMARY_RANK_COUNTS = [0, 1, 2, 1, 1, 0, 2, 1, 1];

const SCORED_RANK_COUNTS = [5, 4, 3, 3, 1, 5, 2, 2, 1];

const scratchRanks = new Int8Array(7);
const scratchSuits = new Int8Array(7);

function hasDistinctValidCards(cards: Card[]): boolean {
  let lowMask = 0;
  let highMask = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (
      typeof card !== 'number' ||
      !Number.isInteger(card) ||
      card < 0 ||
      card > 51 ||
      Object.is(card, -0)
    ) {
      return false;
    }

    if (card < 26) {
      const bit = 1 << card;
      if ((lowMask & bit) !== 0) return false;
      lowMask |= bit;
    } else {
      const bit = 1 << (card - 26);
      if ((highMask & bit) !== 0) return false;
      highMask |= bit;
    }
  }

  return true;
}

function evaluateDistinctValidCards(cards: Card[]): EvaluatedHand {
  const count = cards.length;
  const ranks = scratchRanks;
  const suits = scratchSuits;

  for (let i = 0; i < count; i++) {
    ranks[i] = cards[i] >> 2;
    suits[i] = cards[i] & 3;
  }

  let bestScore = -1;
  let best0 = 0;
  let best1 = 1;
  let best2 = 2;
  let best3 = 3;
  let best4 = 4;

  for (let i0 = 0; i0 < count - 4; i0++) {
    for (let i1 = i0 + 1; i1 < count - 3; i1++) {
      for (let i2 = i1 + 1; i2 < count - 2; i2++) {
        for (let i3 = i2 + 1; i3 < count - 1; i3++) {
          for (let i4 = i3 + 1; i4 < count; i4++) {
            const suit = suits[i0];
            const isFlush =
              suits[i1] === suit &&
              suits[i2] === suit &&
              suits[i3] === suit &&
              suits[i4] === suit;
            const score = scoreFiveRanks(
              ranks[i0],
              ranks[i1],
              ranks[i2],
              ranks[i3],
              ranks[i4],
              isFlush
            );

            if (score > bestScore) {
              bestScore = score;
              best0 = i0;
              best1 = i1;
              best2 = i2;
              best3 = i3;
              best4 = i4;
            }
          }
        }
      }
    }
  }

  const category: HandCategory = bestScore >> CATEGORY_SHIFT;
  const primaryRankCount = PRIMARY_RANK_COUNTS[category];
  const scoredRankCount = SCORED_RANK_COUNTS[category];
  const primaryRanks: number[] = [];
  const kickers: number[] = [];

  for (let i = 0; i < scoredRankCount; i++) {
    const rank = (bestScore >> (16 - 4 * i)) & 15;
    if (i < primaryRankCount) {
      primaryRanks.push(rank);
    } else {
      kickers.push(rank);
    }
  }

  return {
    category,
    primaryRanks,
    kickers,
    bestCards: [
      cards[best0],
      cards[best1],
      cards[best2],
      cards[best3],
      cards[best4],
    ],
  };
}

function scoreFiveRanks(
  r0: number,
  r1: number,
  r2: number,
  r3: number,
  r4: number,
  isFlush: boolean
): number {
  let a = r0;
  let b = r1;
  let c = r2;
  let d = r3;
  let e = r4;
  let t: number;

  if (a < b) {
    t = a;
    a = b;
    b = t;
  }
  if (d < e) {
    t = d;
    d = e;
    e = t;
  }
  if (c < e) {
    t = c;
    c = e;
    e = t;
  }
  if (c < d) {
    t = c;
    c = d;
    d = t;
  }
  if (a < d) {
    t = a;
    a = d;
    d = t;
  }
  if (a < c) {
    t = a;
    a = c;
    c = t;
  }
  if (b < e) {
    t = b;
    b = e;
    e = t;
  }
  if (b < d) {
    t = b;
    b = d;
    d = t;
  }
  if (b < c) {
    t = b;
    b = c;
    c = t;
  }

  if (a !== b && b !== c && c !== d && d !== e) {
    const straightHigh = a - e === 4 ? a : a === 12 && b === 3 ? 3 : -1;
    if (straightHigh >= 0) {
      const category = isFlush
        ? HandCategory.StraightFlush
        : HandCategory.Straight;
      return (category << CATEGORY_SHIFT) | (straightHigh << 16);
    }
    const category = isFlush ? HandCategory.Flush : HandCategory.HighCard;
    return packScore(category, a, b, c, d, e);
  }

  if (a === d) return packScore(HandCategory.FourOfAKind, a, e, 0, 0, 0);
  if (b === e) return packScore(HandCategory.FourOfAKind, b, a, 0, 0, 0);

  if (a === c) {
    if (d === e) return packScore(HandCategory.FullHouse, a, d, 0, 0, 0);
    return packScore(HandCategory.ThreeOfAKind, a, d, e, 0, 0);
  }
  if (b === d) return packScore(HandCategory.ThreeOfAKind, b, a, e, 0, 0);
  if (c === e) {
    if (a === b) return packScore(HandCategory.FullHouse, c, a, 0, 0, 0);
    return packScore(HandCategory.ThreeOfAKind, c, a, b, 0, 0);
  }

  if (a === b) {
    if (c === d) return packScore(HandCategory.TwoPair, a, c, e, 0, 0);
    if (d === e) return packScore(HandCategory.TwoPair, a, d, c, 0, 0);
    return packScore(HandCategory.Pair, a, c, d, e, 0);
  }
  if (b === c) {
    if (d === e) return packScore(HandCategory.TwoPair, b, d, a, 0, 0);
    return packScore(HandCategory.Pair, b, a, d, e, 0);
  }
  if (c === d) return packScore(HandCategory.Pair, c, a, b, e, 0);
  return packScore(HandCategory.Pair, d, a, b, c, 0);
}

function packScore(
  category: HandCategory,
  k0: number,
  k1: number,
  k2: number,
  k3: number,
  k4: number
): number {
  return (
    (category << CATEGORY_SHIFT) |
    (k0 << 16) |
    (k1 << 12) |
    (k2 << 8) |
    (k3 << 4) |
    k4
  );
}

function evaluateHandByCombinations(cards: Card[]): EvaluatedHand {
  const combinations = generateCombinations(cards, 5);

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
