/**
 * Public API for HoldemTable - main entry point for library consumers
 */

import { TableConfig, TableState, PlayerId } from './core/table.js';
import { ChipAmount } from './core/money.js';
import { Result } from './core/result.js';
import { PokerError } from './core/errors.js';
import { PlayerAction } from './betting/index.js';
import { Table, RebuyOptions } from './table/index.js';

/**
 * Main class for managing a No-Limit Texas Hold'em poker table
 *
 * This is the primary interface for library consumers to interact with the poker engine.
 * It handles player seating, hand progression, and action processing.
 *
 * @example
 * ```typescript
 * import { HoldemTable, createDefaultTableConfig, createPlayerId, chips } from 'poker-table';
 *
 * const config = createDefaultTableConfig();
 * const table = new HoldemTable(config);
 *
 * // Seat players
 * table.seatPlayer(createPlayerId('player-1'), chips(1000));
 * table.seatPlayer(createPlayerId('player-2'), chips(1000));
 *
 * // Start a hand
 * const result = table.startHand();
 * if (result.ok) {
 *   const state = result.value;
 *   console.log('Hand started:', state.handId);
 * }
 *
 * // Apply actions
 * const actionResult = table.applyAction(state.currentPlayerId, { type: 'CALL' });
 * ```
 */
export class HoldemTable {
  private table: Table;

  /**
   * Creates a new HoldemTable instance
   *
   * @param config - Table configuration including blinds, player limits, and optional settings
   * @param rebuyOptions - Optional rebuy configuration
   */
  constructor(config: TableConfig, rebuyOptions?: RebuyOptions) {
    this.table = new Table(config, rebuyOptions);
  }

  /**
   * Gets the current table state
   *
   * Returns a snapshot of the complete table state including:
   * - Current phase and hand ID
   * - All players and their stacks/positions
   * - Community cards
   * - Pot information
   * - Current player to act
   *
   * Note: The returned state includes all players' hole cards. Server implementations
   * should filter hole cards before sending state to clients to maintain privacy.
   *
   * @returns Complete table state
   */
  getState(): TableState {
    return this.table.getState();
  }

  /**
   * Gets the table configuration
   *
   * @returns Table configuration
   */
  getConfig(): TableConfig {
    return this.table.getConfig();
  }

  /**
   * Seats a player at the table with an initial buy-in
   *
   * The player will be assigned the next available seat. Players cannot be seated
   * if the table is full or if they're already seated.
   *
   * @param playerId - Unique identifier for the player
   * @param buyInAmount - Initial chip amount (must be at least the big blind)
   * @returns Result with updated table state or error
   */
  seatPlayer(
    playerId: PlayerId,
    buyInAmount: ChipAmount
  ): Result<TableState, PokerError> {
    return this.table.seatPlayer(playerId, buyInAmount);
  }

  /**
   * Removes a player from the table
   *
   * If called during an active hand, the player will be set to sitting out
   * instead of being removed (unless they have no committed chips).
   *
   * @param playerId - Unique identifier for the player to remove
   * @returns Result with updated table state or error
   */
  removePlayer(playerId: PlayerId): Result<TableState, PokerError> {
    return this.table.removePlayer(playerId);
  }

  /**
   * Processes a rebuy for a player
   *
   * Allows a player to add more chips to their stack. Rebuy rules are
   * configured via rebuyOptions in the constructor.
   *
   * @param playerId - Unique identifier for the player
   * @param amount - Amount of chips to add to the player's stack
   * @returns Result with updated table state or error
   */
  rebuyPlayer(
    playerId: PlayerId,
    amount: ChipAmount
  ): Result<TableState, PokerError> {
    return this.table.rebuyPlayer(playerId, amount);
  }

  /**
   * Starts a new hand
   *
   * This will:
   * 1. Post antes (if configured)
   * 2. Post small blind and big blind
   * 3. Post straddle (if configured)
   * 4. Create and shuffle a new deck
   * 5. Deal hole cards to all active players
   * 6. Set up the initial betting round
   *
   * Requirements:
   * - Table must be in Idle phase
   * - Must have minimum number of active players
   *
   * @returns Result with updated table state or error
   */
  startHand(): Result<TableState, PokerError> {
    return this.table.startHand();
  }

  /**
   * Applies a player action and advances the hand state
   *
   * Processes the action, updates the table state, and determines if:
   * - The betting round is complete (advance to next street)
   * - The hand is complete (only one player remains or reached showdown)
   *
   * @param playerId - Unique identifier for the player performing the action
   * @param action - The action to perform (FOLD, CHECK, CALL, BET, RAISE, ALL_IN)
   * @returns Result with updated table state or error
   *
   * @example
   * ```typescript
   * // Fold
   * table.applyAction(playerId, { type: 'FOLD' });
   *
   * // Check
   * table.applyAction(playerId, { type: 'CHECK' });
   *
   * // Call
   * table.applyAction(playerId, { type: 'CALL' });
   *
   * // Bet 100 chips
   * table.applyAction(playerId, { type: 'BET', amount: 100n });
   *
   * // Raise by 200 chips
   * table.applyAction(playerId, { type: 'RAISE', amount: 200n });
   *
   * // Go all-in
   * table.applyAction(playerId, { type: 'ALL_IN' });
   * ```
   */
  applyAction(
    playerId: PlayerId,
    action: PlayerAction
  ): Result<TableState, PokerError> {
    return this.table.applyAction(playerId, action);
  }

  /**
   * Get the current hand history (hand in progress)
   *
   * Returns the history of the current hand including all events that have
   * occurred so far. Returns null if no hand is currently in progress.
   *
   * @returns Current hand history or null
   */
  getCurrentHandHistory(): ReturnType<Table['getCurrentHandHistory']> {
    return this.table.getCurrentHandHistory();
  }

  /**
   * Get the last completed hand history
   *
   * Returns the history of the most recently completed hand. This is useful
   * for reviewing what happened in the previous hand. Returns null if no
   * hands have been completed yet.
   *
   * @returns Last hand history or null
   */
  getLastHandHistory(): ReturnType<Table['getLastHandHistory']> {
    return this.table.getLastHandHistory();
  }
}

/**
 * Creates a new HoldemTable instance
 *
 * Convenience factory function for creating a table.
 *
 * @param config - Table configuration
 * @param rebuyOptions - Optional rebuy configuration
 * @returns New HoldemTable instance
 */
export function createHoldemTable(
  config: TableConfig,
  rebuyOptions?: RebuyOptions
): HoldemTable {
  return new HoldemTable(config, rebuyOptions);
}
