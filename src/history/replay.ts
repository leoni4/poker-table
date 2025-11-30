/**
 * Hand history replay functionality
 * Reconstructs table states from recorded hand history
 */

import { HandHistory } from './hand-history.js';
import {
  TableState,
  TablePhase,
  PlayerState,
  PlayerStatus,
  TableConfig,
  PlayerId,
} from '../core/table.js';
import {
  HandEvent,
  isHandStartedEvent,
  isBlindsPostedEvent,
  isCardsDealtEvent,
  isActionTakenEvent,
  isStreetEndedEvent,
  isPotDistributedEvent,
  isHandEndedEvent,
} from './events.js';

/**
 * Replays a hand from its history, returning intermediate states
 *
 * This function reconstructs the sequence of table states by processing
 * recorded events in order. It's deterministic and doesn't use RNG - all
 * cards and actions come from the recorded history.
 *
 * @param history - The hand history to replay
 * @param config - Table configuration (should match history.tableConfig)
 * @returns Array of table state snapshots, one after each event
 *
 * @example
 * ```typescript
 * const history = getCompletedHandHistory();
 * const states = replayHand(history, history.tableConfig);
 *
 * // states[0] = state after hand started
 * // states[1] = state after blinds posted
 * // states[2] = state after cards dealt
 * // ... and so on
 * ```
 */
export function replayHand(
  history: HandHistory,
  config: TableConfig
): TableState[] {
  const states: TableState[] = [];

  // Initialize empty table state
  let currentState: TableState = {
    phase: TablePhase.Idle,
    handId: 0,
    dealerSeat: undefined,
    players: [],
    communityCards: [],
    pots: [],
    currentPlayerId: undefined,
  };

  // Process each event in chronological order
  for (const event of history.events) {
    currentState = applyEventToState(currentState, event, config);
    // Take snapshot after each event
    states.push(cloneState(currentState));
  }

  return states;
}

/**
 * Apply a single event to the current state
 * @private
 */
function applyEventToState(
  state: TableState,
  event: HandEvent,
  _config: TableConfig
): TableState {
  if (isHandStartedEvent(event)) {
    return applyHandStarted(state, event);
  }

  if (isBlindsPostedEvent(event)) {
    return applyBlindsPosted(state, event);
  }

  if (isCardsDealtEvent(event)) {
    return applyCardsDealt(state, event);
  }

  if (isActionTakenEvent(event)) {
    return applyActionTaken(state, event);
  }

  if (isStreetEndedEvent(event)) {
    return applyStreetEnded(state, event);
  }

  if (isPotDistributedEvent(event)) {
    return applyPotDistributed(state, event);
  }

  if (isHandEndedEvent(event)) {
    return applyHandEnded(state, event);
  }

  // Unknown event type - return state unchanged
  return state;
}

/**
 * Apply HAND_STARTED event
 * @private
 */
function applyHandStarted(
  state: TableState,
  event: HandEvent & { type: 'HAND_STARTED' }
): TableState {
  // Initialize players from the event
  const players: PlayerState[] = event.players.map((p) => ({
    id: p.id,
    seat: p.seat,
    stack: p.stack,
    committed: 0n,
    status: PlayerStatus.Active,
    holeCards: {},
  }));

  return {
    ...state,
    phase: TablePhase.Idle, // Will transition to Preflop after blinds
    handId: event.handId,
    dealerSeat: event.dealerSeat,
    players,
    communityCards: [],
    pots: [],
    currentPlayerId: undefined,
  };
}

/**
 * Apply BLINDS_POSTED event
 * @private
 */
