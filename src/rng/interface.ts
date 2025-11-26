/**
 * Random Number Generator abstraction
 */

/**
 * Interface for random number generation
 * Used by the poker engine for shuffling, dealing, and other random operations
 */
export interface Rng {
  /**
   * Generates a random integer in the range [0, maxExclusive)
   * @param maxExclusive - The exclusive upper bound (must be > 0)
   * @returns A random integer between 0 (inclusive) and maxExclusive (exclusive)
   * @throws Error if maxExclusive <= 0
   */
  nextInt(maxExclusive: number): number;
}
