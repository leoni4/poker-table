# Poker Table

High-performance poker engine for single-table No-Limit Texas Hold'em.

## What is Poker Table?

Poker Table is a TypeScript-based poker engine that simulates a complete No-Limit Texas Hold'em table. It handles all game mechanics including:

- **Player management**: Seating, removing, and rebuy operations
- **Hand flow**: Blind posting, card dealing, betting rounds, and showdown
- **Betting logic**: All standard actions (fold, check, call, bet, raise, all-in)
- **Pot calculation**: Main pots and side pots for all-in scenarios
- **Hand evaluation**: Automatic determination of winners at showdown
- **Result-based error handling**: No exceptions, all operations return `Result<T, Error>`

## Installation

### Local Development

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd poker-table
npm install
npm run build
```

### As a Dependency (Future)

Once published to npm:

```bash
npm install poker-table
```

## Quick Start

Here's a complete example showing a typical hand:

```typescript
import {
  HoldemTable,
  createDefaultTableConfig,
  createPlayerId,
  chips,
  TablePhase,
  isOk,
} from 'poker-table';

// Create a table with default configuration
const config = createDefaultTableConfig();
const table = new HoldemTable(config);

// Seat players with initial buy-ins
const alice = createPlayerId('alice');
const bob = createPlayerId('bob');

table.seatPlayer(alice, chips(1000));
table.seatPlayer(bob, chips(1000));

// Start a hand
const startResult = table.startHand();
if (!isOk(startResult)) {
  console.error('Failed to start hand:', startResult.error.message);
  process.exit(1);
}

let state = startResult.value;
console.log(`Hand ${state.handId} started in ${state.phase} phase`);
console.log(`Community cards: ${state.communityCards.length}`);

// Main game loop: process actions until hand completes
while (state.phase !== TablePhase.Showdown) {
  // Check if there's a player to act
  if (!state.currentPlayerId) {
    console.log('No current player, hand might be complete');
    break;
  }

  console.log(`Current player to act: ${state.currentPlayerId}`);
  console.log(`Phase: ${state.phase}`);

  // Decide on an action (this would be your bot/AI or user input)
  // For this example, we'll just call or check
  const player = state.players.find((p) => p.id === state.currentPlayerId);
  if (!player) break;

  const amountToCall = state.players.reduce(
    (max, p) => (p.committed > max ? p.committed : max),
    0n
  );
  const needsToCall = amountToCall - player.committed;

  let action;
  if (needsToCall > 0n) {
    action = { type: 'CALL' as const };
  } else {
    action = { type: 'CHECK' as const };
  }

  // Apply the action
  const actionResult = table.applyAction(state.currentPlayerId, action);
  if (!isOk(actionResult)) {
    console.error('Action failed:', actionResult.error.message);
    break;
  }

  state = actionResult.value;
}

// Hand complete
console.log(`Hand finished in ${state.phase} phase`);
console.log(`Final community cards: ${state.communityCards.length}`);
console.log('Final pot distribution:', state.pots);
```

## Usage Guide

### Creating a Table

#### Using Default Configuration

```typescript
import { HoldemTable, createDefaultTableConfig } from 'poker-table';

const config = createDefaultTableConfig();
// Default: 2-10 players, 1/2 blinds
const table = new HoldemTable(config);
```

#### Custom Configuration

```typescript
import { HoldemTable, chips } from 'poker-table';

const config = {
  minPlayers: 2,
  maxPlayers: 6, // 6-max table
  smallBlind: chips(5),
  bigBlind: chips(10),
  ante: chips(1), // Optional ante
  straddle: chips(20), // Optional straddle (2x BB)
  rake: {
    // Optional rake
    percentage: 0.05, // 5%
    cap: chips(10), // Max rake per hand
  },
  rngSeed: 42, // Optional seed for deterministic behavior (testing)
};

const table = new HoldemTable(config);
```

#### Rebuy Options

```typescript
const table = new HoldemTable(config, {
  minRebuy: chips(100),
  maxRebuy: chips(5000),
  allowDuringHand: false, // Only allow rebuys between hands
});
```

### Seating Players

```typescript
import { createPlayerId, chips, isOk } from 'poker-table';

const playerId = createPlayerId('player-123');
const result = table.seatPlayer(playerId, chips(1000));

if (isOk(result)) {
  console.log('Player seated successfully');
  const state = result.value;
  console.log(`Total players: ${state.players.length}`);
} else {
  console.error('Failed to seat player:', result.error.message);
}
```

### Starting a Hand

```typescript
const result = table.startHand();

