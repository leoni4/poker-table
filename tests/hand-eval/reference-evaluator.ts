
import { Card, getCardRank, getCardSuit } from '../../src/core/card.js';
import { HandCategory, EvaluatedHand } from '../../src/hand-eval/types.js';


export function referenceEvaluateHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error('Hand evaluation requires 5 to 7 cards');
  }

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

function evaluateFiveCards(cards: Card[]): EvaluatedHand {
  if (cards.length !== 5) {
    throw new Error('Must evaluate exactly 5 cards');
  }

  const ranks = cards.map(getCardRank).sort((a, b) => b - a);
  const suits = cards.map(getCardSuit);

  const isFlush = suits.every((s) => s === suits[0]);

  const straightHigh = checkStraight(ranks);
  const isStraight = straightHigh !== null;

  const rankCounts = new Map<number, number>();
  for (const rank of ranks) {
    rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
  }

  const groups = Array.from(rankCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (isStraight && isFlush) {
    return {
      category: HandCategory.StraightFlush,
      primaryRanks: [straightHigh],
      kickers: [],
      bestCards: [...cards],
    };
  }

  if (groups[0][1] === 4) {
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
    const pairRank = groups[0][0];
    const kickers = groups.slice(1).map((g) => g[0]);
    return {
      category: HandCategory.Pair,
      primaryRanks: [pairRank],
      kickers,
      bestCards: [...cards],
    };
  }

  return {
    category: HandCategory.HighCard,
    primaryRanks: [],
    kickers: [...ranks],
    bestCards: [...cards],
  };
}

function checkStraight(sortedRanks: number[]): number | null {
  if (
    sortedRanks[0] === 12 && 
    sortedRanks[1] === 3 && 
    sortedRanks[2] === 2 && 
    sortedRanks[3] === 1 && 
    sortedRanks[4] === 0 
  ) {
    return 3; 
  }

  for (let i = 1; i < sortedRanks.length; i++) {
    if (sortedRanks[i] !== sortedRanks[i - 1] - 1) {
      return null;
    }
  }

  return sortedRanks[0]; 
}

function isHandBetter(hand1: EvaluatedHand, hand2: EvaluatedHand): boolean {
  if (hand1.category !== hand2.category) {
    return hand1.category > hand2.category;
  }

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

  return false;
}
