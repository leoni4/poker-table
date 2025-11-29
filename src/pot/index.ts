/**
 * Pot and side pot management with rake distribution
 */

import { ChipAmount } from '../core/money.js';
import { PlayerId, PlayerState, PotState, RakeConfig } from '../core/table.js';
import { Result, ok, err } from '../core/result.js';
import { PokerError, createError, ErrorCode } from '../core/errors.js';

/**
 * Player contribution tracking for pot calculation
 */
export interface PlayerContribution {
  playerId: PlayerId;
  amount: ChipAmount;
  isAllIn: boolean;
}

/**
 * Payout information for a player
 */
export interface Payout {
  playerId: PlayerId;
  amount: ChipAmount;
  potIndex: number;
}

/**
 * Rake information
 */
export interface RakeInfo {
  amount: ChipAmount;
  percentage: number;
}

/**
 * Distribution result
 */
export interface DistributionResult {
  payouts: Payout[];
  rake: RakeInfo;
}

/**
 * Updates pot contributions from player committed amounts
 * @param players - Current player states
 * @returns Array of player contributions
 */
export function collectContributions(
  players: PlayerState[]
): PlayerContribution[] {
  return players
    .filter((p) => p.committed > 0n)
    .map((p) => ({
      playerId: p.id,
      amount: p.committed,
      isAllIn: p.stack === 0n && p.committed > 0n,
    }));
}

/**
 * Constructs main pot and side pots from player contributions
 * @param contributions - Player contributions
 * @param existingPots - Existing pots (optional)
 * @returns Array of pots (main + side pots)
 */
export function constructPots(
  contributions: PlayerContribution[],
  existingPots: PotState[] = []
): PotState[] {
  if (contributions.length === 0) {
    return existingPots;
  }

  // Sort contributions by amount (ascending)
  const sorted = [...contributions].sort((a, b) =>
    a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0
  );

  const pots: PotState[] = [];
  let remainingPlayers = sorted.map((c) => ({
    ...c,
    remaining: c.amount,
  }));

  while (remainingPlayers.length > 0) {
    // Find the smallest non-zero contribution
    const minContribution = remainingPlayers.reduce(
      (min, p) => (p.remaining < min ? p.remaining : min),
      remainingPlayers[0].remaining
    );

    if (minContribution === 0n) {
      break;
    }

    // Create a pot for this level
    const potTotal = minContribution * BigInt(remainingPlayers.length);
    const participants = remainingPlayers.map((p) => p.playerId);

    pots.push({
      total: potTotal,
      participants,
    });

    // Deduct from all players and remove those with zero remaining
    remainingPlayers = remainingPlayers
      .map((p) => ({
        ...p,
        remaining: p.remaining - minContribution,
      }))
      .filter((p) => p.remaining > 0n);
  }

  return pots;
}

/**
 * Calculates rake from a pot amount
 * @param potAmount - Amount in the pot
 * @param rakeConfig - Rake configuration
 * @returns Rake amount
 */
export function calculateRake(
  potAmount: ChipAmount,
  rakeConfig?: RakeConfig
): ChipAmount {
  if (!rakeConfig) {
    return 0n;
  }

  // Calculate percentage-based rake
  const percentageRake = BigInt(
    Math.floor(Number(potAmount) * rakeConfig.percentage)
  );

  // Apply cap
  return percentageRake < rakeConfig.cap ? percentageRake : rakeConfig.cap;
}

/**
 * Distributes a single pot among winners
 * @param pot - The pot to distribute
 * @param winners - Player IDs of winners (in order of hand strength)
 * @param potIndex - Index of this pot
 * @param rakeConfig - Optional rake configuration
 * @returns Distribution result with payouts and rake
 */
export function distributePot(
  pot: PotState,
  winners: PlayerId[],
  potIndex: number,
  rakeConfig?: RakeConfig
): DistributionResult {
  // Filter winners to only those eligible for this pot
  const eligibleWinners = winners.filter((w) => pot.participants.includes(w));

  if (eligibleWinners.length === 0) {
    // No eligible winners - this shouldn't happen in normal play
    return {
      payouts: [],
      rake: { amount: 0n, percentage: 0 },
    };
  }

  // Calculate rake (only from main pot, typically)
  const rake = potIndex === 0 ? calculateRake(pot.total, rakeConfig) : 0n;
  const amountAfterRake = pot.total - rake;

  // Split pot among eligible winners
  const payoutPerWinner = amountAfterRake / BigInt(eligibleWinners.length);
  const remainder = amountAfterRake % BigInt(eligibleWinners.length);

  const payouts: Payout[] = eligibleWinners.map((playerId, index) => ({
    playerId,
    amount: payoutPerWinner + (index === 0 ? remainder : 0n), // Give remainder to first winner
    potIndex,
  }));

  return {
    payouts,
    rake: {
      amount: rake,
      percentage: rakeConfig?.percentage ?? 0,
    },
  };
}

/**
 * Distributes all pots to winners
 * @param pots - All pots to distribute
 * @param winners - Player IDs of winners (ordered by hand strength, best first)
 * @param rakeConfig - Optional rake configuration
 * @returns Complete distribution result
 */
export function distributeAllPots(
  pots: PotState[],
  winners: PlayerId[],
  rakeConfig?: RakeConfig
): DistributionResult {
  const allPayouts: Payout[] = [];
  let totalRake = 0n;

  for (let i = 0; i < pots.length; i++) {
    const result = distributePot(pots[i], winners, i, rakeConfig);
    allPayouts.push(...result.payouts);
    totalRake += result.rake.amount;
  }

  return {
    payouts: allPayouts,
    rake: {
      amount: totalRake,
      percentage: rakeConfig?.percentage ?? 0,
    },
  };
}

/**
 * Applies payouts to player stacks
 * @param players - Player states
 * @param payouts - Payouts to apply
 * @returns Result with success or error
 */
export function applyPayouts(
  players: PlayerState[],
  payouts: Payout[]
): Result<void, PokerError> {
  for (const payout of payouts) {
    const player = players.find((p) => p.id === payout.playerId);
    if (!player) {
      return err(
        createError(
          ErrorCode.PLAYER_NOT_FOUND,
          `Player ${payout.playerId} not found`
        )
      );
    }
    player.stack += payout.amount;
  }

  return ok(undefined);
}

/**
 * Handles pot distribution when only one player remains (everyone else folded)
 * @param pot - The current pot
 * @param winner - The winning player ID
 * @returns Distribution result
 */
export function distributeToSoleWinner(
  pot: PotState,
  winner: PlayerId
): DistributionResult {
  return {
    payouts: [
      {
        playerId: winner,
        amount: pot.total,
        potIndex: 0,
      },
    ],
    rake: {
      amount: 0n,
      percentage: 0,
    },
  };
}

/**
 * Consolidates multiple pots from accumulated contributions during a hand
 * @param players - Current player states with committed amounts
 * @returns Array of consolidated pots
 */
export function consolidatePots(players: PlayerState[]): PotState[] {
  const contributions = collectContributions(players);
  return constructPots(contributions);
}
