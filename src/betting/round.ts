/**
 * Betting round engine for managing a single street of betting
 */

import { ChipAmount } from '../core/money.js';
import {
  BettingRoundState,
  TableState,
  PlayerId,
  PlayerStatus,
} from '../core/table.js';
import { Result, ok, err, isErr } from '../core/result.js';
import { PokerError, ErrorCode, createError } from '../core/errors.js';
import { PlayerAction, validateAction } from './actions.js';

/**
 * Gets the next active player in turn order.
 * Skips players who are folded, sitting out, or all-in.
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

  // Start from the next player and wrap around.
  for (let i = 1; i <= tableState.players.length; i++) {
    const nextIndex = (currentPlayerIndex + i) % tableState.players.length;
    const nextPlayer = tableState.players[nextIndex];

    if (nextPlayer.status === PlayerStatus.Active && nextPlayer.stack > 0n) {
      return nextPlayer.id;
    }
  }

  return undefined;
}

/**
 * Gets all players who can still take a betting action.
 */
function getActivePlayers(tableState: TableState): PlayerId[] {
  return tableState.players
    .filter((p) => p.status === PlayerStatus.Active && p.stack > 0n)
    .map((p) => p.id);
}

/**
 * Gets all players who are still contesting the hand.
 */
function getPlayersInHand(tableState: TableState): TableState['players'] {
  return tableState.players.filter(
    (p) =>
      p.status === PlayerStatus.Active || p.status === PlayerStatus.AllIn
  );
}

/**
 * Gets the current highest commitment in the betting round.
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
 * Creates betting-round state for a state snapshot that does not have it yet.
 *
 * This is primarily a backwards-compatibility path for consumers/tests that
 * construct TableState manually. Live Table hands initialize the state
 * explicitly at the start of every street.
 */
function createRoundState(tableState: TableState): BettingRoundState {
  const currentBet = getCurrentBet(tableState);

  return {
    street: tableState.phase,
    currentBet,
    lastRaiseSize: currentBet,
    actedPlayerIds: [],
  };
}

function getRoundState(tableState: TableState): BettingRoundState | undefined {
  if (
    tableState.bettingRound &&
    tableState.bettingRound.street === tableState.phase
  ) {
    return tableState.bettingRound;
  }

  return undefined;
}

function addActedPlayer(
  bettingRound: BettingRoundState,
  playerId: PlayerId
): void {
  if (!bettingRound.actedPlayerIds.includes(playerId)) {
    bettingRound.actedPlayerIds.push(playerId);
  }
}

/**
 * Checks whether all players who can act have both matched the current bet and
 * received the action they are owed on this street.
 */
function haveAllPlayersActed(tableState: TableState): boolean {
  const playersInHand = getPlayersInHand(tableState);

  // No betting remains if only one player is still contesting the hand.
  if (playersInHand.length <= 1) {
    return true;
  }

  const actionablePlayers = playersInHand.filter(
    (p) => p.status === PlayerStatus.Active && p.stack > 0n
  );

  // Everyone relevant is all-in.
  if (actionablePlayers.length === 0) {
    return true;
  }

  const currentBet = getCurrentBet(tableState);

  // A player who can still act must first match the current bet.
  if (actionablePlayers.some((player) => player.committed < currentBet)) {
    return false;
  }

  // If only one player can act and everybody else is all-in, there is nobody
  // left to bet against. Once that player has matched, the round is complete.
  if (actionablePlayers.length === 1) {
    return true;
  }

  const bettingRound = getRoundState(tableState);

  // Backwards compatibility for manually-created TableState snapshots from the
  // pre-bettingRound API: preserve the historical "matched bet" behaviour.
  if (!bettingRound) {
    return true;
  }

  return actionablePlayers.every((player) =>
    bettingRound.actedPlayerIds.includes(player.id)
  );
}

/**
 * Initializes a betting round.
 *
 * @param tableState - Current table state
 * @param startingPlayerId - Player who should act first
 * @returns Updated table state with betting round initialized
 */
