/**
 * Event types for hand history tracking
 */

import { Card } from '../core/card.js';
import { ChipAmount } from '../core/money.js';
import { PlayerId, TablePhase } from '../core/table.js';
import { PlayerActionType } from '../betting/actions.js';

/**
 * Base event structure with timestamp
 */
export interface BaseEvent {
  type: string;
  timestamp: number;
}

/**
 * Hand started event
 */
export interface HandStartedEvent extends BaseEvent {
  type: 'HAND_STARTED';
  handId: number;
  dealerSeat: number;
  players: Array<{
    id: PlayerId;
    seat: number;
    stack: ChipAmount;
  }>;
}

/**
 * Blinds and antes posted event
 */
export interface BlindsPostedEvent extends BaseEvent {
  type: 'BLINDS_POSTED';
  smallBlind?: {
    playerId: PlayerId;
    amount: ChipAmount;
  };
  bigBlind?: {
    playerId: PlayerId;
    amount: ChipAmount;
  };
  straddle?: {
    playerId: PlayerId;
    amount: ChipAmount;
  };
  antes?: Array<{
    playerId: PlayerId;
    amount: ChipAmount;
  }>;
}

/**
 * Hole cards dealt event
 */
export interface CardsDealtEvent extends BaseEvent {
  type: 'CARDS_DEALT';
  players: Array<{
    playerId: PlayerId;
    cards: [Card, Card];
  }>;
}

/**
 * Player action taken event
 */
export interface ActionTakenEvent extends BaseEvent {
  type: 'ACTION_TAKEN';
  playerId: PlayerId;
  action: PlayerActionType;
  amount?: ChipAmount;
  allIn?: boolean;
}

/**
 * Street ended and community cards dealt event
 */
export interface StreetEndedEvent extends BaseEvent {
  type: 'STREET_ENDED';
  street: TablePhase;
  communityCards: Card[];
  potTotal: ChipAmount;
}

/**
 * Showdown event
 */
export interface ShowdownEvent extends BaseEvent {
  type: 'SHOWDOWN';
  players: Array<{
    playerId: PlayerId;
    cards?: [Card, Card];
    mucked?: boolean;
  }>;
}

/**
 * Pot distributed event
 */
export interface PotDistributedEvent extends BaseEvent {
  type: 'POT_DISTRIBUTED';
  pots: Array<{
    amount: ChipAmount;
    winners: Array<{
      playerId: PlayerId;
      share: ChipAmount;
    }>;
  }>;
}

/**
 * Hand ended event
 */
export interface HandEndedEvent extends BaseEvent {
  type: 'HAND_ENDED';
  handId: number;
  winnersByFold?: boolean;
  finalPlayers: Array<{
    id: PlayerId;
    finalStack: ChipAmount;
  }>;
}

/**
 * Union type of all possible hand events
 */
export type HandEvent =
  | HandStartedEvent
  | BlindsPostedEvent
  | CardsDealtEvent
  | ActionTakenEvent
  | StreetEndedEvent
  | ShowdownEvent
  | PotDistributedEvent
  | HandEndedEvent;

/**
 * Type guard for HandStartedEvent
 */
export function isHandStartedEvent(
  event: HandEvent
): event is HandStartedEvent {
  return event.type === 'HAND_STARTED';
}

/**
 * Type guard for BlindsPostedEvent
 */
export function isBlindsPostedEvent(
  event: HandEvent
): event is BlindsPostedEvent {
  return event.type === 'BLINDS_POSTED';
}

/**
 * Type guard for CardsDealtEvent
 */
export function isCardsDealtEvent(event: HandEvent): event is CardsDealtEvent {
  return event.type === 'CARDS_DEALT';
}

/**
 * Type guard for ActionTakenEvent
 */
export function isActionTakenEvent(
  event: HandEvent
): event is ActionTakenEvent {
  return event.type === 'ACTION_TAKEN';
}

/**
 * Type guard for StreetEndedEvent
 */
export function isStreetEndedEvent(
  event: HandEvent
): event is StreetEndedEvent {
  return event.type === 'STREET_ENDED';
}

/**
 * Type guard for ShowdownEvent
 */
export function isShowdownEvent(event: HandEvent): event is ShowdownEvent {
  return event.type === 'SHOWDOWN';
}

/**
 * Type guard for PotDistributedEvent
 */
export function isPotDistributedEvent(
  event: HandEvent
): event is PotDistributedEvent {
  return event.type === 'POT_DISTRIBUTED';
}

/**
 * Type guard for HandEndedEvent
 */
export function isHandEndedEvent(event: HandEvent): event is HandEndedEvent {
  return event.type === 'HAND_ENDED';
}
