/**
 * ESM Smoke Test
 * Verifies that the package can be imported and used in a Node.js ESM environment
 * This catches issues with missing .js extensions in relative imports
 */

import { HoldemTable, HandCategory } from '../dist/index.js';

// Simple smoke test to ensure the package loads correctly
try {
  // Test that we can create a table instance
  const table = new HoldemTable({
    maxPlayers: 6,
    smallBlind: 1n,
    bigBlind: 2n,
    ante: 0n,
  });

  // Test that we can get the state
  const state = table.getState();

  // Test that enums are exported correctly
  if (typeof HandCategory.HighCard === 'undefined') {
    throw new Error('HandCategory enum not properly exported');
  }

  console.log(
    '✓ ESM smoke test passed: Package imports correctly with proper .js extensions'
  );
  process.exit(0);
} catch (error) {
  console.error('✗ ESM smoke test failed with error:', error);
  process.exit(1);
}
