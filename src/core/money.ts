/**
 * Money and chip types for poker engine
 * Uses integer-based smallest units (chips) for precision
 */

/**
 * Represents an amount of chips as an integer
 * Always represents the smallest unit (1 chip)
 */
export type ChipAmount = bigint;

/**
 * Creates a ChipAmount from a number
 */
export function chips(amount: number | bigint): ChipAmount {
  return BigInt(amount);
}

/**
 * Adds two chip amounts
 */
export function addChips(a: ChipAmount, b: ChipAmount): ChipAmount {
  return a + b;
}

/**
 * Subtracts chip amount b from a
 */
export function subtractChips(a: ChipAmount, b: ChipAmount): ChipAmount {
  return a - b;
}

/**
 * Multiplies chip amount by a factor
 */
export function multiplyChips(
  amount: ChipAmount,
  factor: number | bigint
): ChipAmount {
  return amount * BigInt(factor);
}

/**
 * Divides chip amount by a divisor
 */
export function divideChips(
  amount: ChipAmount,
  divisor: number | bigint
): ChipAmount {
  return amount / BigInt(divisor);
}

/**
 * Compares two chip amounts
 * @returns positive if a > b, negative if a < b, 0 if equal
 */
export function compareChips(a: ChipAmount, b: ChipAmount): number {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

/**
 * Checks if chip amount is zero
 */
export function isZero(amount: ChipAmount): boolean {
  return amount === 0n;
}

/**
 * Checks if chip amount is positive
 */
export function isPositive(amount: ChipAmount): boolean {
  return amount > 0n;
}

/**
 * Checks if chip amount is negative
 */
export function isNegative(amount: ChipAmount): boolean {
  return amount < 0n;
}

/**
 * Returns the minimum of two chip amounts
 */
export function minChips(a: ChipAmount, b: ChipAmount): ChipAmount {
  return a < b ? a : b;
}

/**
 * Returns the maximum of two chip amounts
 */
export function maxChips(a: ChipAmount, b: ChipAmount): ChipAmount {
  return a > b ? a : b;
}

/**
 * Converts chip amount to number (use with caution for large values)
 */
export function toNumber(amount: ChipAmount): number {
  return Number(amount);
}

/**
 * Formats chip amount as a string
 */
export function formatChips(amount: ChipAmount): string {
  return amount.toString();
}
