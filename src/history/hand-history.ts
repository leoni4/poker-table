/**
 * Hand history structure and JSON serialization
 */

import { TableConfig } from '../core/table.js';
import { HandEvent } from './events.js';
import { Card, cardToString, parseCard } from '../core/card.js';
import { ChipAmount } from '../core/money.js';
import { PlayerId, TablePhase } from '../core/table.js';
import { PlayerActionType } from '../betting/actions.js';

/**
 * Complete history of a poker hand
 */
export interface HandHistory {
  /**
   * Hand identifier
   */
  handId: number;

  /**
   * Table configuration at the time of the hand
   */
  tableConfig: TableConfig;

  /**
   * Chronological list of events that occurred during the hand
   */
  events: HandEvent[];

  /**
   * Timestamp when the hand started
   */
  startTime: number;

  /**
   * Timestamp when the hand ended (undefined if hand is still in progress)
   */
  endTime?: number;
}

/**
 * Serializable version of HandHistory for JSON export
 */
export interface SerializableHandHistory {
  handId: number;
  tableConfig: SerializableTableConfig;
  events: SerializableHandEvent[];
  startTime: number;
  endTime?: number;
}

/**
 * Serializable table config (converts bigint to string)
 */
interface SerializableTableConfig {
  minPlayers: number;
  maxPlayers: number;
  smallBlind: string;
  bigBlind: string;
  ante?: string;
  straddle?: string;
  rake?: {
    percentage: number;
    cap: string;
  };
  rngSeed?: number;
}

/**
 * Base serializable event
 */
interface SerializableBaseEvent {
  type: string;
  timestamp: number;
}

/**
 * Serializable HandStartedEvent
 */
interface SerializableHandStartedEvent extends SerializableBaseEvent {
  type: 'HAND_STARTED';
  handId: number;
  dealerSeat: number;
  players: Array<{
    id: PlayerId;
    seat: number;
    stack: string;
  }>;
}

/**
 * Serializable BlindsPostedEvent
 */
interface SerializableBlindsPostedEvent extends SerializableBaseEvent {
  type: 'BLINDS_POSTED';
  smallBlind?: {
    playerId: PlayerId;
    amount: string;
  };
  bigBlind?: {
    playerId: PlayerId;
    amount: string;
  };
  straddle?: {
    playerId: PlayerId;
    amount: string;
  };
  antes?: Array<{
    playerId: PlayerId;
    amount: string;
  }>;
}

/**
 * Serializable CardsDealtEvent
 */
interface SerializableCardsDealtEvent extends SerializableBaseEvent {
  type: 'CARDS_DEALT';
  players: Array<{
    playerId: PlayerId;
    cards: [string, string];
  }>;
}

/**
 * Serializable ActionTakenEvent
 */
interface SerializableActionTakenEvent extends SerializableBaseEvent {
  type: 'ACTION_TAKEN';
  playerId: PlayerId;
  action: PlayerActionType;
  amount?: string;
  allIn?: boolean;
}

/**
 * Serializable StreetEndedEvent
 */
interface SerializableStreetEndedEvent extends SerializableBaseEvent {
  type: 'STREET_ENDED';
  street: TablePhase;
  communityCards: string[];
  potTotal: string;
}

/**
 * Serializable ShowdownEvent
 */
interface SerializableShowdownEvent extends SerializableBaseEvent {
  type: 'SHOWDOWN';
  players: Array<{
    playerId: PlayerId;
    cards?: [string, string];
    mucked?: boolean;
  }>;
}

/**
 * Serializable PotDistributedEvent
 */
interface SerializablePotDistributedEvent extends SerializableBaseEvent {
  type: 'POT_DISTRIBUTED';
  pots: Array<{
    amount: string;
    winners: Array<{
      playerId: PlayerId;
      share: string;
    }>;
  }>;
}

/**
 * Serializable HandEndedEvent
 */
interface SerializableHandEndedEvent extends SerializableBaseEvent {
  type: 'HAND_ENDED';
  handId: number;
  winnersByFold?: boolean;
  finalPlayers: Array<{
    id: PlayerId;
    finalStack: string;
  }>;
}

/**
 * Union type of all serializable events
 */
type SerializableHandEvent =
  | SerializableHandStartedEvent
  | SerializableBlindsPostedEvent
  | SerializableCardsDealtEvent
  | SerializableActionTakenEvent
  | SerializableStreetEndedEvent
  | SerializableShowdownEvent
  | SerializablePotDistributedEvent
  | SerializableHandEndedEvent;

/**
 * Convert ChipAmount (bigint) to string for JSON serialization
 */
function serializeChipAmount(amount: ChipAmount): string {
  return amount.toString();
}

/**
 * Convert string back to ChipAmount (bigint)
 */
function deserializeChipAmount(amount: string): ChipAmount {
  return BigInt(amount);
}

/**
 * Serialize table config
 */
