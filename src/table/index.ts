/**
 * Table management for poker game
 * Handles player seating, removal, and rebuy operations
 */

import {
  TableConfig,
  TableState,
  PlayerState,
  PlayerId,
  TablePhase,
  PlayerStatus,
} from '../core/table.js';
import { ChipAmount } from '../core/money.js';
import { Result, ok, err } from '../core/result.js';
import { PokerError, createError, ErrorCode } from '../core/errors.js';

/**
 * Table error type for seat management operations
 */
export type TableError = PokerError;

/**
 * Options for rebuy operations
 */
export interface RebuyOptions {
  /**
   * Minimum rebuy amount (defaults to big blind)
   */
  minRebuy?: ChipAmount;

  /**
   * Maximum rebuy amount (defaults to no limit)
   */
  maxRebuy?: ChipAmount;

  /**
   * Whether rebuy is allowed during active hand (defaults to false)
   */
  allowDuringHand?: boolean;
}

/**
 * Table class managing player seating and game state
 */
export class Table {
  private config: TableConfig;
  private state: TableState;
  private rebuyOptions: RebuyOptions;

  constructor(config: TableConfig, rebuyOptions: RebuyOptions = {}) {
    this.config = config;
    this.rebuyOptions = {
      minRebuy: rebuyOptions.minRebuy ?? config.bigBlind,
      maxRebuy: rebuyOptions.maxRebuy,
      allowDuringHand: rebuyOptions.allowDuringHand ?? false,
    };

    // Initialize with empty table state
    this.state = {
      phase: TablePhase.Idle,
      handId: 0,
      players: [],
      communityCards: [],
      pots: [],
      currentPlayerId: undefined,
    };
  }

  /**
   * Get the current table state
   */
  getState(): TableState {
    return {
      ...this.state,
      players: this.state.players.map((p) => ({ ...p })),
      communityCards: [...this.state.communityCards],
      pots: this.state.pots.map((pot) => ({
        ...pot,
        participants: [...pot.participants],
      })),
    };
  }

  /**
   * Set the table phase (for testing purposes)
   * @internal
   */
  setPhase(phase: TablePhase): void {
    this.state.phase = phase;
  }

