/**
 * Tests for error handling utilities
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  createError,
  isPokerError,
  PokerError,
} from '../../src/core/errors.js';

describe('Error utilities', () => {
  describe('createError', () => {
    it('should create a PokerError with code and message', () => {
      const error = createError(ErrorCode.INVALID_ACTION, 'Invalid action');

      expect(error.code).toBe(ErrorCode.INVALID_ACTION);
      expect(error.message).toBe('Invalid action');
      expect(error.details).toBeUndefined();
    });

    it('should create a PokerError with details', () => {
      const details = { playerId: 'player1', action: 'FOLD' };
      const error = createError(
        ErrorCode.NOT_PLAYER_TURN,
        'Not your turn',
        details
      );

      expect(error.code).toBe(ErrorCode.NOT_PLAYER_TURN);
      expect(error.message).toBe('Not your turn');
      expect(error.details).toEqual(details);
    });

    it('should create errors for all error codes', () => {
      const testCases = [
        ErrorCode.INVALID_ACTION,
        ErrorCode.INSUFFICIENT_STACK,
        ErrorCode.INVALID_STATE,
        ErrorCode.PLAYER_NOT_FOUND,
        ErrorCode.NOT_PLAYER_TURN,
        ErrorCode.INVALID_BET_AMOUNT,
        ErrorCode.INVALID_RAISE_AMOUNT,
        ErrorCode.TABLE_FULL,
        ErrorCode.TABLE_EMPTY,
        ErrorCode.SEAT_OCCUPIED,
        ErrorCode.INVALID_SEAT,
        ErrorCode.GAME_ALREADY_STARTED,
        ErrorCode.GAME_NOT_STARTED,
        ErrorCode.INVALID_CARD,
        ErrorCode.NOT_ENOUGH_PLAYERS,
        ErrorCode.INTERNAL_ERROR,
      ];

      for (const code of testCases) {
        const error = createError(code, `Test error for ${code}`);
        expect(error.code).toBe(code);
        expect(error.message).toBe(`Test error for ${code}`);
      }
    });
  });

  describe('isPokerError', () => {
    it('should return true for valid PokerError', () => {
      const error = createError(ErrorCode.INVALID_ACTION, 'Invalid action');
      expect(isPokerError(error)).toBe(true);
    });

    it('should return true for PokerError with details', () => {
      const error = createError(
        ErrorCode.INSUFFICIENT_STACK,
        'Not enough chips',
        { required: 100, available: 50 }
      );
      expect(isPokerError(error)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isPokerError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isPokerError(undefined)).toBe(false);
    });

    it('should return false for plain Error', () => {
      const error = new Error('Regular error');
      expect(isPokerError(error)).toBe(false);
    });

    it('should return false for object without code', () => {
      const notError = { message: 'Something wrong' };
      expect(isPokerError(notError)).toBe(false);
    });

    it('should return false for object without message', () => {
      const notError = { code: 'SOMETHING' };
      expect(isPokerError(notError)).toBe(false);
    });

    it('should return false for object with invalid code', () => {
      const notError = { code: 'INVALID_CODE', message: 'Error message' };
      expect(isPokerError(notError)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isPokerError('error string')).toBe(false);
    });

    it('should return false for number', () => {
      expect(isPokerError(123)).toBe(false);
    });

    it('should return false for boolean', () => {
      expect(isPokerError(true)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isPokerError({})).toBe(false);
    });

    it('should work with all error codes', () => {
      const allCodes = Object.values(ErrorCode);

      for (const code of allCodes) {
        const error: PokerError = {
          code: code as ErrorCode,
          message: `Test for ${code}`,
        };
        expect(isPokerError(error)).toBe(true);
      }
    });
  });

  describe('ErrorCode enum', () => {
    it('should have all expected error codes', () => {
      expect(ErrorCode.INVALID_ACTION).toBe('INVALID_ACTION');
      expect(ErrorCode.INSUFFICIENT_STACK).toBe('INSUFFICIENT_STACK');
      expect(ErrorCode.INVALID_STATE).toBe('INVALID_STATE');
      expect(ErrorCode.PLAYER_NOT_FOUND).toBe('PLAYER_NOT_FOUND');
      expect(ErrorCode.NOT_PLAYER_TURN).toBe('NOT_PLAYER_TURN');
      expect(ErrorCode.INVALID_BET_AMOUNT).toBe('INVALID_BET_AMOUNT');
      expect(ErrorCode.INVALID_RAISE_AMOUNT).toBe('INVALID_RAISE_AMOUNT');
      expect(ErrorCode.TABLE_FULL).toBe('TABLE_FULL');
      expect(ErrorCode.TABLE_EMPTY).toBe('TABLE_EMPTY');
      expect(ErrorCode.SEAT_OCCUPIED).toBe('SEAT_OCCUPIED');
      expect(ErrorCode.INVALID_SEAT).toBe('INVALID_SEAT');
      expect(ErrorCode.GAME_ALREADY_STARTED).toBe('GAME_ALREADY_STARTED');
      expect(ErrorCode.GAME_NOT_STARTED).toBe('GAME_NOT_STARTED');
      expect(ErrorCode.INVALID_CARD).toBe('INVALID_CARD');
      expect(ErrorCode.NOT_ENOUGH_PLAYERS).toBe('NOT_ENOUGH_PLAYERS');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });
  });
});
