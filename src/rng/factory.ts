/**
 * Factory functions for creating RNG instances
 */

import { Rng } from './interface.js';
import { SeededRng } from './seeded-rng.js';
import { CryptoRng } from './crypto-rng.js';
import { TableConfig } from '../core/table.js';

/**
 * Creates an RNG instance from a TableConfig
 *
 * If the config specifies an rngSeed, returns a SeededRng for deterministic behavior.
 * Otherwise, returns a CryptoRng for secure random number generation.
 *
 * @param config - The table configuration
 * @returns An RNG instance appropriate for the configuration
 */
export function createRngFromConfig(config: TableConfig): Rng {
  if (config.rngSeed !== undefined) {
    return new SeededRng(config.rngSeed);
  }
  return new CryptoRng();
}

/**
 * Creates a seeded RNG with the specified seed
 *
 * @param seed - The seed value for deterministic random number generation
 * @returns A seeded RNG instance
 */
export function createSeededRng(seed: number): Rng {
  return new SeededRng(seed);
}

/**
 * Creates a cryptographically secure RNG
 *
 * @returns A crypto RNG instance
 */
export function createCryptoRng(): Rng {
  return new CryptoRng();
}
