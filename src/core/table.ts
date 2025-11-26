/**
 * Table configuration and state types for poker engine
 */

import { ChipAmount } from './money.js';
import { Card } from './card.js';

/**
 * Branded type for player ID to prevent mixing with other strings
 */
export type PlayerId = string & { readonly __brand: 'PlayerId' };

/**
 * Creates a PlayerId from a string
 */
export function createPlayerId(id: string): PlayerId {
  return id as PlayerId;
}

/**
 * Rake configuration for the table
 */
export interface RakeConfig {
  /**
   * Rake percentage (0.0 to 1.0)
   * e.g., 0.05 means 5%
   */
  percentage: number;

  /**
   * Maximum rake amount in chips
   */
  cap: ChipAmount;
}

/**
 * Table configuration
 */
export interface TableConfig {
  /**
   * Minimum number of players required
   * @default 2
   */
  minPlayers: number;

  /**
   * Maximum number of players allowed
   * @default 10
   */
  maxPlayers: number;

  /**
   * Small blind amount
   */
  smallBlind: ChipAmount;

  /**
   * Big blind amount
   */
  bigBlind: ChipAmount;

  /**
   * Optional ante amount posted by all players
   */
  ante?: ChipAmount;

  /**
   * Optional straddle amount (typically 2x big blind)
   */
  straddle?: ChipAmount;

  /**
   * Optional rake configuration
   */
  rake?: RakeConfig;

  /**
   * Optional RNG seed for deterministic behavior (testing)
   */
  rngSeed?: number;
}

/**
 * Player status in the current hand
 */
export enum PlayerStatus {
  /** Player is active and can act */
  Active = 'active',
  /** Player has folded their hand */
  Folded = 'folded',
  /** Player is all-in */
  AllIn = 'all-in',
  /** Player is sitting out */
  SittingOut = 'sitting-out',
}

/**
 * Player's hole cards (private cards)
 */
export interface HoleCards {
  /**
   * Two cards dealt to the player
   * May be undefined if not visible in public state
   */
  cards?: [Card, Card];
}

/**
 * Player state at the table
 */
export interface PlayerState {
  /**
   * Unique player identifier
   */
  id: PlayerId;

  /**
   * Seat position at the table (0-based)
   */
  seat: number;

  /**
   * Current chip stack
   */
  stack: ChipAmount;

  /**
   * Amount committed to the pot in current hand
   */
  committed: ChipAmount;

  /**
   * Current status of the player
   */
  status: PlayerStatus;

  /**
   * Player's hole cards
   */
  holeCards: HoleCards;
}

/**
 * Pot state representing a side pot or main pot
 */
export interface PotState {
  /**
   * Total amount in this pot
   */
  total: ChipAmount;

  /**
   * Player IDs eligible to win this pot
   */
  participants: PlayerId[];
}

/**
 * Table phase representing the current stage of the hand
 */
export enum TablePhase {
  /** No active hand, waiting for players */
  Idle = 'idle',
  /** Pre-flop betting round */
  Preflop = 'preflop',
  /** Flop betting round (3 community cards) */
  Flop = 'flop',
  /** Turn betting round (4th community card) */
  Turn = 'turn',
  /** River betting round (5th community card) */
  River = 'river',
  /** Showdown phase */
  Showdown = 'showdown',
}

/**
 * Complete table state
 */
export interface TableState {
  /**
   * Current phase of the hand
   */
  phase: TablePhase;

  /**
   * Unique identifier for the current hand
   * Increments with each new hand dealt
   */
  handId: number;

  /**
   * List of all players at the table
   */
  players: PlayerState[];

  /**
   * Community cards on the board
   * 0 cards in preflop, 3 in flop, 4 in turn, 5 in river/showdown
   */
  communityCards: Card[];

  /**
   * All pots (main pot and side pots)
   */
  pots: PotState[];

  /**
   * ID of the player whose turn it is to act
   * undefined if no action is pending
   */
  currentPlayerId?: PlayerId;
}

/**
 * Creates a default table configuration
 */
export function createDefaultTableConfig(): TableConfig {
  return {
    minPlayers: 2,
    maxPlayers: 10,
    smallBlind: 1n,
    bigBlind: 2n,
  };
}

/**
 * Validates table configuration
 * @returns true if valid, false otherwise
 */
export function isValidTableConfig(config: TableConfig): boolean {
  // Check player limits
  if (config.minPlayers < 2 || config.minPlayers > config.maxPlayers) {
    return false;
  }
  if (config.maxPlayers > 23) {
    // Texas Hold'em theoretical max is 23 players (52 cards / 2 cards per player)
    return false;
  }

  // Check blind amounts
  if (config.smallBlind <= 0n || config.bigBlind <= 0n) {
    return false;
  }
  if (config.smallBlind >= config.bigBlind) {
    return false;
  }

  // Check optional ante
  if (config.ante !== undefined && config.ante <= 0n) {
    return false;
  }

  // Check optional straddle
  if (config.straddle !== undefined && config.straddle <= 0n) {
    return false;
  }

  // Check rake configuration
  if (config.rake) {
    if (config.rake.percentage < 0 || config.rake.percentage > 1) {
      return false;
    }
    if (config.rake.cap <= 0n) {
      return false;
    }
  }

  return true;
}

/**
 * Type guard for PlayerStatus
 */
export function isPlayerStatus(value: unknown): value is PlayerStatus {
  return (
    typeof value === 'string' &&
    Object.values(PlayerStatus).includes(value as PlayerStatus)
  );
}

/**
 * Type guard for TablePhase
 */
export function isTablePhase(value: unknown): value is TablePhase {
  return (
    typeof value === 'string' &&
    Object.values(TablePhase).includes(value as TablePhase)
  );
}
