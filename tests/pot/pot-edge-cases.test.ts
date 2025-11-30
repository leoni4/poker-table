/**
 * Edge-case tests for pot management
 * Focus on complex all-in scenarios and multiple side pots
 */

import { describe, it, expect } from 'vitest';
import {
  constructPots,
  distributePot,
  distributeAllPots,
  consolidatePots,
} from '../../src/pot/index.js';
import {
  createPlayerId,
  PlayerState,
  PlayerStatus,
  RakeConfig,
} from '../../src/core/table.js';
import { chips } from '../../src/core/money.js';

describe('Pot Management - Edge Cases', () => {
  describe('Complex Multi-Way All-In Scenarios', () => {
    it('should handle 5-player all-in with different stack sizes', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(10), isAllIn: true },
        { playerId: createPlayerId('p2'), amount: chips(25), isAllIn: true },
        { playerId: createPlayerId('p3'), amount: chips(50), isAllIn: true },
        { playerId: createPlayerId('p4'), amount: chips(75), isAllIn: true },
        { playerId: createPlayerId('p5'), amount: chips(100), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(5);

      // Main pot: 10 * 5 = 50
      expect(pots[0].total).toBe(chips(50));
      expect(pots[0].participants).toHaveLength(5);

      // Side pot 1: 15 * 4 = 60
      expect(pots[1].total).toBe(chips(60));
      expect(pots[1].participants).toHaveLength(4);
      expect(pots[1].participants).not.toContain('p1');

      // Side pot 2: 25 * 3 = 75
      expect(pots[2].total).toBe(chips(75));
      expect(pots[2].participants).toHaveLength(3);
      expect(pots[2].participants).not.toContain('p1');
      expect(pots[2].participants).not.toContain('p2');

      // Side pot 3: 25 * 2 = 50
      expect(pots[3].total).toBe(chips(50));
      expect(pots[3].participants).toHaveLength(2);

      // Side pot 4: 25 * 1 = 25
      expect(pots[4].total).toBe(chips(25));
      expect(pots[4].participants).toHaveLength(1);
      expect(pots[4].participants).toContain('p5');
    });

    it('should handle all-in with same stack sizes creating single pot', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(50), isAllIn: true },
        { playerId: createPlayerId('p2'), amount: chips(50), isAllIn: true },
        { playerId: createPlayerId('p3'), amount: chips(50), isAllIn: true },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(1);
      expect(pots[0].total).toBe(chips(150));
      expect(pots[0].participants).toHaveLength(3);
    });

    it('should handle one chip differences between all-ins', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(97), isAllIn: true },
        { playerId: createPlayerId('p2'), amount: chips(98), isAllIn: true },
        { playerId: createPlayerId('p3'), amount: chips(99), isAllIn: true },
        { playerId: createPlayerId('p4'), amount: chips(100), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(4);

      // Main pot: 97 * 4 = 388
      expect(pots[0].total).toBe(chips(388));
      expect(pots[0].participants).toHaveLength(4);

      // Side pot 1: 1 * 3 = 3
      expect(pots[1].total).toBe(chips(3));
      expect(pots[1].participants).toHaveLength(3);

      // Side pot 2: 1 * 2 = 2
      expect(pots[2].total).toBe(chips(2));
      expect(pots[2].participants).toHaveLength(2);

      // Side pot 3: 1 * 1 = 1
      expect(pots[3].total).toBe(chips(1));
      expect(pots[3].participants).toHaveLength(1);
    });

    it('should handle cascading all-ins with large differences', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(1), isAllIn: true },
        { playerId: createPlayerId('p2'), amount: chips(100), isAllIn: true },
        {
          playerId: createPlayerId('p3'),
          amount: chips(1000),
          isAllIn: true,
        },
        {
          playerId: createPlayerId('p4'),
          amount: chips(10000),
          isAllIn: false,
        },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(4);

      // Main pot: 1 * 4 = 4
      expect(pots[0].total).toBe(chips(4));

      // Side pot 1: 99 * 3 = 297
      expect(pots[1].total).toBe(chips(297));

      // Side pot 2: 900 * 2 = 1800
      expect(pots[2].total).toBe(chips(1800));

      // Side pot 3: 9000 * 1 = 9000
      expect(pots[3].total).toBe(chips(9000));
    });

    it('should handle mixed all-in and call scenarios', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(25), isAllIn: true },
        { playerId: createPlayerId('p2'), amount: chips(100), isAllIn: false },
        { playerId: createPlayerId('p3'), amount: chips(75), isAllIn: true },
        { playerId: createPlayerId('p4'), amount: chips(100), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(3);

      // Main pot: 25 * 4 = 100
      expect(pots[0].total).toBe(chips(100));
      expect(pots[0].participants).toHaveLength(4);

      // Side pot 1: 50 * 3 = 150
      expect(pots[1].total).toBe(chips(150));
      expect(pots[1].participants).toHaveLength(3);
      expect(pots[1].participants).not.toContain('p1');

      // Side pot 2: 25 * 2 = 50
      expect(pots[2].total).toBe(chips(50));
      expect(pots[2].participants).toHaveLength(2);
      expect(pots[2].participants).toContain('p2');
      expect(pots[2].participants).toContain('p4');
    });

    it('should handle 6-player scenario with varying stacks', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(5), isAllIn: true },
        { playerId: createPlayerId('p2'), amount: chips(10), isAllIn: true },
        { playerId: createPlayerId('p3'), amount: chips(20), isAllIn: true },
        { playerId: createPlayerId('p4'), amount: chips(30), isAllIn: true },
        { playerId: createPlayerId('p5'), amount: chips(40), isAllIn: true },
        { playerId: createPlayerId('p6'), amount: chips(50), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(6);

      // Verify total matches sum of contributions
      const totalPotChips = pots.reduce((sum, pot) => sum + pot.total, 0n);
      const totalContributions = contributions.reduce(
        (sum, c) => sum + c.amount,
        0n
      );
      expect(totalPotChips).toBe(totalContributions);

      // Main pot
      expect(pots[0].participants).toHaveLength(6);
    });

    it('should handle preflop all-ins with blinds and raises', () => {
      const contributions = [
        {
          playerId: createPlayerId('sb'),
          amount: chips(100),
          isAllIn: true,
        }, // SB all-in
        {
          playerId: createPlayerId('bb'),
          amount: chips(200),
          isAllIn: false,
        }, // BB calls
        {
          playerId: createPlayerId('utg'),
          amount: chips(150),
          isAllIn: true,
        }, // UTG all-in
        {
          playerId: createPlayerId('co'),
          amount: chips(200),
          isAllIn: false,
        }, // CO calls
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(3);

      // Main pot: 100 * 4 = 400
      expect(pots[0].total).toBe(chips(400));
      expect(pots[0].participants).toHaveLength(4);

      // Side pot 1: 50 * 3 = 150
      expect(pots[1].total).toBe(chips(150));
      expect(pots[1].participants).toHaveLength(3);

      // Side pot 2: 50 * 2 = 100
      expect(pots[2].total).toBe(chips(100));
      expect(pots[2].participants).toHaveLength(2);
    });
  });

  describe('Pot Distribution with Multiple Side Pots', () => {
    it('should distribute when shortest stack wins all pots', () => {
      const pots = [
        {
          total: chips(40),
          participants: [
            createPlayerId('p1'),
            createPlayerId('p2'),
            createPlayerId('p3'),
            createPlayerId('p4'),
          ],
        },
        {
          total: chips(60),
          participants: [
            createPlayerId('p2'),
            createPlayerId('p3'),
            createPlayerId('p4'),
          ],
        },
        {
          total: chips(50),
          participants: [createPlayerId('p3'), createPlayerId('p4')],
        },
        {
          total: chips(25),
          participants: [createPlayerId('p4')],
        },
      ];

      const winners = [createPlayerId('p1')]; // Shortest stack wins

      const result = distributeAllPots(pots, winners);

      // p1 should only get main pot
      expect(result.payouts).toHaveLength(1);
      expect(result.payouts[0].playerId).toBe('p1');
      expect(result.payouts[0].amount).toBe(chips(40));
    });

    it('should distribute when different players win different pots', () => {
      const pots = [
        {
          total: chips(30),
          participants: [
            createPlayerId('p1'),
            createPlayerId('p2'),
            createPlayerId('p3'),
          ],
        },
        {
          total: chips(20),
          participants: [createPlayerId('p2'), createPlayerId('p3')],
        },
        {
          total: chips(10),
          participants: [createPlayerId('p3')],
        },
      ];

      const winners = [
        createPlayerId('p2'),
        createPlayerId('p3'),
        createPlayerId('p1'),
      ]; // p2 best, p3 second, p1 third

      const result = distributeAllPots(pots, winners);

      // Main pot: All three winners are eligible, so all three split
      const mainPotPayouts = result.payouts.filter((p) => p.potIndex === 0);
      expect(mainPotPayouts).toHaveLength(3);

      // Side pot 1: p2 and p3 split (p1 not eligible)
      const sidePot1Payouts = result.payouts.filter((p) => p.potIndex === 1);
      expect(sidePot1Payouts).toHaveLength(2);

      // Side pot 2: p3 wins (only eligible)
      const sidePot2Payouts = result.payouts.filter((p) => p.potIndex === 2);
      expect(sidePot2Payouts).toHaveLength(1);
      expect(sidePot2Payouts[0].playerId).toBe('p3');
    });

    it('should handle split pot in main pot but sole winner in side pot', () => {
      const pots = [
        {
          total: chips(100),
          participants: [
            createPlayerId('p1'),
            createPlayerId('p2'),
            createPlayerId('p3'),
          ],
        },
        {
          total: chips(50),
          participants: [createPlayerId('p2'), createPlayerId('p3')],
        },
      ];

      const winners = [createPlayerId('p1'), createPlayerId('p2')]; // Tie for main pot

      const result = distributeAllPots(pots, winners);

      // Main pot: split between p1 and p2
      const mainPotPayouts = result.payouts.filter((p) => p.potIndex === 0);
      expect(mainPotPayouts).toHaveLength(2);
      expect(mainPotPayouts[0].amount).toBe(chips(50));
      expect(mainPotPayouts[1].amount).toBe(chips(50));

      // Side pot: only p2 eligible
      const sidePotPayouts = result.payouts.filter((p) => p.potIndex === 1);
      expect(sidePotPayouts).toHaveLength(1);
      expect(sidePotPayouts[0].playerId).toBe('p2');
      expect(sidePotPayouts[0].amount).toBe(chips(50));
    });

    it('should handle odd chip distribution across multiple pots', () => {
      const pots = [
        {
          total: chips(101),
          participants: [createPlayerId('p1'), createPlayerId('p2')],
        },
        {
          total: chips(103),
          participants: [createPlayerId('p1'), createPlayerId('p2')],
        },
      ];

      const winners = [createPlayerId('p1'), createPlayerId('p2')];

      const result = distributeAllPots(pots, winners);

      // Main pot: 101 split = 51, 50 (p1 gets extra)
      const mainPotPayouts = result.payouts.filter((p) => p.potIndex === 0);
      const p1MainPot = mainPotPayouts.find((p) => p.playerId === 'p1');
      const p2MainPot = mainPotPayouts.find((p) => p.playerId === 'p2');
      expect(p1MainPot?.amount).toBe(chips(51));
      expect(p2MainPot?.amount).toBe(chips(50));

      // Side pot: 103 split = 52, 51 (p1 gets extra, p2 gets 51)
      const sidePotPayouts = result.payouts.filter((p) => p.potIndex === 1);
      const p1SidePot = sidePotPayouts.find((p) => p.playerId === 'p1');
      const p2SidePot = sidePotPayouts.find((p) => p.playerId === 'p2');
      expect(p1SidePot?.amount).toBe(chips(52));
      expect(p2SidePot?.amount).toBe(chips(51));
    });

    it('should handle 3-way split in main pot with decreasing side pots', () => {
      const pots = [
        {
          total: chips(60),
          participants: [
            createPlayerId('p1'),
            createPlayerId('p2'),
            createPlayerId('p3'),
          ],
        },
        {
          total: chips(40),
          participants: [createPlayerId('p2'), createPlayerId('p3')],
        },
        {
          total: chips(20),
          participants: [createPlayerId('p3')],
        },
      ];

      const winners = [
        createPlayerId('p1'),
        createPlayerId('p2'),
        createPlayerId('p3'),
      ]; // 3-way tie

      const result = distributeAllPots(pots, winners);

      // Main pot: 60 / 3 = 20 each
      const mainPotPayouts = result.payouts.filter((p) => p.potIndex === 0);
      expect(mainPotPayouts).toHaveLength(3);
      mainPotPayouts.forEach((payout) => {
        expect(payout.amount).toBe(chips(20));
      });

      // Side pot 1: 40 / 2 = 20 each (p2, p3)
      const sidePot1Payouts = result.payouts.filter((p) => p.potIndex === 1);
      expect(sidePot1Payouts).toHaveLength(2);
      sidePot1Payouts.forEach((payout) => {
        expect(payout.amount).toBe(chips(20));
      });

      // Side pot 2: 20 to p3
      const sidePot2Payouts = result.payouts.filter((p) => p.potIndex === 2);
      expect(sidePot2Payouts).toHaveLength(1);
      expect(sidePot2Payouts[0].playerId).toBe('p3');
      expect(sidePot2Payouts[0].amount).toBe(chips(20));
    });
  });

  describe('Rake with Complex Pot Structures', () => {
    it('should only rake the main pot, not side pots', () => {
      const mainPot = {
        total: chips(1000),
        participants: [
          createPlayerId('p1'),
          createPlayerId('p2'),
          createPlayerId('p3'),
        ],
      };
      const winners = [createPlayerId('p1')];
      const rakeConfig: RakeConfig = {
        percentage: 0.05,
        cap: chips(100),
      };

      const resultMain = distributePot(mainPot, winners, 0, rakeConfig);
      expect(resultMain.rake.amount).toBe(chips(50)); // 5% of 1000

      const sidePot = {
        total: chips(1000),
        participants: [createPlayerId('p2'), createPlayerId('p3')],
      };

      const resultSide = distributePot(sidePot, winners, 1, rakeConfig);
      expect(resultSide.rake.amount).toBe(0n); // No rake on side pots
    });

    it('should cap rake correctly on large main pot', () => {
      const mainPot = {
        total: chips(10000),
        participants: [createPlayerId('p1'), createPlayerId('p2')],
      };
      const winners = [createPlayerId('p1')];
      const rakeConfig: RakeConfig = {
        percentage: 0.1, // 10%
        cap: chips(200),
      };

      const result = distributePot(mainPot, winners, 0, rakeConfig);

      expect(result.rake.amount).toBe(chips(200)); // Capped at 200, not 1000
      expect(result.payouts[0].amount).toBe(chips(9800)); // 10000 - 200
    });

    it('should handle rake with split pot', () => {
      const mainPot = {
        total: chips(500),
        participants: [createPlayerId('p1'), createPlayerId('p2')],
      };
      const winners = [createPlayerId('p1'), createPlayerId('p2')];
      const rakeConfig: RakeConfig = {
        percentage: 0.05,
        cap: chips(50),
      };

      const result = distributePot(mainPot, winners, 0, rakeConfig);

      // 500 - 25 rake = 475, split = 238, 237
      expect(result.rake.amount).toBe(chips(25));
      expect(result.payouts[0].amount).toBe(chips(238)); // First gets extra
      expect(result.payouts[1].amount).toBe(chips(237));
    });

    it('should not rake when pot is too small', () => {
      const mainPot = {
        total: chips(10),
        participants: [createPlayerId('p1'), createPlayerId('p2')],
      };
      const winners = [createPlayerId('p1')];
      const rakeConfig: RakeConfig = {
        percentage: 0.05,
        cap: chips(10),
      };

      const result = distributePot(mainPot, winners, 0, rakeConfig);

      // 0.5 chips rounds down to 0
      expect(result.rake.amount).toBe(0n);
      expect(result.payouts[0].amount).toBe(chips(10));
    });
  });

  describe('Edge Cases with consolidatePots', () => {
    it('should handle players with zero committed', () => {
      const players: PlayerState[] = [
        {
          id: createPlayerId('p1'),
          seat: 0,
          stack: chips(100),
          committed: 0n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('p2'),
          seat: 1,
          stack: chips(50),
          committed: chips(50),
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ];

      const pots = consolidatePots(players);

      expect(pots).toHaveLength(1);
      expect(pots[0].total).toBe(chips(50));
      expect(pots[0].participants).toHaveLength(1);
    });

    it('should handle all players all-in with different stacks', () => {
      const players: PlayerState[] = [
        {
          id: createPlayerId('p1'),
          seat: 0,
          stack: 0n,
          committed: chips(10),
          status: PlayerStatus.AllIn,
          holeCards: {},
        },
        {
          id: createPlayerId('p2'),
          seat: 1,
          stack: 0n,
          committed: chips(20),
          status: PlayerStatus.AllIn,
          holeCards: {},
        },
        {
          id: createPlayerId('p3'),
          seat: 2,
          stack: 0n,
          committed: chips(30),
          status: PlayerStatus.AllIn,
          holeCards: {},
        },
      ];

      const pots = consolidatePots(players);

      expect(pots).toHaveLength(3);
      // Verify total
      const total = pots.reduce((sum, pot) => sum + pot.total, 0n);
      expect(total).toBe(chips(60));
    });

    it('should handle single player with chips', () => {
      const players: PlayerState[] = [
        {
          id: createPlayerId('p1'),
          seat: 0,
          stack: chips(50),
          committed: chips(100),
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ];

      const pots = consolidatePots(players);

      expect(pots).toHaveLength(1);
      expect(pots[0].total).toBe(chips(100));
      expect(pots[0].participants).toHaveLength(1);
    });

    it('should handle large number of players with varying stacks', () => {
      const players: PlayerState[] = Array.from({ length: 9 }, (_, i) => ({
        id: createPlayerId(`p${i + 1}`),
        seat: i,
        stack: 0n,
        committed: chips((i + 1) * 10), // 10, 20, 30, ..., 90
        status: PlayerStatus.AllIn,
        holeCards: {},
      }));

      const pots = consolidatePots(players);

      // Should create 9 pots
      expect(pots.length).toBeGreaterThan(0);

      // Verify total matches sum of contributions
      const totalPotChips = pots.reduce((sum, pot) => sum + pot.total, 0n);
      const totalCommitted = players.reduce((sum, p) => sum + p.committed, 0n);
      expect(totalPotChips).toBe(totalCommitted);
    });
  });

  describe('Special Stack Limit Scenarios', () => {
    it('should handle exact call with last chip', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(100), isAllIn: false },
        { playerId: createPlayerId('p2'), amount: chips(100), isAllIn: true }, // Exact call with last chips
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(1);
      expect(pots[0].total).toBe(chips(200));
      expect(pots[0].participants).toHaveLength(2);
    });

    it('should handle one chip short of call', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(100), isAllIn: false },
        { playerId: createPlayerId('p2'), amount: chips(99), isAllIn: true }, // 1 chip short
        { playerId: createPlayerId('p3'), amount: chips(100), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(2);

      // Main pot: 99 * 3 = 297
      expect(pots[0].total).toBe(chips(297));
      expect(pots[0].participants).toHaveLength(3);

      // Side pot: 1 * 2 = 2
      expect(pots[1].total).toBe(chips(2));
      expect(pots[1].participants).toHaveLength(2);
      expect(pots[1].participants).not.toContain('p2');
    });

    it('should handle multiple players one chip short', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(99), isAllIn: true },
        { playerId: createPlayerId('p2'), amount: chips(99), isAllIn: true },
        { playerId: createPlayerId('p3'), amount: chips(100), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(2);

      // Main pot: 99 * 3 = 297
      expect(pots[0].total).toBe(chips(297));

      // Side pot: 1 * 1 = 1
      expect(pots[1].total).toBe(chips(1));
      expect(pots[1].participants).toEqual(['p3']);
    });

    it('should handle tiny stacks (1 chip all-ins)', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(1), isAllIn: true },
        { playerId: createPlayerId('p2'), amount: chips(1), isAllIn: true },
        { playerId: createPlayerId('p3'), amount: chips(100), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(2);

      // Main pot: 1 * 3 = 3
      expect(pots[0].total).toBe(chips(3));

      // Side pot: 99 * 1 = 99
      expect(pots[1].total).toBe(chips(99));
    });
  });
});