if (isOk(result)) {
  const state = result.value;
  console.log(`Hand #${state.handId} started`);
  console.log(`Dealer seat: ${state.dealerSeat}`);
  console.log(`Current phase: ${state.phase}`);
  console.log(`Next to act: ${state.currentPlayerId}`);
} else {
  console.error('Cannot start hand:', result.error.message);
  // Common reasons: insufficient players, hand already in progress
}
```

### Processing Actions

All actions return a `Result` that must be checked:

```typescript
import { PlayerAction } from 'poker-table';

// Fold
const foldAction: PlayerAction = { type: 'FOLD' };
const result = table.applyAction(playerId, foldAction);

// Check (only valid when no bet to call)
const checkAction: PlayerAction = { type: 'CHECK' };

// Call
const callAction: PlayerAction = { type: 'CALL' };

// Bet (only valid when no current bet)
const betAction: PlayerAction = {
  type: 'BET',
  amount: chips(50),
};

// Raise (only valid when there is a bet to raise)
const raiseAction: PlayerAction = {
  type: 'RAISE',
  amount: chips(100), // Raise size (not total)
};

// All-in
const allInAction: PlayerAction = { type: 'ALL_IN' };
```

### Reading Table State

The `getState()` method returns a complete snapshot of the table:

```typescript
const state = table.getState();

// Check current phase
console.log(`Phase: ${state.phase}`);
// Values: 'idle', 'preflop', 'flop', 'turn', 'river', 'showdown'

// Check whose turn it is
if (state.currentPlayerId) {
  console.log(`Waiting for: ${state.currentPlayerId}`);
}

// View community cards
console.log(
  `Board: ${state.communityCards.map((c) => c.toString()).join(' ')}`
);

// View players
for (const player of state.players) {
  console.log(`${player.id}: ${player.stack} chips, status: ${player.status}`);
  console.log(`  Committed: ${player.committed}`);
  if (player.holeCards.cards) {
    console.log(
      `  Cards: ${player.holeCards.cards.map((c) => c.toString()).join(' ')}`
    );
  }
}

// View pots
for (const pot of state.pots) {
  console.log(`Pot: ${pot.total} chips`);
  console.log(`  Eligible: ${pot.participants.join(', ')}`);
}
```

### Game Loop Pattern

Here's a robust game loop for processing a complete hand:

```typescript
import { TablePhase, isOk } from 'poker-table';

// Start hand
const startResult = table.startHand();
if (!isOk(startResult)) {
  console.error('Cannot start hand:', startResult.error.message);
  return;
}

let state = startResult.value;

// Process actions until hand completes
const maxActions = 100; // Safety limit
let actionCount = 0;

while (state.phase !== TablePhase.Showdown && actionCount < maxActions) {
  // Check if we're waiting for a player action
  if (!state.currentPlayerId) {
    console.log('Hand complete (no current player)');
    break;
  }

  // Get the action from your bot/AI/user interface
  const action = decideAction(state, state.currentPlayerId);

  // Apply the action
  const result = table.applyAction(state.currentPlayerId, action);

  if (!isOk(result)) {
    console.error('Action failed:', result.error.message);
    break;
  }

  state = result.value;
  actionCount++;
}

console.log(`Hand finished after ${actionCount} actions`);
console.log(`Final phase: ${state.phase}`);

// Example bot logic
function decideAction(state, playerId) {
  // Your decision logic here
  // For example, always call or check
  const player = state.players.find((p) => p.id === playerId);
  const currentBet = Math.max(...state.players.map((p) => p.committed));
  const needsToCall = currentBet - player.committed;

  if (needsToCall > 0n) {
    return { type: 'CALL' };
  } else {
    return { type: 'CHECK' };
  }
}
```

## Key Types

### TableConfig

Configuration for the poker table:

```typescript
interface TableConfig {
  minPlayers: number; // Minimum players to start (typically 2)
  maxPlayers: number; // Maximum players allowed (typically 2-10)
  smallBlind: ChipAmount; // Small blind amount
  bigBlind: ChipAmount; // Big blind amount
  ante?: ChipAmount; // Optional ante per player
  straddle?: ChipAmount; // Optional straddle amount
  rake?: RakeConfig; // Optional rake configuration
  rngSeed?: number; // Optional RNG seed for testing
}
```

### TableState

Complete snapshot of the table:

```typescript
interface TableState {
  phase: TablePhase; // Current game phase
  handId: number; // Current hand number
  dealerSeat?: number; // Dealer button position
  players: PlayerState[]; // All players at table
  communityCards: Card[]; // Board cards
  pots: PotState[]; // All pots (main + side pots)
  currentPlayerId?: PlayerId; // Player to act next
}

