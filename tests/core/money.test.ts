/**
 * Tests for money and chip utilities
 */

import { describe, it, expect } from 'vitest';
import {
  chips,
  addChips,
  subtractChips,
  multiplyChips,
  divideChips,
  compareChips,
  isZero,
  isPositive,
  isNegative,
  minChips,
  maxChips,
  toNumber,
  formatChips,
} from '../../src/core/money.js';

describe('Money utilities', () => {
  describe('chips', () => {
    it('should create ChipAmount from number', () => {
      const amount = chips(100);
      expect(amount).toBe(100n);
    });

    it('should create ChipAmount from bigint', () => {
      const amount = chips(50n);
      expect(amount).toBe(50n);
    });

    it('should handle zero', () => {
      const amount = chips(0);
      expect(amount).toBe(0n);
    });

    it('should handle large numbers', () => {
      const amount = chips(1000000000);
      expect(amount).toBe(1000000000n);
    });
  });

  describe('addChips', () => {
    it('should add two chip amounts', () => {
      const result = addChips(chips(100), chips(50));
      expect(result).toBe(150n);
    });

    it('should handle zero addition', () => {
      const result = addChips(chips(100), chips(0));
      expect(result).toBe(100n);
    });

    it('should add negative amounts', () => {
      const result = addChips(chips(100), chips(-50));
      expect(result).toBe(50n);
    });

    it('should handle large additions', () => {
      const result = addChips(chips(1000000), chips(2000000));
      expect(result).toBe(3000000n);
    });
  });

  describe('subtractChips', () => {
    it('should subtract chip amounts', () => {
      const result = subtractChips(chips(100), chips(30));
      expect(result).toBe(70n);
    });

    it('should handle zero subtraction', () => {
      const result = subtractChips(chips(100), chips(0));
      expect(result).toBe(100n);
    });

    it('should handle negative results', () => {
      const result = subtractChips(chips(50), chips(100));
      expect(result).toBe(-50n);
    });

    it('should handle subtracting negative amounts', () => {
      const result = subtractChips(chips(100), chips(-50));
      expect(result).toBe(150n);
    });
  });

  describe('multiplyChips', () => {
    it('should multiply by number', () => {
      const result = multiplyChips(chips(10), 5);
      expect(result).toBe(50n);
    });

    it('should multiply by bigint', () => {
      const result = multiplyChips(chips(10), 3n);
      expect(result).toBe(30n);
    });

    it('should multiply by zero', () => {
      const result = multiplyChips(chips(100), 0);
      expect(result).toBe(0n);
    });

    it('should multiply by one', () => {
      const result = multiplyChips(chips(100), 1);
      expect(result).toBe(100n);
    });

    it('should multiply by negative factor', () => {
      const result = multiplyChips(chips(50), -2);
      expect(result).toBe(-100n);
    });

    it('should handle large multiplications', () => {
      const result = multiplyChips(chips(1000), 1000);
      expect(result).toBe(1000000n);
    });
  });

  describe('divideChips', () => {
    it('should divide by number', () => {
      const result = divideChips(chips(100), 4);
      expect(result).toBe(25n);
    });

    it('should divide by bigint', () => {
      const result = divideChips(chips(90), 3n);
      expect(result).toBe(30n);
    });

    it('should truncate division result', () => {
      const result = divideChips(chips(100), 3);
      expect(result).toBe(33n);
    });

    it('should handle division by one', () => {
      const result = divideChips(chips(100), 1);
      expect(result).toBe(100n);
    });

    it('should handle negative divisor', () => {
      const result = divideChips(chips(100), -2);
      expect(result).toBe(-50n);
    });

    it('should handle negative dividend', () => {
      const result = divideChips(chips(-100), 4);
      expect(result).toBe(-25n);
    });
  });

  describe('compareChips', () => {
    it('should return 1 when a > b', () => {
      const result = compareChips(chips(100), chips(50));
      expect(result).toBe(1);
    });

    it('should return -1 when a < b', () => {
      const result = compareChips(chips(50), chips(100));
      expect(result).toBe(-1);
    });

    it('should return 0 when a equals b', () => {
      const result = compareChips(chips(100), chips(100));
      expect(result).toBe(0);
    });

    it('should handle zero comparisons', () => {
      expect(compareChips(chips(0), chips(0))).toBe(0);
      expect(compareChips(chips(10), chips(0))).toBe(1);
      expect(compareChips(chips(0), chips(10))).toBe(-1);
    });

    it('should handle negative amounts', () => {
      expect(compareChips(chips(-10), chips(-5))).toBe(-1);
      expect(compareChips(chips(-5), chips(-10))).toBe(1);
      expect(compareChips(chips(-10), chips(5))).toBe(-1);
    });
  });

  describe('isZero', () => {
    it('should return true for zero', () => {
      expect(isZero(chips(0))).toBe(true);
    });

    it('should return false for positive amount', () => {
      expect(isZero(chips(1))).toBe(false);
      expect(isZero(chips(100))).toBe(false);
    });

    it('should return false for negative amount', () => {
      expect(isZero(chips(-1))).toBe(false);
    });
  });

  describe('isPositive', () => {
    it('should return true for positive amounts', () => {
      expect(isPositive(chips(1))).toBe(true);
      expect(isPositive(chips(100))).toBe(true);
      expect(isPositive(chips(1000000))).toBe(true);
    });

    it('should return false for zero', () => {
      expect(isPositive(chips(0))).toBe(false);
    });

    it('should return false for negative amounts', () => {
      expect(isPositive(chips(-1))).toBe(false);
      expect(isPositive(chips(-100))).toBe(false);
    });
  });

  describe('isNegative', () => {
    it('should return true for negative amounts', () => {
      expect(isNegative(chips(-1))).toBe(true);
      expect(isNegative(chips(-100))).toBe(true);
      expect(isNegative(chips(-1000000))).toBe(true);
    });

    it('should return false for zero', () => {
      expect(isNegative(chips(0))).toBe(false);
    });

    it('should return false for positive amounts', () => {
      expect(isNegative(chips(1))).toBe(false);
      expect(isNegative(chips(100))).toBe(false);
    });
  });

  describe('minChips', () => {
    it('should return smaller amount', () => {
      expect(minChips(chips(100), chips(50))).toBe(50n);
      expect(minChips(chips(50), chips(100))).toBe(50n);
    });

    it('should handle equal amounts', () => {
      expect(minChips(chips(100), chips(100))).toBe(100n);
    });

    it('should handle zero', () => {
      expect(minChips(chips(100), chips(0))).toBe(0n);
      expect(minChips(chips(0), chips(100))).toBe(0n);
    });

    it('should handle negative amounts', () => {
      expect(minChips(chips(-50), chips(-100))).toBe(-100n);
      expect(minChips(chips(-50), chips(50))).toBe(-50n);
    });
  });

  describe('maxChips', () => {
    it('should return larger amount', () => {
      expect(maxChips(chips(100), chips(50))).toBe(100n);
      expect(maxChips(chips(50), chips(100))).toBe(100n);
    });

    it('should handle equal amounts', () => {
      expect(maxChips(chips(100), chips(100))).toBe(100n);
    });

    it('should handle zero', () => {
      expect(maxChips(chips(100), chips(0))).toBe(100n);
      expect(maxChips(chips(0), chips(100))).toBe(100n);
    });

    it('should handle negative amounts', () => {
      expect(maxChips(chips(-50), chips(-100))).toBe(-50n);
      expect(maxChips(chips(-50), chips(50))).toBe(50n);
    });
  });

  describe('toNumber', () => {
    it('should convert chip amount to number', () => {
      expect(toNumber(chips(100))).toBe(100);
      expect(toNumber(chips(0))).toBe(0);
      expect(toNumber(chips(1000))).toBe(1000);
    });

    it('should handle negative amounts', () => {
      expect(toNumber(chips(-50))).toBe(-50);
    });

    it('should handle large values', () => {
      expect(toNumber(chips(1000000))).toBe(1000000);
    });
  });

  describe('formatChips', () => {
    it('should format chip amount as string', () => {
      expect(formatChips(chips(100))).toBe('100');
      expect(formatChips(chips(0))).toBe('0');
      expect(formatChips(chips(1000))).toBe('1000');
    });

    it('should handle negative amounts', () => {
      expect(formatChips(chips(-50))).toBe('-50');
    });

    it('should handle large values', () => {
      expect(formatChips(chips(1000000))).toBe('1000000');
    });
  });

  describe('Complex operations', () => {
    it('should handle chained operations', () => {
      let amount = chips(100);
      amount = addChips(amount, chips(50));
      amount = multiplyChips(amount, 2);
      amount = subtractChips(amount, chips(50));
      amount = divideChips(amount, 5);

      expect(amount).toBe(50n);
    });

    it('should maintain precision with bigint', () => {
      const a = chips(1000000000000);
      const b = chips(1);
      const result = addChips(a, b);

      expect(result).toBe(1000000000001n);
    });

    it('should handle pot calculation scenario', () => {
      const player1Bet = chips(100);
      const player2Bet = chips(100);
      const player3Bet = chips(50);

      const pot = addChips(addChips(player1Bet, player2Bet), player3Bet);

      expect(pot).toBe(250n);
      expect(isPositive(pot)).toBe(true);
    });

    it('should handle stack operations', () => {
      let stack = chips(1000);

      // Bet 50
      stack = subtractChips(stack, chips(50));
      expect(stack).toBe(950n);

      // Win pot of 100
      stack = addChips(stack, chips(100));
      expect(stack).toBe(1050n);

      // Check if player has enough for minimum bet
      const minBet = chips(100);
      expect(compareChips(stack, minBet)).toBe(1);
    });
  });
});
