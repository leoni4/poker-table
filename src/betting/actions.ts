/**
 * Player action model and validation for betting rounds
 */

import { ChipAmount } from '../core/money.js';
import { TableState, PlayerId, PlayerStatus } from '../core/table.js';
import { Result, ok, err } from '../core/result.js';
import { PokerError, ErrorCode, createError } from '../core/errors.js';

/**
 * Type of player action in betting round
 */
export type PlayerActionType =
  | 'FOLD'
  | 'CHECK'
  | 'CALL'
  | 'BET'
  | 'RAISE'
  | 'ALL_IN';

/**
 * Player action with optional amount
 */
export interface PlayerAction {
  /**
   * Type of action being performed
   */
  type: PlayerActionType;

  /**
   * Amount of chips for actions that require it (BET, RAISE, CALL, ALL_IN)
   * Optional for FOLD and CHECK
   */
  amount?: ChipAmount;
}

/**
 * Type alias for table errors in betting context
 */
export type TableError = PokerError;

/**
 * Gets the current highest bet in the current betting round
 */
function getCurrentBet(tableState: TableState): ChipAmount {
  if (tableState.players.length === 0) {
    return 0n;
  }
  return tableState.players.reduce(
    (max, player) => (player.committed > max ? player.committed : max),
    0n
  );
}

/**
 * Gets the amount a player needs to call
 */
function getCallAmount(tableState: TableState, playerId: PlayerId): ChipAmount {
  const player = tableState.players.find((p) => p.id === playerId);
  if (!player) {
    return 0n;
  }
  const currentBet = getCurrentBet(tableState);
  const amountToCall = currentBet - player.committed;
  return amountToCall > 0n ? amountToCall : 0n;
}

/**
 * Gets the minimum raise amount allowed
 * Minimum raise = current bet + size of last raise (or big blind if no raise yet)
 */
function getMinimumRaise(
  tableState: TableState,
  playerId: PlayerId
): ChipAmount {
  const player = tableState.players.find((p) => p.id === playerId);
  if (!player) {
    return 0n;
  }

  const currentBet = getCurrentBet(tableState);
  const callAmount = getCallAmount(tableState, playerId);

  // If there's no current bet, minimum bet is typically 1 big blind
  // For a raise, it must be at least the size of the current bet doubled
  // Simplified: minimum raise = currentBet + callAmount (effectively doubling the bet)
  if (currentBet === 0n) {
    // No bet yet, any bet amount > 0 is valid (will be checked against stack)
    return 1n;
  }

  // Minimum raise is at least the size of the previous bet/raise
  // This means: call amount + at least the current bet
  return callAmount + currentBet;
}

/**
 * Determines which actions are available to a player
 *
 * @param tableState - Current state of the table
 * @param playerId - ID of the player to check
 * @returns Array of available action types
 */
export function getAvailableActions(
  tableState: TableState,
  playerId: PlayerId
): PlayerActionType[] {
  const player = tableState.players.find((p) => p.id === playerId);

  // Player not found or not their turn
  if (!player || tableState.currentPlayerId !== playerId) {
    return [];
  }

  // Player is not active (folded, all-in, sitting out)
  if (
    player.status === PlayerStatus.Folded ||
    player.status === PlayerStatus.AllIn ||
    player.status === PlayerStatus.SittingOut
  ) {
    return [];
  }

  const actions: PlayerActionType[] = [];
  const callAmount = getCallAmount(tableState, playerId);
  const currentBet = getCurrentBet(tableState);

  // FOLD is always available when it's your turn (except when you can check)
  actions.push('FOLD');

  // CHECK is available only if there's no amount to call
  if (callAmount === 0n) {
    actions.push('CHECK');
  }

  // CALL is available if there's an amount to call and player has chips
  if (callAmount > 0n && player.stack > 0n) {
    actions.push('CALL');
  }

  // BET is available if there's no current bet and player has chips
  if (currentBet === 0n && player.stack > 0n) {
    actions.push('BET');
  }

  // RAISE is available if there's a current bet and player has enough to raise
  const minRaise = getMinimumRaise(tableState, playerId);
  if (currentBet > 0n && player.stack >= minRaise) {
    actions.push('RAISE');
  }

  // ALL_IN is always available if player has chips
  if (player.stack > 0n) {
    actions.push('ALL_IN');
  }

  return actions;
}

/**
 * Validates a player action against the current table state
 *
 * @param tableState - Current state of the table
 * @param playerId - ID of the player performing the action
 * @param action - The action to validate
 * @returns Result with void on success, or TableError on failure
 */
