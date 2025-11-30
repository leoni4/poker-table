/**
 * Hand history structure and JSON serialization
 */

import { TableConfig } from '../core/table.js';
import { HandEvent } from './events.js';
import { Card, cardToString, parseCard } from '../core/card.js';
import { ChipAmount } from '../core/money.js';

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
 * Serializable event (converts bigint and Card to strings)
 */
type SerializableHandEvent = {
  [K in keyof HandEvent]: HandEvent[K] extends ChipAmount
    ? string
    : HandEvent[K] extends Card
      ? string
      : HandEvent[K] extends Array<infer U>
        ? U extends Card
          ? string[]
          : U extends { amount: ChipAmount }
            ? Array<Omit<U, 'amount'> & { amount: string }>
            : U extends { cards: [Card, Card] }
              ? Array<Omit<U, 'cards'> & { cards: [string, string] }>
              : U extends { communityCards: Card[] }
                ? Array<
                    Omit<U, 'communityCards'> & { communityCards: string[] }
                  >
                : U extends { stack: ChipAmount }
                  ? Array<Omit<U, 'stack'> & { stack: string }>
                  : U extends { finalStack: ChipAmount }
                    ? Array<Omit<U, 'finalStack'> & { finalStack: string }>
                    : HandEvent[K]
        : HandEvent[K] extends { cards: [Card, Card] } | undefined
          ?
              | (Omit<NonNullable<HandEvent[K]>, 'cards'> & {
                  cards: [string, string];
                })
              | undefined
          : HandEvent[K];
};

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
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
function serializeEvent(event: HandEvent): any {
  const serialized: any = {
    type: event.type,
    timestamp: event.timestamp,
  };

  switch (event.type) {
    case 'HAND_STARTED':
      serialized.handId = event.handId;
      serialized.dealerSeat = event.dealerSeat;
      serialized.players = event.players.map((p) => ({
        id: p.id,
        seat: p.seat,
        stack: serializeChipAmount(p.stack),
      }));
      break;

    case 'BLINDS_POSTED':
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
      break;

    case 'CARDS_DEALT':
      serialized.players = event.players.map((p) => ({
        playerId: p.playerId,
        cards: [cardToString(p.cards[0]), cardToString(p.cards[1])],
      }));
      break;

    case 'ACTION_TAKEN':
      serialized.playerId = event.playerId;
      serialized.action = event.action;
      if (event.amount !== undefined) {
        serialized.amount = serializeChipAmount(event.amount);
      }
      if (event.allIn !== undefined) {
        serialized.allIn = event.allIn;
      }
      break;

    case 'STREET_ENDED':
      serialized.street = event.street;
      serialized.communityCards = event.communityCards.map(cardToString);
      serialized.potTotal = serializeChipAmount(event.potTotal);
      break;

    case 'SHOWDOWN':
      serialized.players = event.players.map((p) => ({
        playerId: p.playerId,
        cards: p.cards
          ? [cardToString(p.cards[0]), cardToString(p.cards[1])]
          : undefined,
        mucked: p.mucked,
      }));
      break;

    case 'POT_DISTRIBUTED':
      serialized.pots = event.pots.map((pot) => ({
        amount: serializeChipAmount(pot.amount),
        winners: pot.winners.map((w) => ({
          playerId: w.playerId,
          share: serializeChipAmount(w.share),
        })),
      }));
      break;

    case 'HAND_ENDED':
      serialized.handId = event.handId;
      serialized.winnersByFold = event.winnersByFold;
      serialized.finalPlayers = event.finalPlayers.map((p) => ({
        id: p.id,
        finalStack: serializeChipAmount(p.finalStack),
      }));
      break;
  }

  return serialized;
}

/**
 * Deserialize a single event
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
function deserializeEvent(serialized: any): HandEvent {
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
        players: serialized.players.map((p: any) => ({
          id: p.id,
          seat: p.seat,
          stack: deserializeChipAmount(p.stack),
        })),
      };

    case 'BLINDS_POSTED': {
      const event: any = { ...base, type: 'BLINDS_POSTED' };
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
        event.antes = serialized.antes.map((a: any) => ({
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
        players: serialized.players.map((p: any) => ({
          playerId: p.playerId,
          cards: [parseCard(p.cards[0]), parseCard(p.cards[1])] as [Card, Card],
        })),
      };

    case 'ACTION_TAKEN': {
      const event: any = {
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
        players: serialized.players.map((p: any) => ({
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
        pots: serialized.pots.map((pot: any) => ({
          amount: deserializeChipAmount(pot.amount),
          winners: pot.winners.map((w: any) => ({
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
        finalPlayers: serialized.finalPlayers.map((p: any) => ({
          id: p.id,
          finalStack: deserializeChipAmount(p.finalStack),
        })),
      };

    default:
      throw new Error(`Unknown event type: ${serialized.type}`);
  }
}

/**
 * Convert HandHistory to JSON string
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
  const serialized: SerializableHandHistory = JSON.parse(json);

  return {
    handId: serialized.handId,
    tableConfig: deserializeTableConfig(serialized.tableConfig),
    events: serialized.events.map(deserializeEvent),
    startTime: serialized.startTime,
    endTime: serialized.endTime,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

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
