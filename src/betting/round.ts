/**
 * Betting round engine for managing a single street of betting
 */

import { ChipAmount } from '../core/money.js';
import { TableState, PlayerId, PlayerStatus } from '../core/table.js';
import { Result, ok, err } from '../core/result.js';
import { PokerError, ErrorCode, createError } from '../core/errors.js';
import { PlayerAction, validateAction } from './actions.js';

/**
 * Gets the next active player in turn order
 * Skips players who are folded, sitting out, or all-in
 */
function getNextActivePlayer(
  tableState: TableState,
  currentPlayerId: PlayerId
): PlayerId | undefined {
  if (tableState.players.length === 0) {
    return undefined;
  }

  const currentPlayerIndex = tableState.players.findIndex(
    (p) => p.id === currentPlayerId
  );

  if (currentPlayerIndex === -1) {
    return undefined;
  }

  // Start from the next player and wrap around
  for (let i = 1; i <= tableState.players.length; i++) {
    const nextIndex = (currentPlayerIndex + i) % tableState.players.length;
    const nextPlayer = tableState.players[nextIndex];

    // Skip players who cannot act
    if (nextPlayer.status === PlayerStatus.Active && nextPlayer.stack > 0n) {
      return nextPlayer.id;
    }
  }

  return undefined;
}

/**
 * Gets all players who can still act in the betting round
 */
function getActivePlayers(tableState: TableState): PlayerId[] {
  return tableState.players
    .filter((p) => p.status === PlayerStatus.Active && p.stack > 0n)
    .map((p) => p.id);
}

/**
 * Gets the current highest bet in the betting round
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
 * Checks if all active players have matched the current bet
 */
function haveAllPlayersActed(tableState: TableState): boolean {
  const currentBet = getCurrentBet(tableState);
  const activePlayers = tableState.players.filter(
    (p) => p.status === PlayerStatus.Active
  );

  // If no active players or only one, round is complete
  if (activePlayers.length <= 1) {
    return true;
  }

  // All active players with chips must have matched the current bet
  for (const player of activePlayers) {
    // Players with no stack are all-in and don't need to match
    if (player.stack === 0n) {
      continue;
    }

    // Player hasn't matched the current bet
    if (player.committed < currentBet) {
      return false;
    }
  }

  return true;
}

/**
 * Initializes a betting round
 *
 * @param tableState - Current table state
 * @param startingPlayerId - Player who should act first
 * @returns Updated table state with betting round initialized
 */
export function startBettingRound(
  tableState: TableState,
  startingPlayerId: PlayerId
): Result<TableState, PokerError> {
  // Verify starting player exists
  const startingPlayer = tableState.players.find(
    (p) => p.id === startingPlayerId
  );

  if (!startingPlayer) {
    return err(
      createError(
        ErrorCode.PLAYER_NOT_FOUND,
        `Starting player ${startingPlayerId} not found at table`
      )
    );
  }

  // Verify starting player can act
  if (
    startingPlayer.status !== PlayerStatus.Active ||
    startingPlayer.stack === 0n
  ) {
    return err(
      createError(
        ErrorCode.INVALID_STATE,
        `Starting player ${startingPlayerId} cannot act (status: ${startingPlayer.status}, stack: ${startingPlayer.stack})`
      )
    );
  }

  return ok({
    ...tableState,
    currentPlayerId: startingPlayerId,
  });
}

/**
 * Applies a player action to the betting round state
 *
 * @param tableState - Current table state
 * @param playerId - ID of player performing the action
 * @param action - The action to apply
 * @returns Result with updated table state or error
 */
export function applyActionToBettingRound(
  tableState: TableState,
  playerId: PlayerId,
  action: PlayerAction
): Result<TableState, PokerError> {
  // Validate the action first
  const validationResult = validateAction(tableState, playerId, action);
  if (!validationResult.ok) {
    return validationResult;
  }

  // Find the player
  const playerIndex = tableState.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) {
    return err(
      createError(
        ErrorCode.PLAYER_NOT_FOUND,
        `Player ${playerId} not found at table`
      )
    );
  }

  const player = tableState.players[playerIndex];
  const currentBet = getCurrentBet(tableState);

  // Create a copy of the table state to modify
  const newTableState: TableState = {
    ...tableState,
    players: [...tableState.players],
  };

  // Clone the specific player to modify
  const newPlayer = { ...player };
  newTableState.players[playerIndex] = newPlayer;

  // Apply the action
  switch (action.type) {
    case 'FOLD':
      newPlayer.status = PlayerStatus.Folded;
      break;

    case 'CHECK':
      // No state changes needed for check
      break;

    case 'CALL': {
      const callAmount = currentBet - player.committed;
      const actualCallAmount =
        callAmount < player.stack ? callAmount : player.stack;

      newPlayer.stack -= actualCallAmount;
      newPlayer.committed += actualCallAmount;

      // If player has no chips left after calling, mark as all-in
      if (newPlayer.stack === 0n) {
        newPlayer.status = PlayerStatus.AllIn;
      }
      break;
    }

    case 'BET': {
      if (action.amount === undefined) {
        return err(
          createError(ErrorCode.INVALID_BET_AMOUNT, 'Bet amount is required')
        );
      }

      newPlayer.stack -= action.amount;
      newPlayer.committed += action.amount;

      // If player has no chips left after betting, mark as all-in
      if (newPlayer.stack === 0n) {
        newPlayer.status = PlayerStatus.AllIn;
      }
      break;
    }

    case 'RAISE': {
      if (action.amount === undefined) {
        return err(
          createError(
            ErrorCode.INVALID_RAISE_AMOUNT,
            'Raise amount is required'
          )
        );
      }

      const callAmount = currentBet - player.committed;
      const totalAmount = callAmount + action.amount;

      newPlayer.stack -= totalAmount;
      newPlayer.committed += totalAmount;

      // If player has no chips left after raising, mark as all-in
      if (newPlayer.stack === 0n) {
        newPlayer.status = PlayerStatus.AllIn;
      }
      break;
    }

    case 'ALL_IN': {
      const allInAmount = player.stack;
      newPlayer.stack = 0n;
      newPlayer.committed += allInAmount;
      newPlayer.status = PlayerStatus.AllIn;
      break;
    }
  }

  // Move to the next player
  const nextPlayerId = getNextActivePlayer(newTableState, playerId);
  newTableState.currentPlayerId = nextPlayerId;

  return ok(newTableState);
}

/**
 * Checks if the current betting round is complete
 *
 * A betting round is complete when:
 * - Only one or zero active players remain, OR
 * - All active players have matched the current bet and had a chance to act
 *
 * @param tableState - Current table state
 * @returns True if the betting round is complete
 */
export function isBettingRoundComplete(tableState: TableState): boolean {
  const activePlayers = getActivePlayers(tableState);

  // If one or zero active players remain, round is complete
  if (activePlayers.length <= 1) {
    return true;
  }

  // Check if all active players have matched the current bet
  return haveAllPlayersActed(tableState);
}

/**
 * Gets the current betting round state information
 *
 * @param tableState - Current table state
 * @returns Betting round state information
 */
export function getBettingRoundInfo(tableState: TableState): {
  currentBet: ChipAmount;
  activePlayers: PlayerId[];
  isComplete: boolean;
} {
  return {
    currentBet: getCurrentBet(tableState),
    activePlayers: getActivePlayers(tableState),
    isComplete: isBettingRoundComplete(tableState),
  };
}