export function validateAction(
  tableState: TableState,
  playerId: PlayerId,
  action: PlayerAction
): Result<void, TableError> {
  // Find the player
  const player = tableState.players.find((p) => p.id === playerId);
  if (!player) {
    return err(
      createError(
        ErrorCode.PLAYER_NOT_FOUND,
        `Player ${playerId} not found at table`
      )
    );
  }

  // Check if it's the player's turn
  if (tableState.currentPlayerId !== playerId) {
    return err(
      createError(
        ErrorCode.NOT_PLAYER_TURN,
        `It is not player ${playerId}'s turn to act`
      )
    );
  }

  // Check if player is in valid state to act
  if (
    player.status === PlayerStatus.Folded ||
    player.status === PlayerStatus.AllIn ||
    player.status === PlayerStatus.SittingOut
  ) {
    return err(
      createError(
        ErrorCode.INVALID_STATE,
        `Player ${playerId} cannot act in ${player.status} state`
      )
    );
  }

  const callAmount = getCallAmount(tableState, playerId);
  const currentBet = getCurrentBet(tableState);

  // Validate specific action types
  switch (action.type) {
    case 'FOLD':
      // Fold is always valid when it's your turn
      return ok(undefined);

    case 'CHECK':
      // Cannot check if there's an amount to call
      if (callAmount > 0n) {
        return err(
          createError(
            ErrorCode.INVALID_ACTION,
            `Cannot CHECK when there is an outstanding bet of ${callAmount} to call`
          )
        );
      }
      return ok(undefined);

    case 'CALL':
      // Cannot call if there's no amount to call
      if (callAmount === 0n) {
        return err(
          createError(
            ErrorCode.INVALID_ACTION,
            'Cannot CALL when there is no bet to call'
          )
        );
      }

      // Check if player has enough chips to call
      if (player.stack < callAmount) {
        return err(
          createError(
            ErrorCode.INSUFFICIENT_STACK,
            `Player ${playerId} has insufficient chips (${player.stack}) to call ${callAmount}`
          )
        );
      }

      // Amount should match call amount
      if (action.amount !== undefined && action.amount !== callAmount) {
        return err(
          createError(
            ErrorCode.INVALID_BET_AMOUNT,
            `CALL amount must be ${callAmount}, but got ${action.amount}`
          )
        );
      }

      return ok(undefined);

    case 'BET':
      // Cannot bet if there's already a bet
      if (currentBet > 0n) {
        return err(
          createError(
            ErrorCode.INVALID_ACTION,
            'Cannot BET when there is already a bet in play'
          )
        );
      }

      // Bet amount must be provided
      if (action.amount === undefined || action.amount <= 0n) {
        return err(
          createError(
            ErrorCode.INVALID_BET_AMOUNT,
            'BET amount must be specified and greater than 0'
          )
        );
      }

      // Cannot bet more than stack
      if (action.amount > player.stack) {
        return err(
          createError(
            ErrorCode.INVALID_BET_AMOUNT,
            `Cannot bet ${action.amount} with stack of ${player.stack}`
          )
        );
      }

      return ok(undefined);

    case 'RAISE': {
      // Cannot raise if there's no current bet
      if (currentBet === 0n) {
        return err(
          createError(
            ErrorCode.INVALID_ACTION,
            'Cannot RAISE when there is no bet to raise'
          )
        );
      }

      // Raise amount must be provided
      if (action.amount === undefined || action.amount <= 0n) {
        return err(
          createError(
            ErrorCode.INVALID_RAISE_AMOUNT,
            'RAISE amount must be specified and greater than 0'
          )
        );
      }

      // Cannot raise more than stack
      if (action.amount > player.stack) {
        return err(
          createError(
            ErrorCode.INVALID_RAISE_AMOUNT,
            `Cannot raise ${action.amount} with stack of ${player.stack}`
          )
        );
      }

      // Calculate total amount needed (call + raise)
      const totalRaiseAmount = callAmount + action.amount;

      // Check if player has enough for the total
      if (totalRaiseAmount > player.stack) {
        return err(
          createError(
            ErrorCode.INVALID_RAISE_AMOUNT,
            `Total raise amount ${totalRaiseAmount} exceeds stack of ${player.stack}`
          )
        );
      }

      // Check minimum raise (raise must be at least the size of current bet)
      if (action.amount < currentBet) {
        return err(
          createError(
            ErrorCode.INVALID_RAISE_AMOUNT,
            `Raise amount ${action.amount} is less than minimum raise of ${currentBet}`
          )
        );
      }

      return ok(undefined);
    }

    case 'ALL_IN':
      // Cannot go all-in with no chips
      if (player.stack === 0n) {
        return err(
          createError(
            ErrorCode.INSUFFICIENT_STACK,
            `Player ${playerId} has no chips to go all-in`
          )
        );
      }

      // All-in amount should match player's stack
      if (action.amount !== undefined && action.amount !== player.stack) {
        return err(
          createError(
            ErrorCode.INVALID_BET_AMOUNT,
            `ALL_IN amount must match stack (${player.stack}), but got ${action.amount}`
          )
        );
      }

      return ok(undefined);

    default: {
      // Type-safe way to handle unexpected action types
      const unknownType: never = action.type;
      return err(
        createError(
          ErrorCode.INVALID_ACTION,
          `Unknown action type: ${String(unknownType)}`
        )
      );
    }
  }
}
