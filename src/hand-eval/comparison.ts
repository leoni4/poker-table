/**
 * Hand comparison and winner determination logic
 */

import { Card } from '../core/card';
import {
  EvaluatedHand,
  ComparisonResult,
  PlayerHand,
  WinnerResult,
} from './types';
import { evaluateHand } from './evaluator';

/**
 * Compares two evaluated hands
 * Returns:
 *  - ComparisonResult.Win if hand1 is better
 *  - ComparisonResult.Tie if hands are equal
 *  - ComparisonResult.Loss if hand2 is better
 */
export function compareHands(
  hand1: EvaluatedHand,
  hand2: EvaluatedHand
): ComparisonResult {
  // First compare by category
  if (hand1.category !== hand2.category) {
    return hand1.category > hand2.category
      ? ComparisonResult.Win
      : ComparisonResult.Loss;
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
      return rank1 > rank2 ? ComparisonResult.Win : ComparisonResult.Loss;
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
      return kicker1 > kicker2 ? ComparisonResult.Win : ComparisonResult.Loss;
    }
  }

  // Hands are completely equal
  return ComparisonResult.Tie;
}

/**
 * Determines winner(s) among multiple players given their hole cards and a common board
 * Returns the winning player(s) and whether the pot is split
 */
export function determineWinners(
  players: PlayerHand[],
  board: Card[]
): WinnerResult {
  if (players.length === 0) {
    throw new Error('At least one player is required');
  }

  if (board.length < 3 || board.length > 5) {
    throw new Error('Board must contain 3-5 cards');
  }

  // Evaluate each player's hand
  const evaluatedHands = players.map((player) => ({
    playerId: player.playerId,
    hand: evaluateHand([...player.holeCards, ...board]),
  }));

  // Find the best hand(s)
  let bestHand = evaluatedHands[0].hand;
  let winners = [evaluatedHands[0].playerId];

  for (let i = 1; i < evaluatedHands.length; i++) {
    const result = compareHands(evaluatedHands[i].hand, bestHand);

    if (result === ComparisonResult.Win) {
      // New winner, reset the list
      bestHand = evaluatedHands[i].hand;
      winners = [evaluatedHands[i].playerId];
    } else if (result === ComparisonResult.Tie) {
      // Split pot, add to winners list
      winners.push(evaluatedHands[i].playerId);
    }
    // Loss: do nothing, current best remains
  }

  return {
    winners,
    winningHand: bestHand,
    isSplitPot: winners.length > 1,
  };
}