  /**
   * Set a player's committed chips (for testing purposes)
   * @internal
   */
  setPlayerCommitted(playerId: PlayerId, amount: ChipAmount): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (player) {
      player.committed = amount;
    }
  }

  /**
   * Set a player's status (for testing purposes)
   * @internal
   */
  setPlayerStatus(playerId: PlayerId, status: PlayerStatus): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (player) {
      player.status = status;
    }
  }

  /**
   * Set the current player (for testing purposes)
   * @internal
   */
  setCurrentPlayer(playerId: PlayerId): void {
    this.state.currentPlayerId = playerId;
  }

  /**
   * Get the table configuration
   */
  getConfig(): TableConfig {
    return { ...this.config };
  }

  /**
   * Seat a player at the table
   * @param playerId - The player's unique identifier
   * @param buyInAmount - The initial chip amount to buy in with
   * @returns Result with updated table state or error
   */
  seatPlayer(
    playerId: PlayerId,
    buyInAmount: ChipAmount
  ): Result<TableState, TableError> {
    // Validate table is not full
    if (this.state.players.length >= this.config.maxPlayers) {
      return err(
        createError(
          ErrorCode.TABLE_FULL,
          `Table is full. Maximum players: ${this.config.maxPlayers}`
        )
      );
    }

    // Check if player is already seated
    const existingPlayer = this.state.players.find((p) => p.id === playerId);
    if (existingPlayer) {
      return err(
        createError(
          ErrorCode.INVALID_STATE,
          `Player ${playerId} is already seated at the table`
        )
      );
    }

    // Validate buy-in amount (must be at least big blind)
    if (buyInAmount < this.config.bigBlind) {
      return err(
        createError(
          ErrorCode.INSUFFICIENT_STACK,
          `Buy-in amount ${buyInAmount} is less than big blind ${this.config.bigBlind}`
        )
      );
    }

    // Find the first available seat
    const seat = this.findAvailableSeat();

    // Create new player state
    const newPlayer: PlayerState = {
      id: playerId,
      seat,
      stack: buyInAmount,
      committed: 0n,
      status: PlayerStatus.Active,
      holeCards: {},
    };

    // Add player to the table
    this.state.players.push(newPlayer);

    // Sort players by seat number for consistency
    this.state.players.sort((a, b) => a.seat - b.seat);

    return ok(this.getState());
  }

  /**
   * Remove a player from the table
   * @param playerId - The player's unique identifier
   * @returns Result with updated table state or error
   */
  removePlayer(playerId: PlayerId): Result<TableState, TableError> {
    // Find the player
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) {
      return err(
        createError(
          ErrorCode.PLAYER_NOT_FOUND,
          `Player ${playerId} not found at the table`
        )
      );
    }

    const player = this.state.players[playerIndex];

    // Check if player can be removed during active hand
    if (this.state.phase !== TablePhase.Idle) {
      // Player can only be removed if they have no committed chips and are sitting out
      if (player.committed > 0n) {
        return err(
          createError(
            ErrorCode.INVALID_STATE,
            `Cannot remove player ${playerId} with committed chips during active hand`
          )
        );
      }

      // Set player to sitting out instead of removing during active hand
      player.status = PlayerStatus.SittingOut;
      return ok(this.getState());
    }

    // Remove player from the table
    this.state.players.splice(playerIndex, 1);

    // If current player was removed and it was their turn, clear current player
    if (this.state.currentPlayerId === playerId) {
      this.state.currentPlayerId = undefined;
    }

    return ok(this.getState());
  }

  /**
   * Process a rebuy for a player
   * @param playerId - The player's unique identifier
   * @param amount - The amount to rebuy
   * @returns Result with updated table state or error
   */
  rebuyPlayer(
    playerId: PlayerId,
    amount: ChipAmount
  ): Result<TableState, TableError> {
    // Find the player
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) {
      return err(
        createError(
          ErrorCode.PLAYER_NOT_FOUND,
          `Player ${playerId} not found at the table`
        )
      );
    }

    // Check if rebuy is allowed during active hand
    if (
      this.state.phase !== TablePhase.Idle &&
      !this.rebuyOptions.allowDuringHand
    ) {
      return err(
        createError(
          ErrorCode.INVALID_STATE,
          'Rebuy is not allowed during an active hand'
        )
      );
    }

    // Validate minimum rebuy amount
    const minRebuy = this.rebuyOptions.minRebuy ?? this.config.bigBlind;
    if (amount < minRebuy) {
      return err(
        createError(
          ErrorCode.INSUFFICIENT_STACK,
          `Rebuy amount ${amount} is less than minimum ${minRebuy}`
        )
      );
    }

    // Validate maximum rebuy amount if set
    if (this.rebuyOptions.maxRebuy && amount > this.rebuyOptions.maxRebuy) {
      return err(
        createError(
          ErrorCode.INVALID_STATE,
          `Rebuy amount ${amount} exceeds maximum ${this.rebuyOptions.maxRebuy}`
        )
      );
    }

    // Add chips to player's stack
    player.stack += amount;

    // If player was sitting out, make them active
    if (player.status === PlayerStatus.SittingOut) {
      player.status = PlayerStatus.Active;
    }

    return ok(this.getState());
  }

  /**
   * Find the first available seat number
   * @returns The seat number (0-based)
   */
  private findAvailableSeat(): number {
    const occupiedSeats = new Set(this.state.players.map((p) => p.seat));

    for (let seat = 0; seat < this.config.maxPlayers; seat++) {
      if (!occupiedSeats.has(seat)) {
        return seat;
      }
    }

    // This should never happen as we check for table full before calling this
    return 0;
  }
}

/**
 * Creates a new table instance with the given configuration
 */
export function createTable(
  config: TableConfig,
  rebuyOptions?: RebuyOptions
): Table {
  return new Table(config, rebuyOptions);
}
