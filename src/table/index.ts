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
  HandResult,
  SettledPotResult,
} from '../core/table.js';
import { ChipAmount } from '../core/money.js';
import { Card } from '../core/card.js';
import { Result, ok, err } from '../core/result.js';
import { PokerError, createError, ErrorCode } from '../core/errors.js';
import { Deck, createShuffledDeck } from '../deck/deck.js';
import { createRngFromConfig } from '../rng/factory.js';
import { Rng } from '../rng/interface.js';
import {
  PlayerAction,
  applyActionToBettingRound,
  isBettingRoundComplete,
  startBettingRound,
} from '../betting/index.js';
import {
  HandEvent,
  HandHistory,
  createHandHistory,
  handHistoryFromJSON,
  handHistoryToJSON,
} from '../history/index.js';
import {
  PlayerContribution,
  Payout,
  constructPots,
  distributePot,
  applyPayouts,
} from '../pot/index.js';
import { determineWinners, evaluateHand } from '../hand-eval/index.js';

/**
 * Table error type for seat management operations
 */
export type TableError = PokerError;

interface ForcedBetSeats {
  smallBlindSeat: number;
  bigBlindSeat: number;
  straddleSeat?: number;
  headsUp: boolean;
}

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
  private deck: Deck | null = null;
  private rng: Rng;
  private currentHandHistory: HandHistory | null = null;
  private lastHandHistory: HandHistory | null = null;
  private handContributions = new Map<PlayerId, ChipAmount>();
  private lastBigBlindHandByPlayer = new Map<PlayerId, number>();

  constructor(config: TableConfig, rebuyOptions: RebuyOptions = {}) {
    this.config = {
      ...config,
      rake: config.rake ? { ...config.rake } : undefined,
    };
    this.rng = createRngFromConfig(this.config);
    this.rebuyOptions = {
      minRebuy: rebuyOptions.minRebuy ?? config.bigBlind,
      maxRebuy: rebuyOptions.maxRebuy,
      allowDuringHand: rebuyOptions.allowDuringHand ?? false,
    };

    // Initialize with empty table state
    this.state = {
      phase: TablePhase.Idle,
      handId: 0,
      dealerSeat: undefined,
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
      players: this.state.players.map((p) => ({
        ...p,
        holeCards: p.holeCards.cards
          ? { cards: [...p.holeCards.cards] as [Card, Card] }
          : {},
      })),
      communityCards: [...this.state.communityCards],
      pots: this.state.pots.map((pot) => ({
        ...pot,
        participants: [...pot.participants],
      })),
      bettingRound: this.state.bettingRound
        ? {
            ...this.state.bettingRound,
            actedPlayerIds: [...this.state.bettingRound.actedPlayerIds],
            actedAtBet: this.state.bettingRound.actedAtBet?.map((entry) => ({
              ...entry,
            })),
          }
        : undefined,
      lastHandResult: this.state.lastHandResult
        ? this.cloneHandResult(this.state.lastHandResult)
        : undefined,
    };
  }

  /**
   * Get a state snapshot safe to expose to one player (or an observer).
   * Other players' hole cards stay hidden until they are actually revealed
   * by a completed showdown.
   */
  getStateForPlayer(viewerId?: PlayerId): TableState {
    const state = this.getState();
    const revealed = new Set(
      state.phase === TablePhase.Showdown &&
        state.lastHandResult?.reason === 'showdown'
        ? state.lastHandResult.revealedPlayers.map((player) => player.playerId)
        : []
    );

    state.players = state.players.map((player) => ({
      ...player,
      holeCards:
        player.id === viewerId || revealed.has(player.id)
          ? player.holeCards
          : {},
    }));
    return state;
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
    return {
      ...this.config,
      rake: this.config.rake ? { ...this.config.rake } : undefined,
    };
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
    if (this.isHandInProgress()) {
      // Player can only be removed if they have no committed chips and are sitting out
      if (player.committed > 0n) {
        return err(
          createError(
            ErrorCode.INVALID_STATE,
            `Cannot remove player ${playerId} with committed chips during active hand`
          )
        );
      }

      // If the player is currently facing action, record an actual fold first
      // so the turn advances and the betting round cannot become stuck on a
      // player who is no longer allowed to act. Then mark them sitting out for
      // subsequent hands.
      if (this.state.currentPlayerId === playerId) {
        const foldResult = this.applyAction(playerId, { type: 'FOLD' });
        if (!foldResult.ok) {
          return foldResult;
        }
        const foldedPlayer = this.state.players.find((p) => p.id === playerId);
        if (foldedPlayer) {
          foldedPlayer.status = PlayerStatus.SittingOut;
        }
        return ok(this.getState());
      }

      // A non-current zero-commitment player can leave the current hand by
      // becoming sitting out; action selection already skips this status.
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
      this.isHandInProgress() &&
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

    // Between hands, any funded player is eligible for the next deal. During
    // an active hand preserve the hand-local status even when rebuys are
    // explicitly enabled by configuration.
    if (!this.isHandInProgress() && player.stack > 0n) {
      player.status = PlayerStatus.Active;
    } else if (player.status === PlayerStatus.SittingOut) {
      player.status = PlayerStatus.Active;
    }

    return ok(this.getState());
  }

  /**
   * Start a complete hand including deck creation, card dealing, and blind posting
   * @returns Result with updated table state or error
   */
  startHand(): Result<TableState, TableError> {
    const blindResult = this.startNewHand();
    if (!blindResult.ok) {
      return blindResult;
    }

    // A seeded table owns one RNG stream. Creating a fresh deck consumes the
    // next part of that stream instead of restarting it at the same seed.
    this.deck = createShuffledDeck(this.rng);

    const activePlayersWithCards = this.state.players.filter(
      (p) => p.status === PlayerStatus.Active || p.status === PlayerStatus.AllIn
    );

    const holeCardsResult = this.deck.dealHoleCards(
      activePlayersWithCards.length
    );
    if (!holeCardsResult.ok) {
      return err(
        createError(ErrorCode.INVALID_STATE, 'Failed to deal hole cards')
      );
    }

    activePlayersWithCards.forEach((player, index) => {
      player.holeCards = { cards: holeCardsResult.value[index] };
    });

    this.appendHistoryEvent({
      type: 'CARDS_DEALT',
      timestamp: Date.now(),
      players: activePlayersWithCards.map((player) => ({
        playerId: player.id,
        cards: player.holeCards.cards!,
      })),
    });

    if (isBettingRoundComplete(this.state)) {
      const playersWhoCanAct = this.state.players.filter(
        (player) =>
          player.status === PlayerStatus.Active && player.stack > 0n
      );
      if (playersWhoCanAct.length <= 1) {
        return this.runoutToShowdown();
      }
    }

    return ok(this.getState());
  }

  /**
   * Start a new hand by posting blinds, antes, and straddle
   * @returns Result with updated table state or error
   */
  startNewHand(): Result<TableState, TableError> {
    if (this.isHandInProgress()) {
      return err(
        createError(
          ErrorCode.INVALID_STATE,
          'Cannot start new hand: hand already in progress'
        )
      );
    }

    const eligiblePlayers = this.state.players.filter(
      (player) =>
        player.status !== PlayerStatus.SittingOut && player.stack > 0n
    );

    if (eligiblePlayers.length < this.config.minPlayers) {
      return err(
        createError(
          ErrorCode.NOT_ENOUGH_PLAYERS,
          `Not enough players. Minimum: ${this.config.minPlayers}, Current: ${eligiblePlayers.length}`
        )
      );
    }

    // Folded/all-in are hand-local statuses. Normalize them before moving the
    // button so a completed hand can be followed by startHand() directly.
    for (const player of this.state.players) {
      player.committed = 0n;
      player.holeCards = {};
      if (player.status !== PlayerStatus.SittingOut) {
        player.status =
          player.stack > 0n ? PlayerStatus.Active : PlayerStatus.SittingOut;
      }
    }

    this.moveDealerButton();
    const forcedBetSeats = this.getForcedBetSeats();

    this.state.communityCards = [];
    this.state.pots = [];
    this.state.currentPlayerId = undefined;
    this.state.bettingRound = undefined;
    this.handContributions.clear();
    this.state.phase = TablePhase.Preflop;
    this.state.handId++;

    this.currentHandHistory = createHandHistory(
      this.state.handId,
      this.getConfig()
    );
    this.appendHistoryEvent({
      type: 'HAND_STARTED',
      timestamp: Date.now(),
      handId: this.state.handId,
      dealerSeat: this.state.dealerSeat!,
      players: this.state.players
        .filter((player) => player.status !== PlayerStatus.SittingOut)
        .map((player) => ({
          id: player.id,
          seat: player.seat,
          stack: player.stack,
        })),
    });

    const antes = this.postAntes();
    const blinds = this.postBlinds(forcedBetSeats);
    const straddle = this.postStraddle(forcedBetSeats);
    this.refreshPots();

    this.appendHistoryEvent({
      type: 'BLINDS_POSTED',
      timestamp: Date.now(),
      ...blinds,
      straddle,
      antes: antes.length > 0 ? antes : undefined,
    });

    this.setFirstToAct(forcedBetSeats);

    // A short blind never lowers the nominal preflop price. A fully-posted
    // live straddle becomes the opening wager; a short straddle is only an
    // incomplete all-in increment over the big blind.
    const openingBet =
      straddle && straddle.amount > this.config.bigBlind
        ? straddle.amount
        : this.config.bigBlind;
    const openingRaiseSize =
      straddle &&
      this.config.straddle !== undefined &&
      straddle.amount > this.config.bigBlind &&
      straddle.amount === this.config.straddle
        ? this.config.straddle
        : this.config.bigBlind;

    if (this.state.currentPlayerId) {
      const roundResult = startBettingRound(
        this.state,
        this.state.currentPlayerId,
        {
          currentBet: openingBet,
          lastRaiseSize: openingRaiseSize,
          minimumBet: this.config.bigBlind,
        }
      );
      if (!roundResult.ok) {
        return roundResult;
      }
      this.state = roundResult.value;
    } else {
      this.state.bettingRound = {
        street: TablePhase.Preflop,
        currentBet: openingBet,
        lastRaiseSize: openingRaiseSize,
        minimumBet: this.config.bigBlind,
        actedPlayerIds: [],
        actedAtBet: [],
      };
    }

    return ok(this.getState());
  }

  /**
   * Move the dealer button to the next active player
   * @private
   */
  private moveDealerButton(): void {
    const activePlayers = this.state.players.filter(
      (p) => p.status === PlayerStatus.Active
    );

    if (activePlayers.length === 0) {
      return;
    }

    // When play is heads-up, the player who most recently had the BB should
    // receive the button/SB. This also handles a 3-handed -> HU transition
    // where simply moving to the next occupied seat can assign the blinds
    // incorrectly.
    if (activePlayers.length === 2) {
      const mostRecentBigBlind = [...activePlayers].sort(
        (a, b) =>
          (this.lastBigBlindHandByPlayer.get(b.id) ?? -1) -
          (this.lastBigBlindHandByPlayer.get(a.id) ?? -1)
      )[0];
      if (
        mostRecentBigBlind &&
        this.lastBigBlindHandByPlayer.has(mostRecentBigBlind.id)
      ) {
        this.state.dealerSeat = mostRecentBigBlind.seat;
        return;
      }
    }

    if (this.state.dealerSeat === undefined) {
      // First hand - dealer is at first active player
      this.state.dealerSeat = activePlayers[0].seat;
    } else {
      // Move dealer button clockwise to next active player
      const nextSeat = this.getNextActiveSeat(this.state.dealerSeat);
      this.state.dealerSeat = nextSeat;
    }
  }

  /**
   * Get the next active player seat clockwise from given seat
   * @private
   */
  private getNextActiveSeat(fromSeat: number): number {
    const activePlayers = this.state.players.filter(
      (p) => p.status === PlayerStatus.Active
    );

    if (activePlayers.length === 0) {
      return fromSeat;
    }

    // Sort by seat number
    const sortedSeats = activePlayers.map((p) => p.seat).sort((a, b) => a - b);

    // Find next seat after fromSeat (wrapping around)
    for (const seat of sortedSeats) {
      if (seat > fromSeat) {
        return seat;
      }
    }

    // Wrap around to first seat
    return sortedSeats[0];
  }

  /**
   * Get player at specific seat
   * @private
   */
  private getPlayerAtSeat(seat: number): PlayerState | undefined {
    return this.state.players.find((p) => p.seat === seat);
  }

  private getForcedBetSeats(): ForcedBetSeats {
    if (this.state.dealerSeat === undefined) {
      throw new Error('Dealer seat is not set');
    }

    const activePlayers = this.state.players.filter(
      (player) => player.status === PlayerStatus.Active
    );
    const dealerSeat = this.state.dealerSeat;

    if (activePlayers.length === 2) {
      return {
        smallBlindSeat: dealerSeat,
        bigBlindSeat: this.getNextActiveSeat(dealerSeat),
        headsUp: true,
      };
    }

    const smallBlindSeat = this.getNextActiveSeat(dealerSeat);
    const bigBlindSeat = this.getNextActiveSeat(smallBlindSeat);
    const straddleSeat = this.config.straddle
      ? this.getNextActiveSeat(bigBlindSeat)
      : undefined;

    return { smallBlindSeat, bigBlindSeat, straddleSeat, headsUp: false };
  }

  private postAntes(): Array<{ playerId: PlayerId; amount: ChipAmount }> {
    if (!this.config.ante) {
      return [];
    }

    const posted: Array<{ playerId: PlayerId; amount: ChipAmount }> = [];
    for (const player of this.state.players) {
      if (player.status === PlayerStatus.Active) {
        // Antes are dead money and must not increase the live street wager.
        const amount = this.deductFromPlayer(player, this.config.ante, false);
        if (amount > 0n) {
          posted.push({ playerId: player.id, amount });
        }
      }
    }
    return posted;
  }

  private postBlinds(forcedBetSeats: ForcedBetSeats): {
    smallBlind?: { playerId: PlayerId; amount: ChipAmount };
    bigBlind?: { playerId: PlayerId; amount: ChipAmount };
  } {
    const result: {
      smallBlind?: { playerId: PlayerId; amount: ChipAmount };
      bigBlind?: { playerId: PlayerId; amount: ChipAmount };
    } = {};

    const smallBlind = this.getPlayerAtSeat(forcedBetSeats.smallBlindSeat);
    if (smallBlind) {
      const amount = this.deductFromPlayer(
        smallBlind,
        this.config.smallBlind,
        true
      );
      if (amount > 0n) {
        result.smallBlind = { playerId: smallBlind.id, amount };
      }
    }

    const bigBlind = this.getPlayerAtSeat(forcedBetSeats.bigBlindSeat);
    if (bigBlind) {
      this.lastBigBlindHandByPlayer.set(bigBlind.id, this.state.handId);
      const amount = this.deductFromPlayer(bigBlind, this.config.bigBlind, true);
      if (amount > 0n) {
        result.bigBlind = { playerId: bigBlind.id, amount };
      }
    }

    return result;
  }

  private postStraddle(
    forcedBetSeats: ForcedBetSeats
  ): { playerId: PlayerId; amount: ChipAmount } | undefined {
    if (!this.config.straddle || forcedBetSeats.straddleSeat === undefined) {
      return undefined;
    }

    const player = this.getPlayerAtSeat(forcedBetSeats.straddleSeat);
    if (!player) {
      return undefined;
    }

    const amount = this.deductFromPlayer(player, this.config.straddle, true);
    return amount > 0n ? { playerId: player.id, amount } : undefined;
  }

  private deductFromPlayer(
    player: PlayerState,
    amount: ChipAmount,
    includeInStreetCommitment: boolean
  ): ChipAmount {
    const actualAmount = player.stack < amount ? player.stack : amount;
    player.stack -= actualAmount;
    if (includeInStreetCommitment) {
      player.committed += actualAmount;
    }
    if (actualAmount > 0n) {
      this.recordContribution(player.id, actualAmount);
    }
    if (player.stack === 0n) {
      player.status = PlayerStatus.AllIn;
    }
    return actualAmount;
  }

  private setFirstToAct(forcedBetSeats: ForcedBetSeats): void {
    const activePlayers = this.state.players.filter(
      (player) => player.status === PlayerStatus.Active && player.stack > 0n
    );
    if (activePlayers.length === 0) {
      this.state.currentPlayerId = undefined;
      return;
    }

    if (forcedBetSeats.headsUp) {
      const dealer = this.getPlayerAtSeat(this.state.dealerSeat!);
      if (dealer?.status === PlayerStatus.Active && dealer.stack > 0n) {
        this.state.currentPlayerId = dealer.id;
        return;
      }
      const nextSeat = this.getNextActiveSeat(this.state.dealerSeat!);
      this.state.currentPlayerId = this.getPlayerAtSeat(nextSeat)?.id;
      return;
    }

    const lastForcedSeat =
      forcedBetSeats.straddleSeat ?? forcedBetSeats.bigBlindSeat;
    const firstSeat = this.getNextActiveSeat(lastForcedSeat);
    this.state.currentPlayerId = this.getPlayerAtSeat(firstSeat)?.id;
  }

  /**
   * Apply a player action and advance the hand state
   * @param playerId - The player performing the action
   * @param action - The action to perform
   * @returns Result with updated table state or error
   */
  applyAction(
    playerId: PlayerId,
    action: PlayerAction
  ): Result<TableState, TableError> {
    const previousPlayer = this.state.players.find((p) => p.id === playerId);
    const previousCommitted = previousPlayer?.committed ?? 0n;

    // Apply action to betting round
    const actionResult = applyActionToBettingRound(
      this.state,
      playerId,
      action
    );
    if (!actionResult.ok) {
      return actionResult;
    }

    this.state = actionResult.value;

    const updatedPlayer = this.state.players.find((p) => p.id === playerId);
    if (updatedPlayer) {
      const contributionDelta = updatedPlayer.committed - previousCommitted;
      if (contributionDelta > 0n) {
        this.recordContribution(playerId, contributionDelta);
      }
    }
    this.refreshPots();
    this.appendHistoryEvent({
      type: 'ACTION_TAKEN',
      timestamp: Date.now(),
      playerId,
      action: action.type,
      amount: action.amount,
      committedAfter: updatedPlayer?.committed,
      allIn: updatedPlayer?.status === PlayerStatus.AllIn || undefined,
    });

    // Check if betting round is complete
    if (isBettingRoundComplete(this.state)) {
      const playersInHand = this.state.players.filter(
        (p) =>
          p.status === PlayerStatus.Active || p.status === PlayerStatus.AllIn
      );

      if (playersInHand.length <= 1) {
        // Hand is over because everyone else folded.
        this.state.phase = TablePhase.Showdown;
        this.state.currentPlayerId = undefined;
        this.state.bettingRound = undefined;

        const soleWinner = playersInHand[0];
        if (soleWinner) {
          const settlementResult = this.settleSoleWinner(soleWinner.id);
          if (!settlementResult.ok) {
            return settlementResult;
          }
        }

        return ok(this.getState());
      }

      const playersWhoCanAct = playersInHand.filter(
        (p) => p.status === PlayerStatus.Active && p.stack > 0n
      );

      if (playersWhoCanAct.length <= 1) {
        // No further betting is possible (everyone else is all-in). Run the
        // remaining board automatically instead of leaving the hand stuck
        // without a current player.
        return this.runoutToShowdown();
      }

      // Advance to next street
      return this.advanceStreet();
    }

    return ok(this.getState());
  }

  /**
   * Advance to the next street (flop -> turn -> river -> showdown)
   * @private
   */
  private advanceStreet(): Result<TableState, TableError> {
    if (!this.deck) {
      return err(createError(ErrorCode.INVALID_STATE, 'No deck available'));
    }

    // Reset committed amounts for new betting round
    for (const player of this.state.players) {
      player.committed = 0n;
    }

    switch (this.state.phase) {
      case TablePhase.Preflop: {
        // Deal flop
        const flopResult = this.deck.dealFlop();
        if (!flopResult.ok) {
          return err(
            createError(ErrorCode.INVALID_STATE, 'Failed to deal flop')
          );
        }
        this.state.communityCards = [...flopResult.value];
        this.state.phase = TablePhase.Flop;
        break;
      }

      case TablePhase.Flop: {
        // Deal turn
        const turnResult = this.deck.dealCommunityCard();
        if (!turnResult.ok) {
          return err(
            createError(ErrorCode.INVALID_STATE, 'Failed to deal turn')
          );
        }
        this.state.communityCards.push(turnResult.value);
        this.state.phase = TablePhase.Turn;
        break;
      }

      case TablePhase.Turn: {
        // Deal river
        const riverResult = this.deck.dealCommunityCard();
        if (!riverResult.ok) {
          return err(
            createError(ErrorCode.INVALID_STATE, 'Failed to deal river')
          );
        }
        this.state.communityCards.push(riverResult.value);
        this.state.phase = TablePhase.River;
        break;
      }

      case TablePhase.River: {
        // Go to showdown
        this.state.phase = TablePhase.Showdown;
        this.state.currentPlayerId = undefined;
        this.state.bettingRound = undefined;

        const settlementResult = this.settleShowdown();
        if (!settlementResult.ok) {
          return settlementResult;
        }

        return ok(this.getState());
      }

      default:
        return err(
          createError(
            ErrorCode.INVALID_STATE,
            'Invalid phase for street advance'
          )
        );
    }

    this.appendStreetEvent(this.state.phase);

    // Set first to act for new betting round (after dealer)
    this.setFirstToActPostFlop();

    if (this.state.currentPlayerId) {
      const roundResult = startBettingRound(
        this.state,
        this.state.currentPlayerId,
        {
          currentBet: 0n,
          lastRaiseSize: this.config.bigBlind,
          minimumBet: this.config.bigBlind,
        }
      );
      if (!roundResult.ok) {
        return roundResult;
      }
      this.state = roundResult.value;
    }

    return ok(this.getState());
  }

  /**
   * Deal every remaining community card when no further betting is possible.
   */
  private runoutToShowdown(): Result<TableState, TableError> {
    if (!this.deck) {
      return err(createError(ErrorCode.INVALID_STATE, 'No deck available'));
    }

    for (const player of this.state.players) {
      player.committed = 0n;
    }

    if (this.state.phase === TablePhase.Preflop) {
      const flopResult = this.deck.dealFlop();
      if (!flopResult.ok) {
        return err(
          createError(ErrorCode.INVALID_STATE, 'Failed to deal flop')
        );
      }
      this.state.communityCards = [...flopResult.value];
      this.state.phase = TablePhase.Flop;
      this.appendStreetEvent(TablePhase.Flop);
    }

    if (this.state.phase === TablePhase.Flop) {
      const turnResult = this.deck.dealCommunityCard();
      if (!turnResult.ok) {
        return err(
          createError(ErrorCode.INVALID_STATE, 'Failed to deal turn')
        );
      }
      this.state.communityCards.push(turnResult.value);
      this.state.phase = TablePhase.Turn;
      this.appendStreetEvent(TablePhase.Turn);
    }

    if (this.state.phase === TablePhase.Turn) {
      const riverResult = this.deck.dealCommunityCard();
      if (!riverResult.ok) {
        return err(
          createError(ErrorCode.INVALID_STATE, 'Failed to deal river')
        );
      }
      this.state.communityCards.push(riverResult.value);
      this.state.phase = TablePhase.River;
      this.appendStreetEvent(TablePhase.River);
    }

    this.state.phase = TablePhase.Showdown;
    this.state.currentPlayerId = undefined;
    this.state.bettingRound = undefined;

    const settlementResult = this.settleShowdown();
    if (!settlementResult.ok) {
      return settlementResult;
    }

    return ok(this.getState());
  }

  /**
   * Rebuild visible pots from cumulative hand contributions.
   */
  private refreshPots(): void {
    const contributions: PlayerContribution[] = [];

    for (const [playerId, amount] of this.handContributions) {
      if (amount <= 0n) {
        continue;
      }

      const player = this.state.players.find((p) => p.id === playerId);
      contributions.push({
        playerId,
        amount,
        isAllIn: player?.status === PlayerStatus.AllIn,
      });
    }

    const eligiblePlayers = new Set(
      this.state.players
        .filter(
          (p) =>
            p.status === PlayerStatus.Active || p.status === PlayerStatus.AllIn
        )
        .map((p) => p.id)
    );

    const hasAllInContribution = contributions.some(
      (contribution) => contribution.isAllIn
    );

    if (!hasAllInContribution) {
      const total = contributions.reduce(
        (sum, contribution) => sum + contribution.amount,
        0n
      );

      this.state.pots =
        total > 0n
          ? [
              {
                total,
                participants: contributions
                  .map((contribution) => contribution.playerId)
                  .filter((id) => eligiblePlayers.has(id)),
              },
            ]
          : [];
      return;
    }

    this.state.pots = constructPots(contributions).map((pot) => ({
      ...pot,
      participants: pot.participants.filter((id) => eligiblePlayers.has(id)),
    }));
  }

  /**
   * Pay every pot to the only player left in the hand.
   */
  private settleSoleWinner(winnerId: PlayerId): Result<void, TableError> {
    this.refreshPots();

    const payouts: Payout[] = this.state.pots.map((pot, potIndex) => ({
      playerId: winnerId,
      amount: pot.total,
      potIndex,
    }));

    const payoutResult = applyPayouts(this.state.players, payouts);
    if (!payoutResult.ok) {
      return payoutResult;
    }

    const settledPots: SettledPotResult[] = this.state.pots.map(
      (pot, potIndex) => ({
        potIndex,
        total: pot.total,
        winnerIds: [winnerId],
        payouts: payouts
          .filter((payout) => payout.potIndex === potIndex)
          .map((payout) => ({
            playerId: payout.playerId,
            amount: payout.amount,
          })),
        rake: 0n,
      })
    );

    this.state.lastHandResult = {
      handId: this.state.handId,
      reason: 'fold',
      finalBoard: [...this.state.communityCards],
      revealedPlayers: [],
      pots: settledPots,
      totalRake: 0n,
    };

    this.appendPotDistributionEvent(settledPots);
    this.completeHandHistory(true);
    return ok(undefined);
  }

  /**
   * Evaluate and distribute every pot at showdown.
   */
  private settleShowdown(): Result<void, TableError> {
    this.refreshPots();

    const revealedPlayers = this.state.players
      .filter(
        (player) =>
          (player.status === PlayerStatus.Active ||
            player.status === PlayerStatus.AllIn) &&
          player.holeCards.cards !== undefined
      )
      .map((player) => ({
        playerId: player.id,
        holeCards: [...player.holeCards.cards!] as [Card, Card],
      }));

    this.appendHistoryEvent({
      type: 'SHOWDOWN',
      timestamp: Date.now(),
      players: revealedPlayers.map((player) => ({
        playerId: player.playerId,
        cards: [...player.holeCards] as [Card, Card],
      })),
    });

    const allPayouts: Payout[] = [];
    const settledPots: SettledPotResult[] = [];
    let totalRake = 0n;

    for (let potIndex = 0; potIndex < this.state.pots.length; potIndex++) {
      const pot = this.state.pots[potIndex];
      const eligiblePlayers = this.state.players.filter(
        (player) =>
          pot.participants.includes(player.id) &&
          (player.status === PlayerStatus.Active ||
            player.status === PlayerStatus.AllIn) &&
          player.holeCards.cards !== undefined
      );

      if (eligiblePlayers.length === 0) {
        continue;
      }

      let winnerIds: PlayerId[];
      let winningHand: SettledPotResult['winningHand'];

      if (eligiblePlayers.length === 1) {
        winnerIds = [eligiblePlayers[0].id];
        winningHand = evaluateHand([
          ...eligiblePlayers[0].holeCards.cards!,
          ...this.state.communityCards,
        ]);
      } else {
        const result = determineWinners(
          eligiblePlayers.map((player) => ({
            playerId: player.id,
            holeCards: player.holeCards.cards!,
          })),
          this.state.communityCards
        );
        winnerIds = result.winners
          .map((winnerId) =>
            eligiblePlayers.find((player) => player.id === winnerId)
          )
          .filter((player): player is PlayerState => player !== undefined)
          .map((player) => player.id);
        winningHand = result.winningHand;
      }

      winnerIds = this.orderWinnersForOddChip(winnerIds);
      const distribution = distributePot(
        pot,
        winnerIds,
        potIndex,
        this.config.rake
      );
      allPayouts.push(...distribution.payouts);
      totalRake += distribution.rake.amount;
      settledPots.push({
        potIndex,
        total: pot.total,
        winnerIds: [...winnerIds],
        payouts: distribution.payouts.map((payout) => ({
          playerId: payout.playerId,
          amount: payout.amount,
        })),
        rake: distribution.rake.amount,
        winningHand,
      });
    }

    const payoutResult = applyPayouts(this.state.players, allPayouts);
    if (!payoutResult.ok) {
      return payoutResult;
    }

    this.state.lastHandResult = {
      handId: this.state.handId,
      reason: 'showdown',
      finalBoard: [...this.state.communityCards],
      revealedPlayers,
      pots: settledPots,
      totalRake,
    };

    this.appendPotDistributionEvent(settledPots);
    this.completeHandHistory(false);
    return ok(undefined);
  }

  /** Order tied Hold'em winners for odd-chip awards: first seat left of button. */
  private orderWinnersForOddChip(winnerIds: PlayerId[]): PlayerId[] {
    if (winnerIds.length <= 1 || this.state.dealerSeat === undefined) {
      return [...winnerIds];
    }

    const seatsClockwiseFromButton = [...this.state.players]
      .sort((a, b) => a.seat - b.seat)
      .filter((player) => player.seat > this.state.dealerSeat!)
      .concat(
        [...this.state.players]
          .sort((a, b) => a.seat - b.seat)
          .filter((player) => player.seat <= this.state.dealerSeat!)
      );
    const priority = new Map(
      seatsClockwiseFromButton.map((player, index) => [player.id, index])
    );

    return [...winnerIds].sort(
      (a, b) =>
        (priority.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (priority.get(b) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  /**
   * Set first player to act post-flop (first active player after dealer)
   * @private
   */
  private setFirstToActPostFlop(): void {
    if (this.state.dealerSeat === undefined) {
      return;
    }

    const activePlayers = this.state.players.filter(
      (p) => p.status === PlayerStatus.Active
    );

    if (activePlayers.length === 0) {
      this.state.currentPlayerId = undefined;
      return;
    }

    // Post-flop action starts with first active player after dealer
    const firstToActSeat = this.getNextActiveSeat(this.state.dealerSeat);
    const firstPlayer = this.getPlayerAtSeat(firstToActSeat);
    this.state.currentPlayerId = firstPlayer?.id;
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

  private isHandInProgress(): boolean {
    return (
      this.state.phase === TablePhase.Preflop ||
      this.state.phase === TablePhase.Flop ||
      this.state.phase === TablePhase.Turn ||
      this.state.phase === TablePhase.River
    );
  }

  private recordContribution(playerId: PlayerId, amount: ChipAmount): void {
    this.handContributions.set(
      playerId,
      (this.handContributions.get(playerId) ?? 0n) + amount
    );
  }

  private appendHistoryEvent(event: HandEvent): void {
    this.currentHandHistory?.events.push(event);
  }

  private appendStreetEvent(street: TablePhase): void {
    this.appendHistoryEvent({
      type: 'STREET_ENDED',
      timestamp: Date.now(),
      street,
      communityCards: [...this.state.communityCards],
      potTotal: this.state.pots.reduce((sum, pot) => sum + pot.total, 0n),
    });
  }

  private appendPotDistributionEvent(pots: SettledPotResult[]): void {
    this.appendHistoryEvent({
      type: 'POT_DISTRIBUTED',
      timestamp: Date.now(),
      pots: pots.map((pot) => ({
        amount: pot.total,
        rake: pot.rake,
        winners: pot.payouts.map((payout) => ({
          playerId: payout.playerId,
          share: payout.amount,
        })),
      })),
    });
  }

  private completeHandHistory(winnersByFold: boolean): void {
    if (!this.currentHandHistory) {
      return;
    }

    this.appendHistoryEvent({
      type: 'HAND_ENDED',
      timestamp: Date.now(),
      handId: this.state.handId,
      winnersByFold,
      finalPlayers: this.state.players.map((player) => ({
        id: player.id,
        finalStack: player.stack,
      })),
    });
    this.currentHandHistory.endTime = Date.now();
    this.lastHandHistory = this.cloneHistory(this.currentHandHistory);
    this.currentHandHistory = null;
  }

  private cloneHistory(history: HandHistory): HandHistory {
    return handHistoryFromJSON(handHistoryToJSON(history));
  }

  private cloneHandResult(result: HandResult): HandResult {
    return {
      ...result,
      finalBoard: [...result.finalBoard],
      revealedPlayers: result.revealedPlayers.map((player) => ({
        playerId: player.playerId,
        holeCards: [...player.holeCards] as [Card, Card],
      })),
      pots: result.pots.map((pot) => ({
        ...pot,
        winnerIds: [...pot.winnerIds],
        payouts: pot.payouts.map((payout) => ({ ...payout })),
        winningHand: pot.winningHand
          ? {
              ...pot.winningHand,
              primaryRanks: [...pot.winningHand.primaryRanks],
              kickers: [...pot.winningHand.kickers],
              bestCards: [...pot.winningHand.bestCards],
            }
          : undefined,
      })),
    };
  }

  /** Get the current hand history (hand in progress). */
  getCurrentHandHistory(): HandHistory | null {
    return this.currentHandHistory
      ? this.cloneHistory(this.currentHandHistory)
      : null;
  }

  /** Get the last completed hand history. */
  getLastHandHistory(): HandHistory | null {
    return this.lastHandHistory ? this.cloneHistory(this.lastHandHistory) : null;
  }

  /** Get the structured result of the last completed hand. */
  getLastHandResult(): HandResult | null {
    return this.state.lastHandResult
      ? this.cloneHandResult(this.state.lastHandResult)
      : null;
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
