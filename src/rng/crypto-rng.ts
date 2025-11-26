/**
 * Cryptographically secure random number generator
 * Uses Node.js crypto module for production-grade randomness
 */

import { randomInt } from 'node:crypto';
import { Rng } from './interface.js';

/**
 * Cryptographically secure random number generator
 * Uses Node.js crypto.randomInt for high-quality randomness
 * Not deterministic - suitable for production use
 */
export class CryptoRng implements Rng {
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
    return randomInt(maxExclusive);
  }
}
