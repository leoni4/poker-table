/**
 * Seeded pseudo-random number generator implementation
 * Uses Mulberry32 algorithm for deterministic, seedable RNG
 */

import { Rng } from './interface.js';

/**
 * Seeded pseudo-random number generator using Mulberry32 algorithm
 * Provides deterministic random numbers based on an initial seed
 */
export class SeededRng implements Rng {
  private state: number;

  /**
   * Creates a new seeded RNG
   * @param seed - The initial seed value (will be converted to 32-bit unsigned integer)
   */
  constructor(seed: number) {
    // Ensure seed is a 32-bit unsigned integer
    this.state = seed >>> 0;
  }

  /**
   * Generates the next random number using Mulberry32 algorithm
   * @returns A random number between 0 and 1 (exclusive)
   */
  private next(): number {
    // Mulberry32 algorithm
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a random integer in the range [0, maxExclusive)
   * @param maxExclusive - The exclusive upper bound (must be > 0)
   * @returns A random integer between 0 (inclusive) and maxExclusive (exclusive)
   * @throws Error if maxExclusive <= 0
   */
  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      throw new Error('maxExclusive must be greater than 0');
    }
    if (!Number.isInteger(maxExclusive)) {
      throw new Error('maxExclusive must be an integer');
    }
    return Math.floor(this.next() * maxExclusive);
  }
}