export function startBettingRound(
  tableState: TableState,
  startingPlayerId: PlayerId
): Result<TableState, PokerError> {
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

  const bettingRound = createRoundState(tableState);

  return ok({
    ...tableState,
    currentPlayerId: startingPlayerId,
    bettingRound,
  });
}

/**
 * Applies a player action to the betting round state.
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
  const validationResult = validateAction(tableState, playerId, action);
  if (isErr(validationResult)) {
    return err(validationResult.error);
  }

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

  const existingRoundState = getRoundState(tableState);
  const bettingRound: BettingRoundState = existingRoundState
    ? {
        ...existingRoundState,
        actedPlayerIds: [...existingRoundState.actedPlayerIds],
      }
    : createRoundState(tableState);

  const newTableState: TableState = {
    ...tableState,
    players: [...tableState.players],
    bettingRound,
  };

  const newPlayer = { ...player };
  newTableState.players[playerIndex] = newPlayer;

  switch (action.type) {
    case 'FOLD':
      newPlayer.status = PlayerStatus.Folded;
      addActedPlayer(bettingRound, playerId);
      break;

    case 'CHECK':
      addActedPlayer(bettingRound, playerId);
      break;

    case 'CALL': {
      const callAmount = currentBet - player.committed;
      const actualCallAmount =
        callAmount < player.stack ? callAmount : player.stack;

      newPlayer.stack -= actualCallAmount;
      newPlayer.committed += actualCallAmount;

      if (newPlayer.stack === 0n) {
        newPlayer.status = PlayerStatus.AllIn;
      }

      addActedPlayer(bettingRound, playerId);
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

      if (newPlayer.stack === 0n) {
        newPlayer.status = PlayerStatus.AllIn;
      }

      bettingRound.currentBet = newPlayer.committed;
      bettingRound.lastRaiseSize = action.amount;
      bettingRound.lastAggressorId = playerId;
      bettingRound.actedPlayerIds = [playerId];
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

      if (newPlayer.stack === 0n) {
        newPlayer.status = PlayerStatus.AllIn;
      }

      bettingRound.currentBet = newPlayer.committed;
      bettingRound.lastRaiseSize = action.amount;
      bettingRound.lastAggressorId = playerId;
      bettingRound.actedPlayerIds = [playerId];
      break;
    }

    case 'ALL_IN': {
      const allInAmount = player.stack;
      newPlayer.stack = 0n;
      newPlayer.committed += allInAmount;
      newPlayer.status = PlayerStatus.AllIn;

      if (newPlayer.committed > currentBet) {
        const raiseSize = newPlayer.committed - currentBet;
        const isOpeningBet = currentBet === 0n;
        const isFullRaise =
          isOpeningBet ||
          bettingRound.lastRaiseSize === 0n ||
          raiseSize >= bettingRound.lastRaiseSize;

        bettingRound.currentBet = newPlayer.committed;

        if (isFullRaise) {
          bettingRound.lastRaiseSize = raiseSize;
          bettingRound.lastAggressorId = playerId;
          bettingRound.actedPlayerIds = [playerId];
        } else {
          // A short all-in raise changes the price to call, but does not count
          // as a full raise for minimum-raise/reopening purposes.
          addActedPlayer(bettingRound, playerId);
        }
      } else {
        // Short all-in call or exact all-in call.
        addActedPlayer(bettingRound, playerId);
      }

      break;
    }
  }

  const nextPlayerId = getNextActivePlayer(newTableState, playerId);
  newTableState.currentPlayerId = nextPlayerId;

  return ok(newTableState);
}

/**
 * Checks if the current betting round is complete.
 *
 * A betting round is complete when:
 * - Only one player remains in the hand, OR
 * - No player can act because everybody relevant is all-in, OR
 * - Every player who can act has matched the current bet and has acted since
 *   the latest full aggressive action.
 *
 * @param tableState - Current table state
 * @returns True if the betting round is complete
 */
export function isBettingRoundComplete(tableState: TableState): boolean {
  const playersInHand = getPlayersInHand(tableState);

  if (playersInHand.length <= 1) {
    return true;
  }

  return haveAllPlayersActed(tableState);
}

/**
 * Gets the current betting round state information.
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
