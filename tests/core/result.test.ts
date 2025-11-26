import { describe, it, expect } from 'vitest';
import {
  Result,
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
  orElse,
} from '../../src/index.js';

describe('Result type', () => {
  describe('Creating Results', () => {
    it('should create Ok result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it('should create Err result', () => {
      const result = err('error message');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('error message');
      }
    });

    it('should create Ok with different types', () => {
      const stringResult = ok('hello');
      const numberResult = ok(123);
      const objectResult = ok({ key: 'value' });

      expect(stringResult.ok).toBe(true);
      expect(numberResult.ok).toBe(true);
      expect(objectResult.ok).toBe(true);
    });

    it('should create Err with different error types', () => {
      const stringErr = err('string error');
      const numberErr = err(404);
      const objectErr = err({ code: 'ERROR', message: 'Something went wrong' });

      expect(stringErr.ok).toBe(false);
      expect(numberErr.ok).toBe(false);
      expect(objectErr.ok).toBe(false);
    });
  });

  describe('Type guards', () => {
    it('should correctly identify Ok results', () => {
      const result = ok(42);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('should correctly identify Err results', () => {
      const result = err('error');
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
    });

    it('should narrow types correctly', () => {
      const result: Result<number, string> = ok(42);

      if (isOk(result)) {
        // TypeScript should know result.value exists here
        expect(result.value).toBe(42);
      }

      const errorResult: Result<number, string> = err('error');
      if (isErr(errorResult)) {
        // TypeScript should know errorResult.error exists here
        expect(errorResult.error).toBe('error');
      }
    });
  });

  describe('unwrap', () => {
    it('should unwrap Ok value', () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it('should throw on Err', () => {
      const result = err('error message');
      expect(() => unwrap(result)).toThrow();
    });

    it('should include error in thrown message', () => {
      const result = err({ code: 'TEST_ERROR' });
      expect(() => unwrap(result)).toThrow(/TEST_ERROR/);
    });
  });

  describe('unwrapOr', () => {
    it('should return value for Ok', () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    it('should return default for Err', () => {
      const result = err('error');
      expect(unwrapOr(result, 0)).toBe(0);
    });

    it('should work with different types', () => {
      const okResult = ok('success');
      const errResult: Result<string, string> = err('error');

      expect(unwrapOr(okResult, 'default')).toBe('success');
      expect(unwrapOr(errResult, 'default')).toBe('default');
    });
  });

  describe('map', () => {
    it('should map Ok value', () => {
      const result = ok(42);
      const mapped = map(result, (x) => x * 2);

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe(84);
      }
    });

    it('should not map Err', () => {
      const result: Result<number, string> = err('error');
      const mapped = map(result, (x) => x * 2);

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBe('error');
      }
    });

    it('should allow changing value type', () => {
      const result = ok(42);
      const mapped = map(result, (x) => `Value: ${x}`);

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe('Value: 42');
      }
    });
  });

  describe('mapErr', () => {
    it('should not map Ok value', () => {
      const result = ok(42);
      const mapped = mapErr(result, (e) => `Error: ${e as string}`);

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe(42);
      }
    });

    it('should map Err value', () => {
      const result: Result<number, string> = err('original error');
      const mapped = mapErr(result, (e) => `Transformed: ${e}`);

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBe('Transformed: original error');
      }
    });

    it('should allow changing error type', () => {
      const result: Result<number, string> = err('error');
      const mapped = mapErr(result, (e) => ({ message: e, code: 500 }));

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toEqual({ message: 'error', code: 500 });
      }
    });
  });

  describe('andThen', () => {
    it('should chain Ok results', () => {
      const result = ok(42);
      const chained = andThen(result, (x) => ok(x * 2));

      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.value).toBe(84);
      }
    });

    it('should stop at first Err', () => {
      const result = ok(42);
      const chained = andThen(result, () => err('error'));

      expect(isErr(chained)).toBe(true);
      if (isErr(chained)) {
        expect(chained.error).toBe('error');
      }
    });

    it('should not execute function for Err', () => {
      let executed = false;
      const result: Result<number, string> = err('error');
      const chained = andThen(result, () => {
        executed = true;
        return ok(100);
      });

      expect(executed).toBe(false);
      expect(isErr(chained)).toBe(true);
    });

    it('should allow changing value type', () => {
      const result: Result<number, string> = ok(42);
      const chained: Result<string, string> = andThen(result, (x: number) =>
        ok('Number: ' + String(x))
      );

      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.value).toBe('Number: 42');
      }
    });
  });

  describe('orElse', () => {
    it('should not execute function for Ok', () => {
      let executed = false;
      const result = ok(42);
      const alternative = orElse(result, () => {
        executed = true;
        return ok(0);
      });

      expect(executed).toBe(false);
      expect(isOk(alternative)).toBe(true);
      if (isOk(alternative)) {
        expect(alternative.value).toBe(42);
      }
    });

    it('should provide alternative for Err', () => {
      const result: Result<number, string> = err('error');
      const alternative = orElse(result, () => ok(0));

      expect(isOk(alternative)).toBe(true);
      if (isOk(alternative)) {
        expect(alternative.value).toBe(0);
      }
    });

    it('should allow transforming error', () => {
      const result: Result<number, string> = err('original');
      const alternative = orElse(result, (e) => err(`Transformed: ${e}`));

      expect(isErr(alternative)).toBe(true);
      if (isErr(alternative)) {
        expect(alternative.error).toBe('Transformed: original');
      }
    });

    it('should allow changing error type', () => {
      const result: Result<number, string> = err('error');
      const alternative = orElse(result, (e) => err({ message: e, code: 500 }));

      expect(isErr(alternative)).toBe(true);
      if (isErr(alternative)) {
        expect(alternative.error).toEqual({ message: 'error', code: 500 });
      }
    });
  });

  describe('Complex chaining', () => {
    it('should chain multiple operations', () => {
      const result = ok(10);
      const final = andThen(
        andThen(result, (x) => ok(x * 2)),
        (x) => ok(x + 5)
      );

      expect(isOk(final)).toBe(true);
      if (isOk(final)) {
        expect(final.value).toBe(25);
      }
    });

    it('should combine map and andThen', () => {
      const result: Result<number, string> = ok(5);
      const mapped = map(result, (x) => x * 2);
      const chained: Result<string, string> = andThen(mapped, (x) =>
        ok(String(x))
      );

      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.value).toBe('10');
      }
    });

    it('should handle error recovery with orElse', () => {
      const result: Result<number, string> = err('initial error');
      const recovered = orElse(result, () => ok(42));
      const mapped = map(recovered, (x) => x * 2);

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe(84);
      }
    });
  });
});
