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
  isShowdownEvent,
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
  config: TableConfig
): TableState {
  if (isHandStartedEvent(event)) {
    return applyHandStarted(state, event);
  }

  if (isBlindsPostedEvent(event)) {
    return applyBlindsPosted(state, event, config);
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

  if (isShowdownEvent(event)) {
    return {
      ...state,
      phase: TablePhase.Showdown,
      currentPlayerId: undefined,
    };
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
  event: HandEvent & { type: 'BLINDS_POSTED' },
  config: TableConfig
): TableState {
  const newState = { ...state };
  const players = state.players.map((p) => ({ ...p }));

  // Antes are dead money: they contribute to the pot but do not count
  // toward a player's live preflop wager.
  if (event.antes) {
    for (const ante of event.antes) {
      const player = players.find((p) => p.id === ante.playerId);
      if (player) {
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

  // Build the visible pot from every forced contribution, including dead
  // antes, while keeping street commitments limited to live wagers.
  const forcedContributions = [
    ...(event.antes ?? []),
    ...(event.smallBlind ? [event.smallBlind] : []),
    ...(event.bigBlind ? [event.bigBlind] : []),
    ...(event.straddle ? [event.straddle] : []),
  ];
  const potTotal = forcedContributions.reduce(
    (sum, contribution) => sum + contribution.amount,
    0n
  );
  const participants = [
    ...new Set(forcedContributions.map((contribution) => contribution.playerId)),
  ];
  const pots = potTotal > 0n ? [{ total: potTotal, participants }] : [];

  // Transition to Preflop phase
  newState.phase = TablePhase.Preflop;
  newState.players = players;
  newState.pots = pots;

  // Set first player to act from the actual last forced-bet seat, not from
  // dealerSeat + 2 (which is wrong when seats are sparse or straddled).
  const lastForcedSeat = determineLastForcedSeat(
    players,
    state.dealerSeat,
    event,
    config
  );
  newState.currentPlayerId = determineFirstToAct(
    players,
    state.dealerSeat,
    lastForcedSeat
  );

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
  const players = state.players.map((p) => ({
    ...p,
    holeCards: p.holeCards.cards
      ? { cards: [...p.holeCards.cards] as [number, number] }
      : {},
  }));
  const player = players.find((p) => p.id === event.playerId);

  if (!player) {
    return state;
  }

  const actingSeat = player.seat;

  if (event.action === 'FOLD') {
    player.status = PlayerStatus.Folded;
  } else if (event.action !== 'CHECK') {
    let actualAmount: bigint;

    if (event.committedAfter !== undefined) {
      actualAmount = event.committedAfter - player.committed;
      if (actualAmount < 0n) {
        actualAmount = 0n;
      }
      if (actualAmount > player.stack) {
        actualAmount = player.stack;
      }
    } else {
      // Backward-compatible replay for histories recorded before
      // committedAfter existed. RAISE.amount is a raise *size*, so it must
      // include the outstanding call before the raise increment.
      const currentBet = players.reduce(
        (max, candidate) =>
          candidate.committed > max ? candidate.committed : max,
        0n
      );
      const callAmount =
        currentBet > player.committed ? currentBet - player.committed : 0n;

      switch (event.action) {
        case 'CALL':
          actualAmount = callAmount;
          break;
        case 'BET':
          actualAmount = event.amount ?? 0n;
          break;
        case 'RAISE':
          actualAmount = callAmount + (event.amount ?? 0n);
          break;
        case 'ALL_IN':
          actualAmount = player.stack;
          break;
        default:
          actualAmount = 0n;
      }

      if (actualAmount > player.stack) {
        actualAmount = player.stack;
      }
    }

    player.stack -= actualAmount;
    player.committed += actualAmount;

    if (player.stack === 0n || event.allIn) {
      player.status = PlayerStatus.AllIn;
    }
  }

  const nextPlayer = findFirstActiveAfterSeat(players, actingSeat);

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
    };
  });

  // Live Table keeps a completed hand inspectable in Showdown until the next
  // hand starts. Replay should preserve the same final board/cards/pot view.
  return {
    ...state,
    phase: TablePhase.Showdown,
    players,
    currentPlayerId: undefined,
  };
}

/**
 * Determine first player to act based on dealer position
 * @private
 */
function determineFirstToAct(
  players: PlayerState[],
  dealerSeat: number | undefined,
  lastForcedSeat?: number
): PlayerId | undefined {
  const activePlayers = players.filter(
    (player) => player.status === PlayerStatus.Active && player.stack > 0n
  );

  if (activePlayers.length === 0) {
    return undefined;
  }

  if (dealerSeat === undefined) {
    return activePlayers[0]?.id;
  }

  // Heads-up: the button/SB acts first preflop if able.
  if (players.filter((player) => player.status !== PlayerStatus.SittingOut).length === 2) {
    const dealer = activePlayers.find((player) => player.seat === dealerSeat);
    return dealer?.id ?? activePlayers[0]?.id;
  }

  return findFirstActiveAfterSeat(
    activePlayers,
    lastForcedSeat ?? dealerSeat
  )?.id;
}

function determineLastForcedSeat(
  players: PlayerState[],
  dealerSeat: number | undefined,
  event: HandEvent & { type: 'BLINDS_POSTED' },
  config: TableConfig
): number | undefined {
  const explicitLastPlayerId =
    event.straddle?.playerId ?? event.bigBlind?.playerId;
  const explicitLastPlayer = players.find(
    (player) => player.id === explicitLastPlayerId
  );
  if (explicitLastPlayer) {
    return explicitLastPlayer.seat;
  }

  if (dealerSeat === undefined) {
    return undefined;
  }

  const occupiedSeats = players.map((player) => player.seat);
  if (occupiedSeats.length <= 2) {
    return getNextOccupiedSeat(occupiedSeats, dealerSeat);
  }

  const smallBlindSeat = getNextOccupiedSeat(occupiedSeats, dealerSeat);
  if (smallBlindSeat === undefined) {
    return undefined;
  }
  const bigBlindSeat = getNextOccupiedSeat(occupiedSeats, smallBlindSeat);
  if (bigBlindSeat === undefined || config.straddle === undefined) {
    return bigBlindSeat;
  }
  return getNextOccupiedSeat(occupiedSeats, bigBlindSeat);
}

function getNextOccupiedSeat(
  occupiedSeats: number[],
  fromSeat: number
): number | undefined {
  const sortedSeats = [...occupiedSeats].sort((a, b) => a - b);
  return sortedSeats.find((seat) => seat > fromSeat) ?? sortedSeats[0];
}

function findFirstActiveAfterSeat(
  players: PlayerState[],
  seat: number
): PlayerState | undefined {
  const activePlayers = players
    .filter((player) => player.status === PlayerStatus.Active && player.stack > 0n)
    .sort((a, b) => a.seat - b.seat);

  return (
    activePlayers.find((player) => player.seat > seat) ?? activePlayers[0]
  );
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
    players: state.players.map((p) => ({
      ...p,
      holeCards: p.holeCards.cards
        ? { cards: [...p.holeCards.cards] as [number, number] }
        : {},
    })),
    communityCards: [...state.communityCards],
    pots: state.pots.map((pot) => ({
      ...pot,
      participants: [...pot.participants],
    })),
  };
}
