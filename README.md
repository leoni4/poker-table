# @leoni4/poker-table

High-performance single-table No-Limit Texas Hold'em poker engine for Node.js.

## What is Poker Table?

A TypeScript-based poker engine that simulates a complete No-Limit Texas Hold'em table. It handles all game mechanics including:

- **Player management**: Seating, removing, and rebuy operations
- **Hand flow**: Blind posting, card dealing, betting rounds, and showdown
- **Betting logic**: All standard actions (fold, check, call, bet, raise, all-in)
- **Pot calculation**: Main pots and side pots for all-in scenarios
- **Hand evaluation**: Automatic determination of winners at showdown
- **Result-based table operations**: Table mutations return `Result<T, Error>` instead of throwing for normal game-flow errors

## Installation

```bash
npm install @leoni4/poker-table
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
  getAvailableActions,
  isOk,
} from '@leoni4/poker-table';

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
  const legalActions = getAvailableActions(state, state.currentPlayerId);
  const action = legalActions.includes('CHECK')
    ? { type: 'CHECK' as const }
    : legalActions.includes('CALL')
      ? { type: 'CALL' as const }
      : { type: 'FOLD' as const };

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
console.log('Final result:', table.getLastHandResult());
```

## Usage Guide

### Creating a Table

#### Using Default Configuration

```typescript
import { HoldemTable, createDefaultTableConfig } from '@leoni4/poker-table';

const config = createDefaultTableConfig();
// Default: 2-10 players, 1/2 blinds
const table = new HoldemTable(config);
```

#### Custom Configuration

```typescript
import { HoldemTable, chips } from '@leoni4/poker-table';

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
  rngSeed: 42, // Optional deterministic RNG stream seed
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
import { createPlayerId, chips, isOk } from '@leoni4/poker-table';

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
import { PlayerAction } from '@leoni4/poker-table';

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

`getState()` returns the complete privileged engine snapshot, including every player's hole cards. Server applications should use `getStateForPlayer(playerId)` (or call it without an ID for a spectator) before sending state to a client.

```typescript
import { cardToString } from '@leoni4/poker-table';

const state = table.getStateForPlayer(alice);

// Check current phase
console.log(`Phase: ${state.phase}`);
// Values: 'idle', 'preflop', 'flop', 'turn', 'river', 'showdown'

// Check whose turn it is
if (state.currentPlayerId) {
  console.log(`Waiting for: ${state.currentPlayerId}`);
}

// View community cards
console.log(
  `Board: ${state.communityCards.map(cardToString).join(' ')}`
);

// View players
for (const player of state.players) {
  console.log(`${player.id}: ${player.stack} chips, status: ${player.status}`);
  console.log(`  Committed: ${player.committed}`);
  if (player.holeCards.cards) {
    console.log(
      `  Cards: ${player.holeCards.cards.map(cardToString).join(' ')}`
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
import { TablePhase, getAvailableActions, isOk } from '@leoni4/poker-table';

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
  const legalActions = getAvailableActions(state, playerId);

  if (legalActions.includes('CHECK')) return { type: 'CHECK' };
  if (legalActions.includes('CALL')) return { type: 'CALL' };
  return { type: 'FOLD' };
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
  rngSeed?: number; // Optional seed for a deterministic table RNG stream
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
  bettingRound?: BettingRoundState; // Explicit current-street betting state
  lastHandResult?: HandResult; // Structured result of most recently completed hand
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
  committed: ChipAmount; // Live wager on the current street (antes excluded)
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
// Chip amounts use bigint exactly
type ChipAmount = bigint;

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

Table operations use the `Result` type for normal game-flow errors:

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

## Legal Actions and Betting Semantics

Use the exported betting helpers instead of reconstructing legality from `committed` values in consumer code:

```typescript
const legal = getAvailableActions(state, state.currentPlayerId!);
const toCall = getCallAmount(state, state.currentPlayerId!);
const minRaiseSize = getMinimumRaiseSize(state);
```

`BET` is only valid when the street has no current wager. `RAISE` is only valid when a wager already exists, and `RAISE.amount` is the **raise increment**, not the final total-to amount. Antes are dead money and are not part of `PlayerState.committed`. Short all-ins are represented with `ALL_IN`; they do not become a full raise unless they reach the current minimum raise rules.

## Hand Result

The engine exposes the result it already computed at showdown, so consumers do not need to run their own hand evaluator:

```typescript
const result = table.getLastHandResult();

if (result) {
  console.log(result.reason); // 'fold' | 'showdown'
  console.log(result.finalBoard.map(cardToString));

  for (const pot of result.pots) {
    console.log('Winners:', pot.winnerIds);
    console.log('Payouts:', pot.payouts);
    console.log('Rake:', pot.rake);
    console.log('Winning category:', pot.winningHand?.category);
    console.log('Best five:', pot.winningHand?.bestCards.map(cardToString));
  }
}
```

`TableState.lastHandResult` contains the same structured result in state snapshots.

## Hand History

Hand history is populated live and records hand start, forced bets, cards, actions, street transitions, showdown, pot distribution, and hand end:

```typescript
const currentHistory = table.getCurrentHandHistory();
const lastHistory = table.getLastHandHistory();

if (lastHistory) {
  for (const event of lastHistory.events) {
    switch (event.type) {
      case 'BLINDS_POSTED':
        console.log(event.smallBlind, event.bigBlind, event.antes);
        break;
      case 'ACTION_TAKEN':
        console.log(event.playerId, event.action, event.amount);
        break;
      case 'POT_DISTRIBUTED':
        console.log(event.pots); // amount, winners/shares, optional rake
        break;
    }
  }
}
```

Hand history is a **privileged audit log**: `CARDS_DEALT` contains all dealt hole cards. Do not send a current hand history directly to an untrusted client.

## Deterministic Training / Mirrored Evaluation

When `rngSeed` is set, a `HoldemTable` owns one deterministic RNG stream. Two fresh tables created with the same seed and the same seating/action sequence receive the same card sequence. The stream advances between hands; calling `startHand()` repeatedly does **not** recreate the same first deck.

For mirrored A-vs-B / B-vs-A evaluation, create two fresh table instances with the same seed and the same seat/button schedule, then swap which agent occupies each seat. For independently parallelized hands, derive a deterministic per-hand seed and create a fresh table for that hand. `HandHistory` timestamps use wall-clock time and therefore are not deterministic bytes even when the cards and actions are deterministic.

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
