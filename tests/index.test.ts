import { describe, it, expect } from 'vitest';
import {
  createCard,
  cardToString,
  isValidRank,
  isValidSuit,
  type Card,
} from '../src/index.js';

describe('Card functionality', () => {
  it('should create a card with rank and suit', () => {
    const card = createCard('A', 'spades');
    expect(card.rank).toBe('A');
    expect(card.suit).toBe('spades');
  });

  it('should convert card to string representation', () => {
    const card: Card = { rank: 'K', suit: 'hearts' };
    expect(cardToString(card)).toBe('KH');
  });

  it('should convert numbered card to string representation', () => {
    const card: Card = { rank: '10', suit: 'diamonds' };
    expect(cardToString(card)).toBe('10D');
  });

  it('should validate correct ranks', () => {
    expect(isValidRank('A')).toBe(true);
    expect(isValidRank('K')).toBe(true);
    expect(isValidRank('2')).toBe(true);
    expect(isValidRank('10')).toBe(true);
  });

  it('should reject invalid ranks', () => {
    expect(isValidRank('1')).toBe(false);
    expect(isValidRank('Z')).toBe(false);
    expect(isValidRank('11')).toBe(false);
  });

  it('should validate correct suits', () => {
    expect(isValidSuit('hearts')).toBe(true);
    expect(isValidSuit('diamonds')).toBe(true);
    expect(isValidSuit('clubs')).toBe(true);
    expect(isValidSuit('spades')).toBe(true);
  });

  it('should reject invalid suits', () => {
    expect(isValidSuit('invalid')).toBe(false);
    expect(isValidSuit('red')).toBe(false);
    expect(isValidSuit('')).toBe(false);
  });
});
