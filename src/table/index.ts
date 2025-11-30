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
import { Deck, createShuffledDeck } from '../deck/deck.js';
import { createRngFromConfig } from '../rng/factory.js';
import {
  PlayerAction,
  applyActionToBettingRound,
  isBettingRoundComplete,
} from '../betting/index.js';
import { HandHistory } from '../history/index.js';

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
  private deck: Deck | null = null;
  private currentHandHistory: HandHistory | null = null;
  private lastHandHistory: HandHistory | null = null;

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
   * Start a complete hand including deck creation, card dealing, and blind posting
   * @returns Result with updated table state or error
   */
  startHand(): Result<TableState, TableError> {
    // First, post blinds using existing method
    const blindResult = this.startNewHand();
    if (!blindResult.ok) {
      return blindResult;
    }

    // Create and shuffle deck
    const rng = createRngFromConfig(this.config);
    this.deck = createShuffledDeck(rng);

    // Deal hole cards to active players
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

    // Assign hole cards to players
    activePlayersWithCards.forEach((player, index) => {
      player.holeCards = { cards: holeCardsResult.value[index] };
    });

    return ok(this.getState());
  }

  /**
   * Start a new hand by posting blinds, antes, and straddle
   * @returns Result with updated table state or error
   */
  startNewHand(): Result<TableState, TableError> {
    // Validate minimum players
    const activePlayers = this.state.players.filter(
      (p) => p.status === PlayerStatus.Active || p.status === PlayerStatus.AllIn
    );

    if (activePlayers.length < this.config.minPlayers) {
      return err(
        createError(
          ErrorCode.NOT_ENOUGH_PLAYERS,
          `Not enough players. Minimum: ${this.config.minPlayers}, Current: ${activePlayers.length}`
        )
      );
    }

    // Only start from idle phase
    if (this.state.phase !== TablePhase.Idle) {
      return err(
        createError(
          ErrorCode.INVALID_STATE,
          'Cannot start new hand: hand already in progress'
        )
      );
    }

    // Move dealer button
    this.moveDealerButton();

    // Reset player states for new hand
    for (const player of this.state.players) {
      player.committed = 0n;
      if (
        player.status === PlayerStatus.Active ||
        player.status === PlayerStatus.AllIn
      ) {
        player.status = PlayerStatus.Active;
      }
      player.holeCards = {};
    }

    // Clear pots
    this.state.pots = [];

    // Post antes if configured
    if (this.config.ante) {
      this.postAntes();
    }

    // Post blinds
    this.postBlinds();

    // Post straddle if configured
    if (this.config.straddle) {
      this.postStraddle();
    }

    // Create initial pot
    const totalCommitted = this.state.players.reduce(
      (sum, p) => sum + p.committed,
      0n
    );
    if (totalCommitted > 0n) {
      this.state.pots = [
        {
          total: totalCommitted,
          participants: this.state.players
            .filter((p) => p.committed > 0n)
            .map((p) => p.id),
        },
      ];
    }

    // Set phase to preflop
    this.state.phase = TablePhase.Preflop;

    // Increment hand ID
    this.state.handId++;

    // Set first player to act (after BB or straddle)
    this.setFirstToAct();

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

  /**
   * Post antes for all active players
   * @private
   */
  private postAntes(): void {
    if (!this.config.ante) {
      return;
    }

    for (const player of this.state.players) {
      if (player.status === PlayerStatus.Active) {
        this.deductFromPlayer(player, this.config.ante);
      }
    }
  }

  /**
   * Post small blind and big blind
   * @private
   */
  private postBlinds(): void {
    if (this.state.dealerSeat === undefined) {
      return;
    }

    const activePlayers = this.state.players.filter(
      (p) => p.status === PlayerStatus.Active
    );

    if (activePlayers.length < 2) {
      return;
    }

    // Heads-up (2 players): dealer posts SB, other player posts BB
    if (activePlayers.length === 2) {
      const dealerPlayer = this.getPlayerAtSeat(this.state.dealerSeat);
      const bbSeat = this.getNextActiveSeat(this.state.dealerSeat);
      const bbPlayer = this.getPlayerAtSeat(bbSeat);

      if (dealerPlayer) {
        this.deductFromPlayer(dealerPlayer, this.config.smallBlind);
      }
      if (bbPlayer) {
        this.deductFromPlayer(bbPlayer, this.config.bigBlind);
      }
    } else {
      // Multi-way: SB is next after dealer, BB is next after SB
      const sbSeat = this.getNextActiveSeat(this.state.dealerSeat);
      const bbSeat = this.getNextActiveSeat(sbSeat);

      const sbPlayer = this.getPlayerAtSeat(sbSeat);
      const bbPlayer = this.getPlayerAtSeat(bbSeat);

      if (sbPlayer) {
        this.deductFromPlayer(sbPlayer, this.config.smallBlind);
      }
      if (bbPlayer) {
        this.deductFromPlayer(bbPlayer, this.config.bigBlind);
      }
    }
  }

  /**
   * Post straddle (optional, by player after BB)
   * @private
   */
  private postStraddle(): void {
    if (!this.config.straddle || this.state.dealerSeat === undefined) {
      return;
    }

    const activePlayers = this.state.players.filter(
      (p) => p.status === PlayerStatus.Active
    );

    if (activePlayers.length < 3) {
      // Straddle only makes sense with 3+ players
      return;
    }

    // Straddle is posted by player after BB
    const sbSeat = this.getNextActiveSeat(this.state.dealerSeat);
    const bbSeat = this.getNextActiveSeat(sbSeat);
    const straddleSeat = this.getNextActiveSeat(bbSeat);

    const straddlePlayer = this.getPlayerAtSeat(straddleSeat);
    if (straddlePlayer) {
      this.deductFromPlayer(straddlePlayer, this.config.straddle);
    }
  }

  /**
   * Deduct amount from player's stack, handling insufficient stack
   * @private
   */
  private deductFromPlayer(player: PlayerState, amount: ChipAmount): void {
    if (player.stack > amount) {
      // Player has enough chips with some left over
      player.stack -= amount;
      player.committed += amount;
    } else if (player.stack === amount) {
      // Player has exactly enough - post it all
      player.committed += amount;
      player.stack = 0n;
      player.status = PlayerStatus.AllIn;
    } else {
      // Player doesn't have enough - goes all-in with whatever they have
      player.committed += player.stack;
      player.stack = 0n;
      player.status = PlayerStatus.AllIn;
    }
  }

  /**
   * Set the first player to act in preflop
   * @private
   */
  private setFirstToAct(): void {
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

    // Find the player after the last posted blind/straddle
    let firstToActSeat: number;

    if (this.config.straddle && activePlayers.length >= 3) {
      // Action starts after straddle
      const sbSeat = this.getNextActiveSeat(this.state.dealerSeat);
      const bbSeat = this.getNextActiveSeat(sbSeat);
      const straddleSeat = this.getNextActiveSeat(bbSeat);
      firstToActSeat = this.getNextActiveSeat(straddleSeat);
    } else if (activePlayers.length === 2) {
      // Heads-up: dealer (who posted SB) acts first
      firstToActSeat = this.state.dealerSeat;
    } else {
      // Multi-way: action starts after BB
      const sbSeat = this.getNextActiveSeat(this.state.dealerSeat);
      const bbSeat = this.getNextActiveSeat(sbSeat);
      firstToActSeat = this.getNextActiveSeat(bbSeat);
    }

    const firstPlayer = this.getPlayerAtSeat(firstToActSeat);
    this.state.currentPlayerId = firstPlayer?.id;
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

    // Check if betting round is complete
    if (isBettingRoundComplete(this.state)) {
      // Check if only one player remains (all others folded)
      const activePlayers = this.state.players.filter(
        (p) =>
          p.status === PlayerStatus.Active || p.status === PlayerStatus.AllIn
      );

      if (activePlayers.length <= 1) {
        // Hand is over, transition to showdown/completion
        this.state.phase = TablePhase.Showdown;
        this.state.currentPlayerId = undefined;
        return ok(this.getState());
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

    // Set first to act for new betting round (after dealer)
    this.setFirstToActPostFlop();

    return ok(this.getState());
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

  /**
   * Get the current hand history (hand in progress)
   * @returns Current hand history or null if no hand is active
   */
  getCurrentHandHistory(): HandHistory | null {
    return this.currentHandHistory;
  }

  /**
   * Get the last completed hand history
   * @returns Last hand history or null if no hands have been completed
   */
  getLastHandHistory(): HandHistory | null {
    return this.lastHandHistory;
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
