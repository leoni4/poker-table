import { describe, it, expect } from 'vitest';
import {
  evaluateHand,
  compareHands,
  determineWinners,
  HandCategory,
  ComparisonResult,
} from '../../src/hand-eval';
import { parseCard } from '../../src/core/card';

describe('Hand Evaluator', () => {
  describe('evaluateHand', () => {
    it('should throw error for less than 5 cards', () => {
      const cards = [
        parseCard('Ah'),
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('Jh'),
      ];
      expect(() => evaluateHand(cards)).toThrow(
        'Hand evaluation requires 5 to 7 cards'
      );
    });

    it('should throw error for more than 7 cards', () => {
      const cards = [
        parseCard('Ah'),
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('Jh'),
        parseCard('Th'),
        parseCard('9h'),
        parseCard('8h'),
        parseCard('7h'),
      ];
      expect(() => evaluateHand(cards)).toThrow(
        'Hand evaluation requires 5 to 7 cards'
      );
    });

    describe('Straight Flush', () => {
      it('should identify a royal flush', () => {
        const cards = [
          parseCard('Ah'),
          parseCard('Kh'),
          parseCard('Qh'),
          parseCard('Jh'),
          parseCard('Th'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.StraightFlush);
        expect(result.primaryRanks).toEqual([12]); // Ace high
      });

      it('should identify a straight flush (not royal)', () => {
        const cards = [
          parseCard('9s'),
          parseCard('8s'),
          parseCard('7s'),
          parseCard('6s'),
          parseCard('5s'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.StraightFlush);
        expect(result.primaryRanks).toEqual([7]); // 9 high
      });

      it('should identify a wheel straight flush (A-2-3-4-5)', () => {
        const cards = [
          parseCard('Ad'),
          parseCard('2d'),
          parseCard('3d'),
          parseCard('4d'),
          parseCard('5d'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.StraightFlush);
        expect(result.primaryRanks).toEqual([3]); // 5 high for wheel
      });

      it('should pick best straight flush from 7 cards', () => {
        const cards = [
          parseCard('9h'),
          parseCard('8h'),
          parseCard('7h'),
          parseCard('6h'),
          parseCard('5h'),
          parseCard('4h'),
          parseCard('3h'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.StraightFlush);
        expect(result.primaryRanks).toEqual([7]); // 9-high is best
      });
    });

    describe('Four of a Kind', () => {
      it('should identify four of a kind', () => {
        const cards = [
          parseCard('Ks'),
          parseCard('Kh'),
          parseCard('Kd'),
          parseCard('Kc'),
          parseCard('Ah'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.FourOfAKind);
        expect(result.primaryRanks).toEqual([11]); // Kings
        expect(result.kickers).toEqual([12]); // Ace kicker
      });

      it('should pick best kicker for four of a kind', () => {
        const cards = [
          parseCard('7s'),
          parseCard('7h'),
          parseCard('7d'),
          parseCard('7c'),
          parseCard('Qh'),
          parseCard('3d'),
          parseCard('2c'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.FourOfAKind);
        expect(result.primaryRanks).toEqual([5]); // Sevens
        expect(result.kickers).toEqual([10]); // Queen kicker (best)
      });
    });

    describe('Full House', () => {
      it('should identify a full house', () => {
        const cards = [
          parseCard('Ah'),
          parseCard('Ad'),
          parseCard('Ac'),
          parseCard('Ks'),
          parseCard('Kh'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.FullHouse);
        expect(result.primaryRanks).toEqual([12, 11]); // Aces full of Kings
      });

      it('should pick best full house from 7 cards', () => {
        const cards = [
          parseCard('Ah'),
          parseCard('Ad'),
          parseCard('Ac'),
          parseCard('Ks'),
          parseCard('Kh'),
          parseCard('Qd'),
          parseCard('Qc'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.FullHouse);
        expect(result.primaryRanks).toEqual([12, 11]); // Aces full of Kings (not Queens)
      });

      it('should pick best trip for full house', () => {
        const cards = [
          parseCard('9h'),
          parseCard('9d'),
          parseCard('9c'),
          parseCard('8s'),
          parseCard('8h'),
          parseCard('8d'),
          parseCard('7c'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.FullHouse);
        expect(result.primaryRanks).toEqual([7, 6]); // Nines full of Eights
      });
    });

    describe('Flush', () => {
      it('should identify a flush', () => {
        const cards = [
          parseCard('Ah'),
          parseCard('Kh'),
          parseCard('Jh'),
          parseCard('9h'),
          parseCard('7h'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.Flush);
        expect(result.kickers).toEqual([12, 11, 9, 7, 5]); // A-K-J-9-7
      });

      it('should pick best 5 cards for flush from 7 cards', () => {
        const cards = [
          parseCard('As'),
          parseCard('Ks'),
          parseCard('Qs'),
          parseCard('Js'),
          parseCard('9s'),
          parseCard('7s'),
          parseCard('2s'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.Flush);
        expect(result.kickers).toEqual([12, 11, 10, 9, 7]); // Best 5
      });
    });

    describe('Straight', () => {
      it('should identify a straight', () => {
        const cards = [
          parseCard('9h'),
          parseCard('8s'),
          parseCard('7d'),
          parseCard('6c'),
          parseCard('5h'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.Straight);
        expect(result.primaryRanks).toEqual([7]); // 9-high
      });

      it('should identify a wheel (A-2-3-4-5)', () => {
        const cards = [
          parseCard('Ah'),
          parseCard('2s'),
          parseCard('3d'),
          parseCard('4c'),
          parseCard('5h'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.Straight);
        expect(result.primaryRanks).toEqual([3]); // 5-high for wheel
      });

      it('should identify an ace-high straight', () => {
        const cards = [
          parseCard('Ah'),
          parseCard('Ks'),
          parseCard('Qd'),
          parseCard('Jc'),
          parseCard('Th'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.Straight);
        expect(result.primaryRanks).toEqual([12]); // Ace-high
      });

      it('should pick best straight from 7 cards', () => {
        const cards = [
          parseCard('9h'),
          parseCard('8s'),
          parseCard('7d'),
          parseCard('6c'),
          parseCard('5h'),
          parseCard('4s'),
          parseCard('3d'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.Straight);
        expect(result.primaryRanks).toEqual([7]); // 9-high is best
      });
    });

    describe('Three of a Kind', () => {
      it('should identify three of a kind', () => {
        const cards = [
          parseCard('Qh'),
          parseCard('Qs'),
          parseCard('Qd'),
          parseCard('Ah'),
          parseCard('Kc'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.ThreeOfAKind);
        expect(result.primaryRanks).toEqual([10]); // Queens
        expect(result.kickers).toEqual([12, 11]); // A-K kickers
      });

      it('should pick best kickers for three of a kind', () => {
        const cards = [
          parseCard('5h'),
          parseCard('5s'),
          parseCard('5d'),
          parseCard('Ah'),
          parseCard('Kc'),
          parseCard('Qd'),
          parseCard('2h'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.ThreeOfAKind);
        expect(result.primaryRanks).toEqual([3]); // Fives
        expect(result.kickers).toEqual([12, 11]); // A-K (best 2)
      });
    });

    describe('Two Pair', () => {
      it('should identify two pair', () => {
        const cards = [
          parseCard('Ah'),
          parseCard('As'),
          parseCard('Kd'),
          parseCard('Kc'),
          parseCard('Qh'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.TwoPair);
        expect(result.primaryRanks).toEqual([12, 11]); // Aces and Kings
        expect(result.kickers).toEqual([10]); // Queen
      });

      it('should pick best two pairs from 7 cards', () => {
        const cards = [
          parseCard('Ah'),
          parseCard('As'),
          parseCard('Kd'),
          parseCard('Kc'),
          parseCard('Qh'),
          parseCard('Qs'),
          parseCard('2d'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.TwoPair);
        expect(result.primaryRanks).toEqual([12, 11]); // Aces and Kings (not Queens)
        expect(result.kickers).toEqual([10]); // Queen
      });

      it('should pick best kicker for two pair', () => {
        const cards = [
          parseCard('Jh'),
          parseCard('Js'),
          parseCard('9d'),
          parseCard('9c'),
          parseCard('Ah'),
          parseCard('3s'),
          parseCard('2d'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.TwoPair);
        expect(result.primaryRanks).toEqual([9, 7]); // Jacks and Nines
        expect(result.kickers).toEqual([12]); // Ace kicker
      });
    });

    describe('Pair', () => {
      it('should identify a pair', () => {
        const cards = [
          parseCard('Ah'),
          parseCard('As'),
          parseCard('Kd'),
          parseCard('Qc'),
          parseCard('Jh'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.Pair);
        expect(result.primaryRanks).toEqual([12]); // Aces
        expect(result.kickers).toEqual([11, 10, 9]); // K-Q-J
      });

      it('should pick best kickers for pair', () => {
        const cards = [
          parseCard('3h'),
          parseCard('3s'),
          parseCard('Ad'),
          parseCard('Kc'),
          parseCard('Qh'),
          parseCard('Js'),
          parseCard('2d'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.Pair);
        expect(result.primaryRanks).toEqual([1]); // Threes
        expect(result.kickers).toEqual([12, 11, 10]); // A-K-Q (best 3)
      });
    });

    describe('High Card', () => {
      it('should identify high card', () => {
        const cards = [
          parseCard('Ah'),
          parseCard('Ks'),
          parseCard('Qd'),
          parseCard('Jc'),
          parseCard('9h'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.HighCard);
        expect(result.kickers).toEqual([12, 11, 10, 9, 7]); // A-K-Q-J-9
      });

      it('should pick best 5 cards for high card from 7 cards', () => {
        const cards = [
          parseCard('Ah'),
          parseCard('Ks'),
          parseCard('Qd'),
          parseCard('Jc'),
          parseCard('9h'),
          parseCard('7s'),
          parseCard('2d'),
        ];
        const result = evaluateHand(cards);
        expect(result.category).toBe(HandCategory.HighCard);
        expect(result.kickers).toEqual([12, 11, 10, 9, 7]); // Best 5
      });
    });
  });

  describe('compareHands', () => {
    it('should return Win when first hand has better category', () => {
      const flush = evaluateHand([
        parseCard('Ah'),
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('Jh'),
        parseCard('9h'),
      ]);
      const straight = evaluateHand([
        parseCard('9s'),
        parseCard('8d'),
        parseCard('7c'),
        parseCard('6h'),
        parseCard('5s'),
      ]);
      expect(compareHands(flush, straight)).toBe(ComparisonResult.Win);
    });

    it('should return Loss when second hand has better category', () => {
      const pair = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Kd'),
        parseCard('Qc'),
        parseCard('Jh'),
      ]);
      const trips = evaluateHand([
        parseCard('5h'),
        parseCard('5s'),
        parseCard('5d'),
        parseCard('2c'),
        parseCard('3h'),
      ]);
      expect(compareHands(pair, trips)).toBe(ComparisonResult.Loss);
    });

    it('should compare by primary ranks when categories equal', () => {
      const acesPair = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Kd'),
        parseCard('Qc'),
        parseCard('Jh'),
      ]);
      const kingsPair = evaluateHand([
        parseCard('Kh'),
        parseCard('Ks'),
        parseCard('Ad'),
        parseCard('Qc'),
        parseCard('Jh'),
      ]);
      expect(compareHands(acesPair, kingsPair)).toBe(ComparisonResult.Win);
    });

    it('should compare by kickers when primary ranks equal', () => {
      const aceKingHigh = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Kd'),
        parseCard('Qc'),
        parseCard('Jh'),
      ]);
      const aceQueenHigh = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Qd'),
        parseCard('Jc'),
        parseCard('Th'),
      ]);
      expect(compareHands(aceKingHigh, aceQueenHigh)).toBe(
        ComparisonResult.Win
      );
    });

    it('should return Tie when hands are identical', () => {
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

    it('should compare two pair correctly', () => {
      const acesAndKings = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Kd'),
        parseCard('Kc'),
        parseCard('Qh'),
      ]);
      const acesAndQueens = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Qd'),
        parseCard('Qc'),
        parseCard('Kh'),
      ]);
      expect(compareHands(acesAndKings, acesAndQueens)).toBe(
        ComparisonResult.Win
      );
    });

    it('should compare full houses correctly', () => {
      const acesFull = evaluateHand([
        parseCard('Ah'),
        parseCard('As'),
        parseCard('Ad'),
        parseCard('Kc'),
        parseCard('Kh'),
      ]);
      const kingsFull = evaluateHand([
        parseCard('Kh'),
        parseCard('Ks'),
        parseCard('Kd'),
        parseCard('Ac'),
        parseCard('Ah'),
      ]);
      expect(compareHands(acesFull, kingsFull)).toBe(ComparisonResult.Win);
    });

    it('should compare straights correctly', () => {
      const nineStraight = evaluateHand([
        parseCard('9h'),
        parseCard('8s'),
        parseCard('7d'),
        parseCard('6c'),
        parseCard('5h'),
      ]);
      const eightStraight = evaluateHand([
        parseCard('8h'),
        parseCard('7s'),
        parseCard('6d'),
        parseCard('5c'),
        parseCard('4h'),
      ]);
      expect(compareHands(nineStraight, eightStraight)).toBe(
        ComparisonResult.Win
      );
    });

    it('should compare wheel vs higher straight', () => {
      const wheel = evaluateHand([
        parseCard('Ah'),
        parseCard('2s'),
        parseCard('3d'),
        parseCard('4c'),
        parseCard('5h'),
      ]);
      const sixStraight = evaluateHand([
        parseCard('6h'),
        parseCard('5s'),
        parseCard('4d'),
        parseCard('3c'),
        parseCard('2h'),
      ]);
      expect(compareHands(wheel, sixStraight)).toBe(ComparisonResult.Loss);
    });
  });

  describe('determineWinners', () => {
    it('should throw error with no players', () => {
      const board = [parseCard('Ah'), parseCard('Kh'), parseCard('Qh')];
      expect(() => determineWinners([], board)).toThrow(
        'At least one player is required'
      );
    });

    it('should throw error with invalid board', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('As'), parseCard('Ks')] as [number, number],
        },
      ];
      const board = [parseCard('Ah'), parseCard('Kh')];
      expect(() => determineWinners(players, board)).toThrow(
        'Board must contain 3-5 cards'
      );
    });

    it('should determine single winner', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('As'), parseCard('Ah')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('Ks'), parseCard('Kh')] as [number, number],
        },
      ];
      const board = [
        parseCard('Ad'),
        parseCard('7c'),
        parseCard('8d'),
        parseCard('9h'),
        parseCard('Jc'),
      ];

      const result = determineWinners(players, board);
      expect(result.winners).toEqual(['p1']);
      expect(result.isSplitPot).toBe(false);
      expect(result.winningHand.category).toBe(HandCategory.ThreeOfAKind);
    });

    it('should determine split pot with identical hands', () => {
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
        parseCard('2c'),
        parseCard('3h'),
      ];

      const result = determineWinners(players, board);
      expect(result.winners).toHaveLength(2);
      expect(result.winners).toContain('p1');
      expect(result.winners).toContain('p2');
      expect(result.isSplitPot).toBe(true);
    });

    it('should determine split pot with board play', () => {
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
        parseCard('Kh'),
        parseCard('Qh'),
        parseCard('Jh'),
        parseCard('Th'),
      ];

      const result = determineWinners(players, board);
      expect(result.winners).toHaveLength(3);
      expect(result.isSplitPot).toBe(true);
      expect(result.winningHand.category).toBe(HandCategory.StraightFlush);
    });

    it('should determine winner with flop only', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('Ah'), parseCard('Ad')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('Kh'), parseCard('Kd')] as [number, number],
        },
      ];
      const board = [parseCard('As'), parseCard('2c'), parseCard('3d')];

      const result = determineWinners(players, board);
      expect(result.winners).toEqual(['p1']);
      expect(result.winningHand.category).toBe(HandCategory.ThreeOfAKind);
    });

    it('should determine winner with turn', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('9h'), parseCard('8h')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('Ah'), parseCard('Kd')] as [number, number],
        },
      ];
      const board = [
        parseCard('7h'),
        parseCard('6h'),
        parseCard('5h'),
        parseCard('2c'),
      ];

      const result = determineWinners(players, board);
      expect(result.winners).toEqual(['p1']);
      expect(result.winningHand.category).toBe(HandCategory.StraightFlush);
    });

    it('should handle multiple players with various hands', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('Ah'), parseCard('Ad')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('Kh'), parseCard('Kd')] as [number, number],
        },
        {
          playerId: 'p3',
          holeCards: [parseCard('Qh'), parseCard('Qd')] as [number, number],
        },
        {
          playerId: 'p4',
          holeCards: [parseCard('2h'), parseCard('3d')] as [number, number],
        },
      ];
      const board = [
        parseCard('Ac'),
        parseCard('Ks'),
        parseCard('7c'),
        parseCard('8h'),
        parseCard('9d'),
      ];

      const result = determineWinners(players, board);
      expect(result.winners).toEqual(['p1']);
      expect(result.winningHand.category).toBe(HandCategory.ThreeOfAKind);
    });

    it('should determine winner with kicker', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('Ah'), parseCard('Qd')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('As'), parseCard('Jc')] as [number, number],
        },
      ];
      const board = [
        parseCard('Ad'),
        parseCard('5c'),
        parseCard('6d'),
        parseCard('7h'),
        parseCard('8s'),
      ];

      const result = determineWinners(players, board);
      expect(result.winners).toEqual(['p1']);
      expect(result.winningHand.category).toBe(HandCategory.Pair);
      expect(result.winningHand.primaryRanks).toEqual([12]); // Aces
      expect(result.isSplitPot).toBe(false);
    });

    it('should split pot when kickers are also equal', () => {
      const players = [
        {
          playerId: 'p1',
          holeCards: [parseCard('Ah'), parseCard('2d')] as [number, number],
        },
        {
          playerId: 'p2',
          holeCards: [parseCard('As'), parseCard('3c')] as [number, number],
        },
      ];
      const board = [
        parseCard('Ad'),
        parseCard('Kc'),
        parseCard('Qd'),
        parseCard('Jh'),
        parseCard('Ts'),
      ];

      const result = determineWinners(players, board);
      expect(result.winners).toHaveLength(2);
      expect(result.winners).toContain('p1');
      expect(result.winners).toContain('p2');
      expect(result.isSplitPot).toBe(true);
    });

    it('should determine winner in three-way all-in', () => {
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
      ];
      const board = [
        parseCard('2c'),
        parseCard('7d'),
        parseCard('9h'),
        parseCard('Jc'),
        parseCard('3s'),
      ];

      const result = determineWinners(players, board);
      expect(result.winners).toEqual(['p1']);
      expect(result.winningHand.category).toBe(HandCategory.Pair);
      expect(result.winningHand.primaryRanks).toEqual([12]); // Aces
    });
  });
});
