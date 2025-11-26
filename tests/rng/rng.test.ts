/**
 * Unit tests for RNG module
 */

import { describe, it, expect } from 'vitest';
import {
  Rng,
  SeededRng,
  CryptoRng,
  createRngFromConfig,
  createSeededRng,
  createCryptoRng,
} from '../../src/rng/index.js';
import { createDefaultTableConfig } from '../../src/core/table.js';

describe('SeededRng', () => {
  describe('deterministic behavior', () => {
    it('should produce the same sequence with the same seed', () => {
      const rng1 = new SeededRng(12345);
      const rng2 = new SeededRng(12345);

      const sequence1 = Array.from({ length: 10 }, () => rng1.nextInt(100));
      const sequence2 = Array.from({ length: 10 }, () => rng2.nextInt(100));

      expect(sequence1).toEqual(sequence2);
    });

    it('should produce different sequences with different seeds', () => {
      const rng1 = new SeededRng(12345);
      const rng2 = new SeededRng(54321);

      const sequence1 = Array.from({ length: 10 }, () => rng1.nextInt(100));
      const sequence2 = Array.from({ length: 10 }, () => rng2.nextInt(100));

      expect(sequence1).not.toEqual(sequence2);
    });

    it('should be reproducible across multiple runs', () => {
      const seed = 42;
      const results: number[][] = [];

      for (let run = 0; run < 3; run++) {
        const rng = new SeededRng(seed);
        results.push(Array.from({ length: 20 }, () => rng.nextInt(52)));
      }

      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
    });
  });

  describe('nextInt - range validation', () => {
    it('should generate values within [0, maxExclusive)', () => {
      const rng = new SeededRng(42);
      const maxExclusive = 10;
      const samples = 1000;

      for (let i = 0; i < samples; i++) {
        const value = rng.nextInt(maxExclusive);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(maxExclusive);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('should work with maxExclusive = 1', () => {
      const rng = new SeededRng(42);
      for (let i = 0; i < 100; i++) {
        expect(rng.nextInt(1)).toBe(0);
      }
    });

    it('should work with large maxExclusive values', () => {
      const rng = new SeededRng(42);
      const maxExclusive = 1000000;

      for (let i = 0; i < 100; i++) {
        const value = rng.nextInt(maxExclusive);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(maxExclusive);
      }
    });

    it('should throw error when maxExclusive <= 0', () => {
      const rng = new SeededRng(42);
      expect(() => rng.nextInt(0)).toThrow(
        'maxExclusive must be greater than 0'
      );
      expect(() => rng.nextInt(-1)).toThrow(
        'maxExclusive must be greater than 0'
      );
    });

    it('should throw error when maxExclusive is not an integer', () => {
      const rng = new SeededRng(42);
      expect(() => rng.nextInt(10.5)).toThrow(
        'maxExclusive must be an integer'
      );
      expect(() => rng.nextInt(3.14)).toThrow(
        'maxExclusive must be an integer'
      );
    });
  });

  describe('distribution sanity check', () => {
    it('should have roughly uniform distribution', () => {
      const rng = new SeededRng(12345);
      const buckets = 10;
      const samples = 10000;
      const counts = new Array(buckets).fill(0);

      for (let i = 0; i < samples; i++) {
        const value = rng.nextInt(buckets);
        counts[value]++;
      }

      // Expected count per bucket
      const expected = samples / buckets;

      // Allow 20% deviation from expected (this is a loose check)
      const tolerance = expected * 0.2;

      for (let i = 0; i < buckets; i++) {
        expect(counts[i]).toBeGreaterThan(expected - tolerance);
        expect(counts[i]).toBeLessThan(expected + tolerance);
      }
    });

    it('should use all possible values in range', () => {
      const rng = new SeededRng(999);
      const maxExclusive = 20;
      const seen = new Set<number>();
      const maxAttempts = 10000;

      for (let i = 0; i < maxAttempts && seen.size < maxExclusive; i++) {
        seen.add(rng.nextInt(maxExclusive));
      }

      // Should see all values (or most of them) in reasonable number of attempts
      expect(seen.size).toBeGreaterThan(maxExclusive * 0.9);
    });
  });

  describe('seed handling', () => {
    it('should handle seed = 0', () => {
      const rng = new SeededRng(0);
      expect(() => rng.nextInt(10)).not.toThrow();
      const value = rng.nextInt(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    });

    it('should handle large seed values', () => {
      const rng = new SeededRng(2147483647);
      expect(() => rng.nextInt(10)).not.toThrow();
    });

    it('should handle negative seed values', () => {
      const rng = new SeededRng(-12345);
      expect(() => rng.nextInt(10)).not.toThrow();
      const value = rng.nextInt(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    });
  });
});

describe('CryptoRng', () => {
  describe('nextInt - basic functionality', () => {
    it('should generate values within [0, maxExclusive)', () => {
      const rng = new CryptoRng();
      const maxExclusive = 10;
      const samples = 100;

      for (let i = 0; i < samples; i++) {
        const value = rng.nextInt(maxExclusive);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(maxExclusive);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('should work with maxExclusive = 1', () => {
      const rng = new CryptoRng();
      for (let i = 0; i < 10; i++) {
        expect(rng.nextInt(1)).toBe(0);
      }
    });

    it('should throw error when maxExclusive <= 0', () => {
      const rng = new CryptoRng();
      expect(() => rng.nextInt(0)).toThrow(
        'maxExclusive must be greater than 0'
      );
      expect(() => rng.nextInt(-1)).toThrow(
        'maxExclusive must be greater than 0'
      );
    });

    it('should throw error when maxExclusive is not an integer', () => {
      const rng = new CryptoRng();
      expect(() => rng.nextInt(10.5)).toThrow(
        'maxExclusive must be an integer'
      );
    });
  });

  describe('randomness', () => {
    it('should produce different sequences across instances', () => {
      const rng1 = new CryptoRng();
      const rng2 = new CryptoRng();

      const sequence1 = Array.from({ length: 10 }, () => rng1.nextInt(100));
      const sequence2 = Array.from({ length: 10 }, () => rng2.nextInt(100));

      // With high probability, at least one value should be different
      expect(sequence1).not.toEqual(sequence2);
    });
  });
});

describe('Factory functions', () => {
  describe('createRngFromConfig', () => {
    it('should create SeededRng when rngSeed is provided', () => {
      const config = createDefaultTableConfig();
      config.rngSeed = 42;

      const rng = createRngFromConfig(config);
      expect(rng).toBeInstanceOf(SeededRng);
    });

    it('should create CryptoRng when rngSeed is not provided', () => {
      const config = createDefaultTableConfig();

      const rng = createRngFromConfig(config);
      expect(rng).toBeInstanceOf(CryptoRng);
    });

    it('should produce deterministic results with same seed', () => {
      const config1 = createDefaultTableConfig();
      config1.rngSeed = 123;
      const config2 = createDefaultTableConfig();
      config2.rngSeed = 123;

      const rng1 = createRngFromConfig(config1);
      const rng2 = createRngFromConfig(config2);

      const sequence1 = Array.from({ length: 10 }, () => rng1.nextInt(52));
      const sequence2 = Array.from({ length: 10 }, () => rng2.nextInt(52));

      expect(sequence1).toEqual(sequence2);
    });
  });

  describe('createSeededRng', () => {
    it('should create a SeededRng instance', () => {
      const rng = createSeededRng(42);
      expect(rng).toBeInstanceOf(SeededRng);
    });

    it('should create deterministic RNG', () => {
      const rng1 = createSeededRng(999);
      const rng2 = createSeededRng(999);

      const val1 = rng1.nextInt(100);
      const val2 = rng2.nextInt(100);

      expect(val1).toBe(val2);
    });
  });

  describe('createCryptoRng', () => {
    it('should create a CryptoRng instance', () => {
      const rng = createCryptoRng();
      expect(rng).toBeInstanceOf(CryptoRng);
    });

    it('should work correctly', () => {
      const rng = createCryptoRng();
      const value = rng.nextInt(100);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(100);
    });
  });
});

describe('Rng interface compliance', () => {
  const implementations: Array<{ name: string; factory: () => Rng }> = [
    { name: 'SeededRng', factory: () => new SeededRng(42) },
    { name: 'CryptoRng', factory: () => new CryptoRng() },
  ];

  implementations.forEach(({ name, factory }) => {
    describe(`${name} interface compliance`, () => {
      it('should implement nextInt method', () => {
        const rng = factory();
        expect(typeof rng.nextInt).toBe('function');
      });

      it('should return integers from nextInt', () => {
        const rng = factory();
        for (let i = 0; i < 10; i++) {
          const value = rng.nextInt(100);
          expect(Number.isInteger(value)).toBe(true);
        }
      });

      it('should respect maxExclusive parameter', () => {
        const rng = factory();
        const maxExclusive = 5;
        for (let i = 0; i < 20; i++) {
          const value = rng.nextInt(maxExclusive);
          expect(value).toBeLessThan(maxExclusive);
          expect(value).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });
});