function applyBlindsPosted(
  state: TableState,
  event: HandEvent & { type: 'BLINDS_POSTED' }
): TableState {
  const newState = { ...state };
  const players = state.players.map((p) => ({ ...p }));

  // Apply antes if present
  if (event.antes) {
    for (const ante of event.antes) {
      const player = players.find((p) => p.id === ante.playerId);
      if (player) {
        player.committed += ante.amount;
        player.stack -= ante.amount;
        if (player.stack === 0n) {
          player.status = PlayerStatus.AllIn;
        }
      }
    }
  }

  // Apply small blind
  if (event.smallBlind) {
    const player = players.find((p) => p.id === event.smallBlind?.playerId);
    if (player) {
      player.committed += event.smallBlind.amount;
      player.stack -= event.smallBlind.amount;
      if (player.stack === 0n) {
        player.status = PlayerStatus.AllIn;
      }
    }
  }

  // Apply big blind
  if (event.bigBlind) {
    const player = players.find((p) => p.id === event.bigBlind?.playerId);
    if (player) {
      player.committed += event.bigBlind.amount;
      player.stack -= event.bigBlind.amount;
      if (player.stack === 0n) {
        player.status = PlayerStatus.AllIn;
      }
    }
  }

  // Apply straddle
  if (event.straddle) {
    const player = players.find((p) => p.id === event.straddle?.playerId);
    if (player) {
      player.committed += event.straddle.amount;
      player.stack -= event.straddle.amount;
      if (player.stack === 0n) {
        player.status = PlayerStatus.AllIn;
      }
    }
  }

  // Calculate total committed and create initial pot
  const totalCommitted = players.reduce((sum, p) => sum + p.committed, 0n);
  const pots =
    totalCommitted > 0n
      ? [
          {
            total: totalCommitted,
            participants: players
              .filter((p) => p.committed > 0n)
              .map((p) => p.id),
          },
        ]
      : [];

  // Transition to Preflop phase
  newState.phase = TablePhase.Preflop;
  newState.players = players;
  newState.pots = pots;

  // Set first player to act
  newState.currentPlayerId = determineFirstToAct(players, state.dealerSeat);

  return newState;
}

/**
 * Apply CARDS_DEALT event
 * @private
 */
function applyCardsDealt(
  state: TableState,
  event: HandEvent & { type: 'CARDS_DEALT' }
): TableState {
  const players = state.players.map((p) => ({ ...p }));

  // Assign hole cards to players
  for (const playerCards of event.players) {
    const player = players.find((p) => p.id === playerCards.playerId);
    if (player) {
      player.holeCards = { cards: playerCards.cards };
    }
  }

  return {
    ...state,
    players,
  };
}

/**
 * Apply ACTION_TAKEN event
 * @private
 */
function applyActionTaken(
  state: TableState,
  event: HandEvent & { type: 'ACTION_TAKEN' }
): TableState {
  const players = state.players.map((p) => ({ ...p }));
  const player = players.find((p) => p.id === event.playerId);

  if (!player) {
    return state;
  }

  switch (event.action) {
    case 'FOLD':
      player.status = PlayerStatus.Folded;
      break;

    case 'CHECK':
      // No state change for check
      break;

    case 'CALL': {
      // Calculate call amount (highest commitment - player's commitment)
      const maxCommitted = Math.max(...players.map((p) => Number(p.committed)));
      const callAmount = BigInt(maxCommitted) - player.committed;
      const actualAmount =
        callAmount > player.stack ? player.stack : callAmount;

      player.stack -= actualAmount;
      player.committed += actualAmount;

      if (player.stack === 0n) {
        player.status = PlayerStatus.AllIn;
      }
      break;
    }

    case 'BET':
    case 'RAISE': {
      if (event.amount !== undefined) {
        const actualAmount =
          event.amount > player.stack ? player.stack : event.amount;
        player.stack -= actualAmount;
        player.committed += actualAmount;

        if (player.stack === 0n || event.allIn) {
          player.status = PlayerStatus.AllIn;
        }
      }
      break;
    }

    case 'ALL_IN': {
      const allInAmount = player.stack;
      player.committed += allInAmount;
      player.stack = 0n;
      player.status = PlayerStatus.AllIn;
      break;
    }
  }

  // Move to next player
  const activePlayers = players.filter((p) => p.status === PlayerStatus.Active);

  const currentIndex = activePlayers.findIndex((p) => p.id === event.playerId);
  const nextPlayer = activePlayers[(currentIndex + 1) % activePlayers.length];

  return {
    ...state,
    players,
    currentPlayerId: nextPlayer?.id,
  };
}

