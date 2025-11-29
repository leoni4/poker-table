# Poker Table

High-performance poker engine for a single No-Limit Texas Hold'em table.

## Features

- TypeScript-based implementation with strict type checking
- ESM module format
- Comprehensive test coverage with Vitest
- Code quality enforcement with ESLint and Prettier
- Table and seat management (join, leave, rebuy)
- Result-based error handling (no exceptions)

## Installation

```bash
npm install
```

## Development

### Build the project

```bash
npm run build
```

### Run tests

```bash
npm run test
```

### Type checking

```bash
npm run typecheck
```

### Lint code

```bash
npm run lint
```

## Usage

### Table Management

```typescript
import {
  createTable,
  createDefaultTableConfig,
  createPlayerId,
  chips,
} from 'poker-table';

// Create a table with default configuration
const config = createDefaultTableConfig();
const table = createTable(config);

// Seat a player
const playerId = createPlayerId('player-1');
const result = table.seatPlayer(playerId, chips(1000));

if (result.ok) {
  console.log('Player seated successfully');
  console.log(result.value.players);
} else {
  console.error('Failed to seat player:', result.error.message);
}

// Rebuy chips
const rebuyResult = table.rebuyPlayer(playerId, chips(500));

// Remove a player
const removeResult = table.removePlayer(playerId);
```

### Rebuy Options

Configure rebuy rules when creating a table:

```typescript
const table = createTable(config, {
  minRebuy: chips(100), // Minimum rebuy amount
  maxRebuy: chips(5000), // Maximum rebuy amount
  allowDuringHand: false, // Whether rebuy is allowed during active hand
});
```

## Project Structure

```
poker-table/
├── src/                      # Source code
│   ├── core/                 # Core types and utilities
│   ├── table/                # Table and seat management
│   ├── betting/              # Betting logic
│   ├── deck/                 # Deck management
│   ├── hand-eval/            # Hand evaluation
│   └── rng/                  # Random number generation
├── tests/                    # Test files
├── dist/                     # Build output (generated)
└── README.md                 # Project documentation
```

## License

MIT