enum TablePhase {
  Idle = 'idle',
  Preflop = 'preflop',
  Flop = 'flop',
  Turn = 'turn',
  River = 'river',
  Showdown = 'showdown',
}
```

### PlayerState

Information about a single player:

```typescript
interface PlayerState {
  id: PlayerId; // Unique identifier
  seat: number; // Seat position (0-based)
  stack: ChipAmount; // Current chip stack
  committed: ChipAmount; // Chips in pot this hand
  status: PlayerStatus; // Current status
  holeCards: HoleCards; // Private cards
}

enum PlayerStatus {
  Active = 'active', // Can act
  Folded = 'folded', // Has folded
  AllIn = 'all-in', // Is all-in
  SittingOut = 'sitting-out', // Not in hand
}
```

### PlayerAction

Actions a player can take:

```typescript
interface PlayerAction {
  type: PlayerActionType;
  amount?: ChipAmount; // Required for BET, RAISE
}

type PlayerActionType = 'FOLD' | 'CHECK' | 'CALL' | 'BET' | 'RAISE' | 'ALL_IN';
```

### Utility Types

```typescript
// Branded type for chip amounts (uses bigint)
type ChipAmount = bigint & { readonly __brand: 'ChipAmount' };

// Create chip amounts
const amount = chips(100); // 100 chips

// Branded type for player IDs
type PlayerId = string & { readonly __brand: 'PlayerId' };

// Create player IDs
const id = createPlayerId('player-1');

// Result type for error handling
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Check results
if (isOk(result)) {
  // result.value is available
} else {
  // result.error is available
}
```

## Error Handling

All operations return a `Result` type - never throw exceptions:

```typescript
const result = table.seatPlayer(playerId, chips(1000));

if (isOk(result)) {
  // Success path
  const state = result.value;
  console.log('Player seated:', state.players.length);
} else {
  // Error path
  const error = result.error;
  console.error(`Error [${error.code}]: ${error.message}`);
}
```

Common error codes:

- `INVALID_STATE` - Operation not valid in current state
- `PLAYER_NOT_FOUND` - Player ID not found at table
- `NOT_PLAYER_TURN` - Player tried to act out of turn
- `INVALID_ACTION` - Action not allowed (e.g., CHECK when bet exists)
- `INSUFFICIENT_STACK` - Player doesn't have enough chips
- `INVALID_BET_AMOUNT` - Bet/raise amount invalid

## Hand History

Track what happened during hands:

```typescript
// Get current hand history (hand in progress)
const currentHistory = table.getCurrentHandHistory();

// Get last completed hand
const lastHistory = table.getLastHandHistory();

if (lastHistory) {
  console.log(`Hand #${lastHistory.handId}`);
  console.log(`Started: ${lastHistory.startTime}`);
  console.log(`Events: ${lastHistory.events.length}`);

  // Process events
  for (const event of lastHistory.events) {
    switch (event.type) {
      case 'HAND_STARTED':
        console.log('Hand started');
        break;
      case 'BLINDS_POSTED':
        console.log(`Blinds posted by ${event.postingPlayers.join(', ')}`);
        break;
      case 'ACTION_TAKEN':
        console.log(`${event.playerId} ${event.action.type}`);
        break;
      // ... other event types
    }
  }
}
```

## Testing & Quality

The library includes comprehensive test coverage to ensure reliability:

- **Unit tests**: Core components tested in isolation
- **Integration tests**: Complete hand flows and scenarios
- **Edge case tests**: Boundary conditions and error cases
- **Type safety**: Full TypeScript coverage with strict mode

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm test -- --coverage
```

### Code Quality

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Build
npm run build
```

## Development

### Project Structure

```
poker-table/
├── src/
│   ├── index.ts              # Main entry point
│   ├── holdem-table.ts       # Public API
│   ├── core/                 # Core types (Card, Money, Result, etc.)
│   ├── table/                # Table management
│   ├── betting/              # Betting logic and actions
│   ├── deck/                 # Deck shuffling and dealing
│   ├── hand-eval/            # Hand evaluation and comparison
│   ├── pot/                  # Pot calculation (main + side pots)
│   ├── rng/                  # Random number generation
│   └── history/              # Hand history tracking
├── tests/                    # Test files (mirrors src/ structure)
├── dist/                     # Build output
└── README.md                 # This file
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all tests pass: `npm test`
5. Submit a pull request

## License

MIT

## Support

For issues, questions, or contributions, please visit the project repository.
