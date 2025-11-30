/**
 * Edge-case tests for hand evaluator
 * Focus on tricky combinations, equal hands, and split pots
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateHand,
  compareHands,
  determineWinners,
  HandCategory,
  ComparisonResult,
} from '../../src/hand-eval';
import { parseCard } from '../../src/core/card';

describe('Hand Evaluator - Edge Cases', () => {
  describe('Tricky Hand Combinations', () => {
    it('should correctly identify straight flush over flush with same suits', () => {
      const straightFlush = evaluateHand([
        parseCard('9h'),
        parseCard('8h'),
        parseCard('7h'),
        parseCard('6h'),
        parseCard('5h'),
        parseCard('Ah'),
        parseCard('2h'),
      ]);
      const flush = evaluateHand([
        parseCard('Ah'),
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('Jh'),
        parseCard('9h'),
        parseCard('2c'),
        parseCard('3d'),
      ]);

      expect(straightFlush.category).toBe(HandCategory.StraightFlush);
      expect(flush.category).toBe(HandCategory.Flush);
      expect(compareHands(straightFlush, flush)).toBe(ComparisonResult.Win);
    });

    it('should correctly identify full house over trips with same three of a kind', () => {
      const fullHouse = evaluateHand([
        parseCard('Kh'),
        parseCard('Kd'),
        parseCard('Kc'),
        parseCard('2s'),
        parseCard('2h'),
      ]);
      const trips = evaluateHand([
        parseCard('Kh'),
        parseCard('Kd'),
        parseCard('Kc'),
        parseCard('As'),
        parseCard('Qh'),
      ]);

      expect(fullHouse.category).toBe(HandCategory.FullHouse);
      expect(trips.category).toBe(HandCategory.ThreeOfAKind);
      expect(compareHands(fullHouse, trips)).toBe(ComparisonResult.Win);
    });

    it('should handle multiple possible straights and pick the highest', () => {
      const hand = evaluateHand([
        parseCard('Th'),
        parseCard('9s'),
        parseCard('8d'),
        parseCard('7c'),
        parseCard('6h'),
        parseCard('5s'),
        parseCard('4d'),
      ]);

      expect(hand.category).toBe(HandCategory.Straight);
      expect(hand.primaryRanks).toEqual([8]); // T-high straight (rank 8)
    });

    it('should handle multiple possible flushes and pick the highest', () => {
      const hand = evaluateHand([
        parseCard('As'),
        parseCard('Ks'),
        parseCard('Qs'),
        parseCard('2s'),
        parseCard('3s'),
        parseCard('4s'),
        parseCard('5s'),
      ]);

      expect(hand.category).toBe(HandCategory.StraightFlush);
      expect(hand.primaryRanks).toEqual([3]); // 5-high straight flush (wheel)
    });

    it('should correctly identify two pair with kicker from 7 cards', () => {
      const hand = evaluateHand([
        parseCard('As'),
        parseCard('Ah'),
        parseCard('Ks'),
        parseCard('Kh'),
        parseCard('Qd'),
        parseCard('Jc'),
        parseCard('2s'),
      ]);

      expect(hand.category).toBe(HandCategory.TwoPair);
      expect(hand.primaryRanks).toEqual([12, 11]); // Aces and Kings
      expect(hand.kickers).toEqual([10]); // Queen kicker (not Jack)
    });

    it('should handle almost-straight (one card away)', () => {
      const hand = evaluateHand([
        parseCard('9h'),
        parseCard('8s'),
        parseCard('7d'),
        parseCard('6c'),
        parseCard('4h'),
      ]);

      expect(hand.category).toBe(HandCategory.HighCard);
      expect(hand.kickers[0]).toBe(7); // 9-high
    });

    it('should handle almost-flush (4 of same suit)', () => {
      const hand = evaluateHand([
        parseCard('Ah'),
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('Jh'),
        parseCard('9s'),
      ]);

      expect(hand.category).toBe(HandCategory.HighCard);
      expect(hand.kickers).toEqual([12, 11, 10, 9, 7]);
    });

    it('should correctly evaluate low straight flush (not wheel)', () => {
      const hand = evaluateHand([
        parseCard('6d'),
        parseCard('5d'),
        parseCard('4d'),
        parseCard('3d'),
        parseCard('2d'),
      ]);

      expect(hand.category).toBe(HandCategory.StraightFlush);
      expect(hand.primaryRanks).toEqual([4]); // 6-high
    });

    it('should correctly evaluate mid-range four of a kind', () => {
      const hand = evaluateHand([
        parseCard('7s'),
        parseCard('7h'),
        parseCard('7d'),
        parseCard('7c'),
        parseCard('2h'),
      ]);

      expect(hand.category).toBe(HandCategory.FourOfAKind);
      expect(hand.primaryRanks).toEqual([5]); // Sevens
      expect(hand.kickers).toEqual([0]); // 2 kicker
    });

    it('should pick best full house from multiple trip/pair options', () => {
      const hand = evaluateHand([
        parseCard('Kh'),
        parseCard('Kd'),
        parseCard('Kc'),
        parseCard('Qs'),
        parseCard('Qh'),
        parseCard('Qd'),
        parseCard('2c'),
      ]);

      expect(hand.category).toBe(HandCategory.FullHouse);
      expect(hand.primaryRanks).toEqual([11, 10]); // Kings full of Queens
    });
  });

  describe('Equal Hands - Exact Ties', () => {
    it('should tie when both have identical royal flushes (different suits)', () => {
      const hand1 = evaluateHand([
        parseCard('Ah'),
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('Jh'),
        parseCard('Th'),
      ]);
      const hand2 = evaluateHand([
        parseCard('As'),
        parseCard('Ks'),
        parseCard('Qs'),
        parseCard('Js'),
        parseCard('Ts'),
      ]);

      expect(compareHands(hand1, hand2)).toBe(ComparisonResult.Tie);
    });

    it('should tie when both have identical four of a kind with same kicker', () => {
      const hand1 = evaluateHand([
        parseCard('Kh'),
        parseCard('Kd'),
        parseCard('Kc'),
        parseCard('Ks'),
        parseCard('Ah'),
      ]);
      const hand2 = evaluateHand([
        parseCard('Kh'),
        parseCard('Kd'),
        parseCard('Kc'),
        parseCard('Ks'),
        parseCard('As'),
      ]);

      expect(compareHands(hand1, hand2)).toBe(ComparisonResult.Tie);
    });

    it('should differentiate four of a kind by kicker', () => {
      const handAceKicker = evaluateHand([
        parseCard('Kh'),
        parseCard('Kd'),
        parseCard('Kc'),
        parseCard('Ks'),
        parseCard('Ah'),
      ]);
      const handQueenKicker = evaluateHand([
        parseCard('Kh'),
        parseCard('Kd'),
        parseCard('Kc'),
        parseCard('Ks'),
        parseCard('Qh'),
      ]);

      expect(compareHands(handAceKicker, handQueenKicker)).toBe(
        ComparisonResult.Win
      );
    });

    it('should tie when both have identical flushes', () => {
      const hand1 = evaluateHand([
        parseCard('Ah'),
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('Jh'),
        parseCard('9h'),
      ]);
      const hand2 = evaluateHand([
        parseCard('As'),
        parseCard('Ks'),
        parseCard('Qs'),
        parseCard('Js'),
        parseCard('9s'),
      ]);

      expect(compareHands(hand1, hand2)).toBe(ComparisonResult.Tie);
    });

    it('should differentiate flushes by highest card', () => {
      const handAceHigh = evaluateHand([
        parseCard('Ah'),
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('Jh'),
        parseCard('9h'),
      ]);
      const handKingHigh = evaluateHand([
        parseCard('Ks'),
        parseCard('Qs'),
        parseCard('Js'),
        parseCard('Ts'),
        parseCard('8s'),
      ]);

      expect(compareHands(handAceHigh, handKingHigh)).toBe(
        ComparisonResult.Win
      );
    });

    it('should differentiate flushes by kickers', () => {
      const hand1 = evaluateHand([
        parseCard('Ah'),
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('Jh'),
        parseCard('9h'),
      ]);
      const hand2 = evaluateHand([
        parseCard('As'),
        parseCard('Ks'),
        parseCard('Qs'),
        parseCard('Js'),
        parseCard('8s'),
      ]);

      expect(compareHands(hand1, hand2)).toBe(ComparisonResult.Win);
    });

    it('should tie on identical straights', () => {
      const hand1 = evaluateHand([
        parseCard('9h'),
        parseCard('8s'),
        parseCard('7d'),
        parseCard('6c'),
        parseCard('5h'),
      ]);
      const hand2 = evaluateHand([
        parseCard('9d'),
        parseCard('8c'),
        parseCard('7h'),
        parseCard('6s'),
        parseCard('5d'),
      ]);

      expect(compareHands(hand1, hand2)).toBe(ComparisonResult.Tie);
    });

    it('should tie when both have identical two pair and kicker', () => {
      const hand1 = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Kd'),
        parseCard('Kc'),
        parseCard('Qh'),
      ]);
      const hand2 = evaluateHand([
        parseCard('Ad'),
        parseCard('Ac'),
        parseCard('Kh'),
        parseCard('Ks'),
        parseCard('Qs'),
      ]);

      expect(compareHands(hand1, hand2)).toBe(ComparisonResult.Tie);
    });

    it('should differentiate two pair by second pair', () => {
      const acesKings = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Kd'),
        parseCard('Kc'),
        parseCard('2h'),
      ]);
      const acesQueens = evaluateHand([
        parseCard('Ad'),
        parseCard('Ac'),
        parseCard('Qh'),
        parseCard('Qs'),
        parseCard('2s'),
      ]);

      expect(compareHands(acesKings, acesQueens)).toBe(ComparisonResult.Win);
    });

    it('should differentiate two pair by kicker', () => {
      const kingKicker = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Qd'),
        parseCard('Qc'),
        parseCard('Kh'),
      ]);
      const jackKicker = evaluateHand([
        parseCard('Ad'),
        parseCard('Ac'),
        parseCard('Qh'),
        parseCard('Qs'),
        parseCard('Js'),
      ]);

      expect(compareHands(kingKicker, jackKicker)).toBe(ComparisonResult.Win);
    });

    it('should tie on identical pairs with same kickers', () => {
      const hand1 = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Kd'),
        parseCard('Qc'),
        parseCard('Jh'),
      ]);
      const hand2 = evaluateHand([
        parseCard('Ad'),
        parseCard('Ac'),
        parseCard('Kh'),
        parseCard('Qs'),
        parseCard('Jd'),
      ]);

      expect(compareHands(hand1, hand2)).toBe(ComparisonResult.Tie);
    });

    it('should differentiate pairs by third kicker', () => {
      const hand1 = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Kd'),
        parseCard('Qc'),
        parseCard('Jh'),
      ]);
      const hand2 = evaluateHand([
        parseCard('Ad'),
        parseCard('Ac'),
        parseCard('Kh'),
        parseCard('Qs'),
        parseCard('Td'),
      ]);

      expect(compareHands(hand1, hand2)).toBe(ComparisonResult.Win);
    });
  });

  describe('Multiple Winners and Split Pots', () => {
    it('should handle 2-way split with identical hands', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('As'), parseCard('Kh')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('Ad'), parseCard('Kc')] as [number, number],
        },
      ];
      const board = [
        parseCard('Qh'),
        parseCard('Jd'),
        parseCard('Ts'),
        parseCard('9c'),
        parseCard('2h'),
      ];

      const result = determineWinners(players, board);

      expect(result.winners).toHaveLength(2);
      expect(result.isSplitPot).toBe(true);
      expect(result.winningHand.category).toBe(HandCategory.Straight);
    });

    it('should handle 3-way split with board play', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('2s'), parseCard('3c')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('4d'), parseCard('5h')] as [number, number],
        },
        {
          playerId: 'p3',
          holeCards: [parseCard('6s'), parseCard('7c')] as [number, number],
        },
      ];
      const board = [
        parseCard('Ah'),
        parseCard('Ah'),
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('Jh'),
      ];

      const result = determineWinners(players, board);

      expect(result.winners).toHaveLength(3);
      expect(result.isSplitPot).toBe(true);
    });

    it('should handle 4-way split when all play the board', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('2c'), parseCard('3d')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('4s'), parseCard('5h')] as [number, number],
        },
        {
          playerId: 'p3',
          holeCards: [parseCard('6c'), parseCard('7d')] as [number, number],
        },
        {
          playerId: 'p4',
          holeCards: [parseCard('8s'), parseCard('9h')] as [number, number],
        },
      ];
      const board = [
        parseCard('As'),
        parseCard('Ad'),
        parseCard('Ac'),
        parseCard('Ah'),
        parseCard('Kd'),
      ];

      const result = determineWinners(players, board);

      expect(result.winners).toHaveLength(4);
      expect(result.isSplitPot).toBe(true);
      expect(result.winningHand.category).toBe(HandCategory.FourOfAKind);
    });

    it('should split pot between players with same flush', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('2h'), parseCard('3h')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('4h'), parseCard('6h')] as [number, number],
        },
      ];
      const board = [
        parseCard('Ah'),
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('7h'),
        parseCard('9h'),
      ];

      const result = determineWinners(players, board);

      expect(result.winners).toHaveLength(2);
      expect(result.isSplitPot).toBe(true);
      expect(result.winningHand.category).toBe(HandCategory.Flush);
    });

    it('should differentiate winners when one has better kicker', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('Ah'), parseCard('2s')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('Kd'), parseCard('3c')] as [number, number],
        },
        {
          playerId: 'p3',
          holeCards: [parseCard('Qh'), parseCard('4s')] as [number, number],
        },
      ];
      const board = [
        parseCard('Js'),
        parseCard('Jd'),
        parseCard('7c'),
        parseCard('8h'),
        parseCard('9s'),
      ];

      const result = determineWinners(players, board);

      expect(result.winners).toEqual(['p1']); // Ace kicker wins
      expect(result.isSplitPot).toBe(false);
      expect(result.winningHand.category).toBe(HandCategory.Pair);
    });

    it('should handle split pot with identical two pair', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('2s'), parseCard('3c')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('4d'), parseCard('5h')] as [number, number],
        },
      ];
      const board = [
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Kd'),
        parseCard('Kc'),
        parseCard('Qh'),
      ];

      const result = determineWinners(players, board);

      expect(result.winners).toHaveLength(2);
      expect(result.isSplitPot).toBe(true);
      expect(result.winningHand.category).toBe(HandCategory.TwoPair);
    });

    it('should handle 5-way all different hands', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('As'), parseCard('Ah')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('Ks'), parseCard('Kh')] as [number, number],
        },
        {
          playerId: 'p3',
          holeCards: [parseCard('Qs'), parseCard('Qh')] as [number, number],
        },
        {
          playerId: 'p4',
          holeCards: [parseCard('Js'), parseCard('Jh')] as [number, number],
        },
        {
          playerId: 'p5',
          holeCards: [parseCard('Ts'), parseCard('9h')] as [number, number],
        },
      ];
      const board = [
        parseCard('2c'),
        parseCard('3d'),
        parseCard('4h'),
        parseCard('5s'),
        parseCard('7c'),
      ];

      const result = determineWinners(players, board);

      expect(result.winners).toEqual(['p1']); // Aces win
      expect(result.isSplitPot).toBe(false);
    });

    it('should handle split pot with wheel straight', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('Ah'), parseCard('2s')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('Ad'), parseCard('2c')] as [number, number],
        },
      ];
      const board = [
        parseCard('3h'),
        parseCard('4d'),
        parseCard('5s'),
        parseCard('Kc'),
        parseCard('Qh'),
      ];

      const result = determineWinners(players, board);

      expect(result.winners).toHaveLength(2);
      expect(result.isSplitPot).toBe(true);
      expect(result.winningHand.category).toBe(HandCategory.Straight);
      expect(result.winningHand.primaryRanks).toEqual([3]); // 5-high wheel
    });
  });

  describe('Counterfeiting Scenarios', () => {
    it('should handle counterfeited two pair', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('9h'), parseCard('8s')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('2h'), parseCard('3s')] as [number, number],
        },
      ];
      const board = [
        parseCard('Ad'),
        parseCard('As'),
        parseCard('Kd'),
        parseCard('Kh'),
        parseCard('Qh'),
      ];

      const result = determineWinners(players, board);

      // Both play the board (Aces and Kings with Queen kicker) - split pot
      expect(result.winners).toHaveLength(2);
      expect(result.isSplitPot).toBe(true);
      expect(result.winningHand.category).toBe(HandCategory.TwoPair);
    });

    it('should handle counterfeited straight', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('6h'), parseCard('5s')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('2c'), parseCard('3d')] as [number, number],
        },
      ];
      const board = [
        parseCard('9h'),
        parseCard('8s'),
        parseCard('7d'),
        parseCard('6c'),
        parseCard('5h'),
      ];

      const result = determineWinners(players, board);

      // Both play board straight 9-high
      expect(result.winners).toHaveLength(2);
      expect(result.isSplitPot).toBe(true);
      expect(result.winningHand.category).toBe(HandCategory.Straight);
      expect(result.winningHand.primaryRanks).toEqual([7]); // 9-high
    });
  });
});