function serializeTableConfig(config: TableConfig): SerializableTableConfig {
  return {
    minPlayers: config.minPlayers,
    maxPlayers: config.maxPlayers,
    smallBlind: serializeChipAmount(config.smallBlind),
    bigBlind: serializeChipAmount(config.bigBlind),
    ante: config.ante ? serializeChipAmount(config.ante) : undefined,
    straddle: config.straddle
      ? serializeChipAmount(config.straddle)
      : undefined,
    rake: config.rake
      ? {
          percentage: config.rake.percentage,
          cap: serializeChipAmount(config.rake.cap),
        }
      : undefined,
    rngSeed: config.rngSeed,
  };
}

/**
 * Deserialize table config
 */
function deserializeTableConfig(config: SerializableTableConfig): TableConfig {
  return {
    minPlayers: config.minPlayers,
    maxPlayers: config.maxPlayers,
    smallBlind: deserializeChipAmount(config.smallBlind),
    bigBlind: deserializeChipAmount(config.bigBlind),
    ante: config.ante ? deserializeChipAmount(config.ante) : undefined,
    straddle: config.straddle
      ? deserializeChipAmount(config.straddle)
      : undefined,
    rake: config.rake
      ? {
          percentage: config.rake.percentage,
          cap: deserializeChipAmount(config.rake.cap),
        }
      : undefined,
    rngSeed: config.rngSeed,
  };
}

/**
 * Serialize a single event
 */
function serializeEvent(event: HandEvent): SerializableHandEvent {
  const base = {
    timestamp: event.timestamp,
  };

  switch (event.type) {
    case 'HAND_STARTED':
      return {
        ...base,
        type: 'HAND_STARTED',
        handId: event.handId,
        dealerSeat: event.dealerSeat,
        players: event.players.map((p) => ({
          id: p.id,
          seat: p.seat,
          stack: serializeChipAmount(p.stack),
        })),
      };

    case 'BLINDS_POSTED': {
      const serialized: SerializableBlindsPostedEvent = {
        ...base,
        type: 'BLINDS_POSTED',
      };
      if (event.smallBlind) {
        serialized.smallBlind = {
          playerId: event.smallBlind.playerId,
          amount: serializeChipAmount(event.smallBlind.amount),
        };
      }
      if (event.bigBlind) {
        serialized.bigBlind = {
          playerId: event.bigBlind.playerId,
          amount: serializeChipAmount(event.bigBlind.amount),
        };
      }
      if (event.straddle) {
        serialized.straddle = {
          playerId: event.straddle.playerId,
          amount: serializeChipAmount(event.straddle.amount),
        };
      }
      if (event.antes) {
        serialized.antes = event.antes.map((a) => ({
          playerId: a.playerId,
          amount: serializeChipAmount(a.amount),
        }));
      }
      return serialized;
    }

    case 'CARDS_DEALT':
      return {
        ...base,
        type: 'CARDS_DEALT',
        players: event.players.map((p) => ({
          playerId: p.playerId,
          cards: [cardToString(p.cards[0]), cardToString(p.cards[1])],
        })),
      };

    case 'ACTION_TAKEN': {
      const serialized: SerializableActionTakenEvent = {
        ...base,
        type: 'ACTION_TAKEN',
        playerId: event.playerId,
        action: event.action,
      };
      if (event.amount !== undefined) {
        serialized.amount = serializeChipAmount(event.amount);
      }
      if (event.allIn !== undefined) {
        serialized.allIn = event.allIn;
      }
      return serialized;
    }

    case 'STREET_ENDED':
      return {
        ...base,
        type: 'STREET_ENDED',
        street: event.street,
        communityCards: event.communityCards.map(cardToString),
        potTotal: serializeChipAmount(event.potTotal),
      };

    case 'SHOWDOWN':
      return {
        ...base,
        type: 'SHOWDOWN',
        players: event.players.map((p) => ({
          playerId: p.playerId,
          cards: p.cards
            ? [cardToString(p.cards[0]), cardToString(p.cards[1])]
            : undefined,
          mucked: p.mucked,
        })),
      };

    case 'POT_DISTRIBUTED':
      return {
        ...base,
        type: 'POT_DISTRIBUTED',
        pots: event.pots.map((pot) => ({
          amount: serializeChipAmount(pot.amount),
          winners: pot.winners.map((w) => ({
            playerId: w.playerId,
            share: serializeChipAmount(w.share),
          })),
        })),
      };

    case 'HAND_ENDED':
      return {
        ...base,
        type: 'HAND_ENDED',
        handId: event.handId,
        winnersByFold: event.winnersByFold,
        finalPlayers: event.finalPlayers.map((p) => ({
          id: p.id,
          finalStack: serializeChipAmount(p.finalStack),
        })),
      };
  }
}

/**
 * Deserialize a single event
 */
