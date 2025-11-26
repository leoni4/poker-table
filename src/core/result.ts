/**
 * Result type for error handling without exceptions
 */

/**
 * Success variant of Result
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Failure variant of Result
 */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Result type representing either success (Ok) or failure (Err)
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Creates a successful Result
 */
export function ok<T, E = never>(value: T): Result<T, E> {
  return { ok: true, value };
}

/**
 * Creates a failed Result
 */
export function err<E, T = never>(error: E): Result<T, E> {
  return { ok: false, error };
}

/**
 * Type guard to check if Result is Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/**
 * Type guard to check if Result is Err
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Unwraps a Result, returning the value if Ok or throwing if Err
 * @throws Error if Result is Err
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(
    `Called unwrap on an Err value: ${JSON.stringify(result.error)}`
  );
}

/**
 * Unwraps a Result, returning the value if Ok or the default value if Err
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/**
 * Maps a Result<T, E> to Result<U, E> by applying a function to the Ok value
 */
export function map<T, E, U>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Maps a Result<T, E> to Result<T, F> by applying a function to the Err value
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/**
 * Chains Result operations (flatMap)
 */
export function andThen<T, E, U>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Returns the result if Ok, otherwise returns the alternative
 */
export function orElse<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => Result<T, F>
): Result<T, F> {
  return result.ok ? result : fn(result.error);
}