/**
 * Apply STREET_ENDED event
 * @private
 */
function applyStreetEnded(
  state: TableState,
  event: HandEvent & { type: 'STREET_ENDED' }
): TableState {
  const players = state.players.map((p) => ({ ...p, committed: 0n }));

  // Update pot total
  const pots = [
    {
      total: event.potTotal,
      participants: state.pots[0]?.participants || [],
    },
  ];

  // Set first player to act for new street
  const activePlayers = players.filter((p) => p.status === PlayerStatus.Active);
  const firstPlayer =
    state.dealerSeat !== undefined
      ? findFirstPlayerAfterDealer(activePlayers, state.dealerSeat)
      : activePlayers[0];

  return {
    ...state,
    phase: event.street,
    players,
    communityCards: event.communityCards,
    pots,
    currentPlayerId: firstPlayer?.id,
  };
}

/**
 * Apply POT_DISTRIBUTED event
 * @private
 */
function applyPotDistributed(
  state: TableState,
  event: HandEvent & { type: 'POT_DISTRIBUTED' }
): TableState {
  const players = state.players.map((p) => ({ ...p }));

  // Distribute winnings to players
  for (const pot of event.pots) {
    for (const winner of pot.winners) {
      const player = players.find((p) => p.id === winner.playerId);
      if (player) {
        player.stack += winner.share;
      }
    }
  }

  return {
    ...state,
    players,
    phase: TablePhase.Showdown,
  };
}

/**
 * Apply HAND_ENDED event
 * @private
 */
function applyHandEnded(
  state: TableState,
  event: HandEvent & { type: 'HAND_ENDED' }
): TableState {
  const players = state.players.map((p) => {
    const finalPlayer = event.finalPlayers.find((fp) => fp.id === p.id);
    return {
      ...p,
      stack: finalPlayer?.finalStack ?? p.stack,
      committed: 0n,
      holeCards: {},
    };
  });

  return {
    ...state,
    phase: TablePhase.Idle,
    players,
    communityCards: [],
    pots: [],
    currentPlayerId: undefined,
  };
}

/**
 * Determine first player to act based on dealer position
 * @private
 */
function determineFirstToAct(
  players: PlayerState[],
  dealerSeat: number | undefined
): PlayerId | undefined {
  if (dealerSeat === undefined) {
    return players[0]?.id;
  }

  const activePlayers = players.filter((p) => p.status === PlayerStatus.Active);

  if (activePlayers.length === 0) {
    return undefined;
  }

  // Find first player after dealer+2 (after big blind)
  // For heads-up, dealer acts first
  if (activePlayers.length === 2) {
    return players.find((p) => p.seat === dealerSeat)?.id;
  }

  // Multi-way: find player after BB
  const sortedPlayers = [...activePlayers].sort((a, b) => a.seat - b.seat);

  // Find players after dealer
  for (const player of sortedPlayers) {
    if (player.seat > dealerSeat + 2) {
      return player.id;
    }
  }

  // Wrap around
  return sortedPlayers[0]?.id;
}

/**
 * Find first active player after dealer for post-flop action
 * @private
 */
function findFirstPlayerAfterDealer(
  players: PlayerState[],
  dealerSeat: number
): PlayerState | undefined {
  const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat);

  // Find first player after dealer
  for (const player of sortedPlayers) {
    if (player.seat > dealerSeat) {
      return player;
    }
  }

  // Wrap around to first player
  return sortedPlayers[0];
}

/**
 * Deep clone a table state
 * @private
 */
function cloneState(state: TableState): TableState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    communityCards: [...state.communityCards],
    pots: state.pots.map((pot) => ({
      ...pot,
      participants: [...pot.participants],
    })),
  };
}