function deserializeEvent(serialized: SerializableHandEvent): HandEvent {
  const base = {
    timestamp: serialized.timestamp,
  };

  switch (serialized.type) {
    case 'HAND_STARTED':
      return {
        ...base,
        type: 'HAND_STARTED',
        handId: serialized.handId,
        dealerSeat: serialized.dealerSeat,
        players: serialized.players.map((p) => ({
          id: p.id,
          seat: p.seat,
          stack: deserializeChipAmount(p.stack),
        })),
      };

    case 'BLINDS_POSTED': {
      const event: {
        type: 'BLINDS_POSTED';
        timestamp: number;
        smallBlind?: { playerId: PlayerId; amount: ChipAmount };
        bigBlind?: { playerId: PlayerId; amount: ChipAmount };
        straddle?: { playerId: PlayerId; amount: ChipAmount };
        antes?: Array<{ playerId: PlayerId; amount: ChipAmount }>;
      } = {
        ...base,
        type: 'BLINDS_POSTED',
      };
      if (serialized.smallBlind) {
        event.smallBlind = {
          playerId: serialized.smallBlind.playerId,
          amount: deserializeChipAmount(serialized.smallBlind.amount),
        };
      }
      if (serialized.bigBlind) {
        event.bigBlind = {
          playerId: serialized.bigBlind.playerId,
          amount: deserializeChipAmount(serialized.bigBlind.amount),
        };
      }
      if (serialized.straddle) {
        event.straddle = {
          playerId: serialized.straddle.playerId,
          amount: deserializeChipAmount(serialized.straddle.amount),
        };
      }
      if (serialized.antes) {
        event.antes = serialized.antes.map((a) => ({
          playerId: a.playerId,
          amount: deserializeChipAmount(a.amount),
        }));
      }
      return event;
    }

    case 'CARDS_DEALT':
      return {
        ...base,
        type: 'CARDS_DEALT',
        players: serialized.players.map((p) => ({
          playerId: p.playerId,
          cards: [parseCard(p.cards[0]), parseCard(p.cards[1])] as [Card, Card],
        })),
      };

    case 'ACTION_TAKEN': {
      const event: {
        type: 'ACTION_TAKEN';
        timestamp: number;
        playerId: PlayerId;
        action: PlayerActionType;
        amount?: ChipAmount;
        allIn?: boolean;
      } = {
        ...base,
        type: 'ACTION_TAKEN',
        playerId: serialized.playerId,
        action: serialized.action,
      };
      if (serialized.amount !== undefined) {
        event.amount = deserializeChipAmount(serialized.amount);
      }
      if (serialized.allIn !== undefined) {
        event.allIn = serialized.allIn;
      }
      return event;
    }

    case 'STREET_ENDED':
      return {
        ...base,
        type: 'STREET_ENDED',
        street: serialized.street,
        communityCards: serialized.communityCards.map(parseCard),
        potTotal: deserializeChipAmount(serialized.potTotal),
      };

    case 'SHOWDOWN':
      return {
        ...base,
        type: 'SHOWDOWN',
        players: serialized.players.map((p) => ({
          playerId: p.playerId,
          cards: p.cards
            ? ([parseCard(p.cards[0]), parseCard(p.cards[1])] as [Card, Card])
            : undefined,
          mucked: p.mucked,
        })),
      };

    case 'POT_DISTRIBUTED':
      return {
        ...base,
        type: 'POT_DISTRIBUTED',
        pots: serialized.pots.map((pot) => ({
          amount: deserializeChipAmount(pot.amount),
          winners: pot.winners.map((w) => ({
            playerId: w.playerId,
            share: deserializeChipAmount(w.share),
          })),
        })),
      };

    case 'HAND_ENDED':
      return {
        ...base,
        type: 'HAND_ENDED',
        handId: serialized.handId,
        winnersByFold: serialized.winnersByFold,
        finalPlayers: serialized.finalPlayers.map((p) => ({
          id: p.id,
          finalStack: deserializeChipAmount(p.finalStack),
        })),
      };
  }
}

/**
 * Convert HandHistory to JSON string
 */
export function handHistoryToJSON(history: HandHistory): string {
  const serializable: SerializableHandHistory = {
    handId: history.handId,
    tableConfig: serializeTableConfig(history.tableConfig),
    events: history.events.map(serializeEvent),
    startTime: history.startTime,
    endTime: history.endTime,
  };

  return JSON.stringify(serializable, null, 2);
}

/**
 * Reconstruct HandHistory from JSON string
 */
export function handHistoryFromJSON(json: string): HandHistory {
  const serialized: SerializableHandHistory = JSON.parse(
    json
  ) as SerializableHandHistory;

  return {
    handId: serialized.handId,
    tableConfig: deserializeTableConfig(serialized.tableConfig),
    events: serialized.events.map(deserializeEvent),
    startTime: serialized.startTime,
    endTime: serialized.endTime,
  };
}

/**
 * Create an empty hand history
 */
export function createHandHistory(
  handId: number,
  tableConfig: TableConfig
): HandHistory {
  return {
    handId,
    tableConfig,
    events: [],
    startTime: Date.now(),
  };
}
