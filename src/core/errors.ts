/**
 * Common error codes for poker engine operations
 */

/**
 * Error codes enum for standardized error handling
 */
export enum ErrorCode {
  /**
   * Action is not valid in the current game state
   */
  INVALID_ACTION = 'INVALID_ACTION',

  /**
   * Player does not have enough chips for the action
   */
  INSUFFICIENT_STACK = 'INSUFFICIENT_STACK',

  /**
   * Game or player is in an invalid state
   */
  INVALID_STATE = 'INVALID_STATE',

  /**
   * Player not found in the game
   */
  PLAYER_NOT_FOUND = 'PLAYER_NOT_FOUND',

  /**
   * It's not the player's turn to act
   */
  NOT_PLAYER_TURN = 'NOT_PLAYER_TURN',

  /**
   * Invalid bet amount
   */
  INVALID_BET_AMOUNT = 'INVALID_BET_AMOUNT',

  /**
   * Invalid raise amount
   */
  INVALID_RAISE_AMOUNT = 'INVALID_RAISE_AMOUNT',

  /**
   * Table is full, cannot add more players
   */
  TABLE_FULL = 'TABLE_FULL',

  /**
   * Cannot perform action on an empty table
   */
  TABLE_EMPTY = 'TABLE_EMPTY',

  /**
   * Seat is already occupied
   */
  SEAT_OCCUPIED = 'SEAT_OCCUPIED',

  /**
   * Invalid seat number
   */
  INVALID_SEAT = 'INVALID_SEAT',

  /**
   * Game has already started
   */
  GAME_ALREADY_STARTED = 'GAME_ALREADY_STARTED',

  /**
   * Game has not started yet
   */
  GAME_NOT_STARTED = 'GAME_NOT_STARTED',

  /**
   * Invalid card or deck state
   */
  INVALID_CARD = 'INVALID_CARD',

  /**
   * Not enough players to start the game
   */
  NOT_ENOUGH_PLAYERS = 'NOT_ENOUGH_PLAYERS',

  /**
   * Generic internal error
   */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Base error interface for poker engine errors
 */
export interface PokerError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Creates a PokerError with the given code and message
 */
export function createError(
  code: ErrorCode,
  message: string,
  details?: unknown
): PokerError {
  return { code, message, details };
}

/**
 * Type guard to check if an error is a PokerError
 */
export function isPokerError(error: unknown): error is PokerError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    Object.values(ErrorCode).includes((error as PokerError).code)
  );
}
