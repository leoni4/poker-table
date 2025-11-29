import { describe, it, expect } from 'vitest';
import {
  collectContributions,
  constructPots,
  calculateRake,
  distributePot,
  distributeAllPots,
  distributeToSoleWinner,
  consolidatePots,
  applyPayouts,
} from '../../src/pot/index.js';
import {
  createPlayerId,
  PlayerState,
  PlayerStatus,
  RakeConfig,
} from '../../src/core/table.js';
import { chips } from '../../src/core/money.js';
import { isOk } from '../../src/core/result.js';

describe('Pot Management', () => {
  describe('collectContributions', () => {
    it('should collect contributions from players with committed chips', () => {
      const players: PlayerState[] = [
        {
          id: createPlayerId('p1'),
          seat: 0,
          stack: chips(100),
          committed: chips(10),
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('p2'),
          seat: 1,
          stack: chips(90),
          committed: chips(20),
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ];

      const contributions = collectContributions(players);

      expect(contributions).toHaveLength(2);
      expect(contributions[0].playerId).toBe('p1');
      expect(contributions[0].amount).toBe(chips(10));
      expect(contributions[1].playerId).toBe('p2');
      expect(contributions[1].amount).toBe(chips(20));
    });

    it('should ignore players with zero committed', () => {
      const players: PlayerState[] = [
        {
          id: createPlayerId('p1'),
          seat: 0,
          stack: chips(100),
          committed: chips(10),
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('p2'),
          seat: 1,
          stack: chips(100),
          committed: 0n,
          status: PlayerStatus.Folded,
          holeCards: {},
        },
      ];

      const contributions = collectContributions(players);

      expect(contributions).toHaveLength(1);
      expect(contributions[0].playerId).toBe('p1');
    });

    it('should identify all-in players', () => {
      const players: PlayerState[] = [
        {
          id: createPlayerId('p1'),
          seat: 0,
          stack: 0n,
          committed: chips(50),
          status: PlayerStatus.AllIn,
          holeCards: {},
        },
      ];

      const contributions = collectContributions(players);

      expect(contributions[0].isAllIn).toBe(true);
    });
  });

  describe('constructPots - simple cases', () => {
    it('should create a single pot when all equal contributions', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(10), isAllIn: false },
        { playerId: createPlayerId('p2'), amount: chips(10), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(1);
      expect(pots[0].total).toBe(chips(20));
      expect(pots[0].participants).toHaveLength(2);
    });

    it('should create a single pot with three players', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(20), isAllIn: false },
        { playerId: createPlayerId('p2'), amount: chips(20), isAllIn: false },
        { playerId: createPlayerId('p3'), amount: chips(20), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(1);
      expect(pots[0].total).toBe(chips(60));
      expect(pots[0].participants).toHaveLength(3);
    });
  });

  describe('constructPots - side pots', () => {
    it('should create main pot and one side pot for one all-in', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(10), isAllIn: true },
        { playerId: createPlayerId('p2'), amount: chips(20), isAllIn: false },
        { playerId: createPlayerId('p3'), amount: chips(20), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(2);
      // Main pot: 10 from each of 3 players
      expect(pots[0].total).toBe(chips(30));
      expect(pots[0].participants).toHaveLength(3);
      // Side pot: 10 more from p2 and p3
      expect(pots[1].total).toBe(chips(20));
      expect(pots[1].participants).toHaveLength(2);
      expect(pots[1].participants).toContain('p2');
      expect(pots[1].participants).toContain('p3');
    });

    it('should create multiple side pots for multiple all-ins', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(10), isAllIn: true },
        { playerId: createPlayerId('p2'), amount: chips(20), isAllIn: true },
        { playerId: createPlayerId('p3'), amount: chips(30), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(3);
      // Main pot: 10 from each of 3 players = 30
      expect(pots[0].total).toBe(chips(30));
      expect(pots[0].participants).toHaveLength(3);
      // Side pot 1: 10 more from p2 and p3 = 20
      expect(pots[1].total).toBe(chips(20));
      expect(pots[1].participants).toHaveLength(2);
      // Side pot 2: 10 more from p3 = 10
      expect(pots[2].total).toBe(chips(10));
      expect(pots[2].participants).toHaveLength(1);
    });

    it('should handle complex multi-way all-in scenario', () => {
      const contributions = [
        { playerId: createPlayerId('p1'), amount: chips(5), isAllIn: true },
        { playerId: createPlayerId('p2'), amount: chips(15), isAllIn: true },
        { playerId: createPlayerId('p3'), amount: chips(25), isAllIn: true },
        { playerId: createPlayerId('p4'), amount: chips(40), isAllIn: false },
      ];

      const pots = constructPots(contributions);

      expect(pots).toHaveLength(4);
      // Pot 1: 5 * 4 = 20
      expect(pots[0].total).toBe(chips(20));
      expect(pots[0].participants).toHaveLength(4);
      // Pot 2: 10 * 3 = 30
      expect(pots[1].total).toBe(chips(30));
      expect(pots[1].participants).toHaveLength(3);
      // Pot 3: 10 * 2 = 20
      expect(pots[2].total).toBe(chips(20));
      expect(pots[2].participants).toHaveLength(2);
      // Pot 4: 15 * 1 = 15
      expect(pots[3].total).toBe(chips(15));
      expect(pots[3].participants).toHaveLength(1);
    });
  });

  describe('calculateRake', () => {
    it('should return zero when no rake config', () => {
      const rake = calculateRake(chips(100));
      expect(rake).toBe(0n);
    });

    it('should calculate percentage rake correctly', () => {
      const rakeConfig: RakeConfig = {
        percentage: 0.05, // 5%
        cap: chips(10),
      };

      const rake = calculateRake(chips(100), rakeConfig);
      expect(rake).toBe(chips(5));
    });

    it('should apply rake cap', () => {
      const rakeConfig: RakeConfig = {
        percentage: 0.05, // 5%
        cap: chips(3),
      };

      const rake = calculateRake(chips(100), rakeConfig);
      expect(rake).toBe(chips(3)); // Capped at 3
    });

    it('should handle small pots', () => {
      const rakeConfig: RakeConfig = {
        percentage: 0.05,
        cap: chips(5),
      };

      const rake = calculateRake(chips(10), rakeConfig);
      expect(rake).toBe(0n); // Floor of 0.5 is 0
    });

    it('should handle large pots with cap', () => {
      const rakeConfig: RakeConfig = {
        percentage: 0.1, // 10%
        cap: chips(50),
      };

      const rake = calculateRake(chips(1000), rakeConfig);
      expect(rake).toBe(chips(50)); // Capped
    });
  });

  describe('distributePot - simple cases', () => {
    it('should distribute pot to single winner', () => {
      const pot = {
        total: chips(100),
        participants: [createPlayerId('p1'), createPlayerId('p2')],
      };
      const winners = [createPlayerId('p1')];

      const result = distributePot(pot, winners, 0);

      expect(result.payouts).toHaveLength(1);
      expect(result.payouts[0].playerId).toBe('p1');
      expect(result.payouts[0].amount).toBe(chips(100));
      expect(result.rake.amount).toBe(0n);
    });

    it('should split pot between two winners', () => {
      const pot = {
        total: chips(100),
        participants: [
          createPlayerId('p1'),
          createPlayerId('p2'),
          createPlayerId('p3'),
        ],
      };
      const winners = [createPlayerId('p1'), createPlayerId('p2')];

      const result = distributePot(pot, winners, 0);

      expect(result.payouts).toHaveLength(2);
      expect(result.payouts[0].amount).toBe(chips(50));
      expect(result.payouts[1].amount).toBe(chips(50));
    });

    it('should give remainder to first winner on odd split', () => {
      const pot = {
        total: chips(101),
        participants: [createPlayerId('p1'), createPlayerId('p2')],
      };
      const winners = [createPlayerId('p1'), createPlayerId('p2')];

      const result = distributePot(pot, winners, 0);

      expect(result.payouts[0].amount).toBe(chips(51)); // Gets remainder
      expect(result.payouts[1].amount).toBe(chips(50));
    });

    it('should only pay eligible winners', () => {
      const pot = {
        total: chips(100),
        participants: [createPlayerId('p1'), createPlayerId('p2')],
      };
      const winners = [
        createPlayerId('p1'),
        createPlayerId('p3'), // Not in pot
      ];

      const result = distributePot(pot, winners, 0);

      expect(result.payouts).toHaveLength(1);
      expect(result.payouts[0].playerId).toBe('p1');
      expect(result.payouts[0].amount).toBe(chips(100));
    });
  });

  describe('distributePot - with rake', () => {
    it('should apply rake from main pot', () => {
      const pot = {
        total: chips(100),
        participants: [createPlayerId('p1'), createPlayerId('p2')],
      };
      const winners = [createPlayerId('p1')];
      const rakeConfig: RakeConfig = {
        percentage: 0.05,
        cap: chips(10),
      };

      const result = distributePot(pot, winners, 0, rakeConfig);

      expect(result.rake.amount).toBe(chips(5));
      expect(result.payouts[0].amount).toBe(chips(95)); // 100 - 5 rake
    });

    it('should not rake side pots', () => {
      const pot = {
        total: chips(100),
        participants: [createPlayerId('p1'), createPlayerId('p2')],
      };
      const winners = [createPlayerId('p1')];
      const rakeConfig: RakeConfig = {
        percentage: 0.05,
        cap: chips(10),
      };

      const result = distributePot(pot, winners, 1, rakeConfig); // Side pot (index 1)

      expect(result.rake.amount).toBe(0n);
      expect(result.payouts[0].amount).toBe(chips(100));
    });
  });

  describe('distributeAllPots', () => {
    it('should distribute multiple pots to winners', () => {
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
          total: chips(20),
          participants: [createPlayerId('p2'), createPlayerId('p3')],
        },
      ];
      const winners = [createPlayerId('p2')];

      const result = distributeAllPots(pots, winners);

      expect(result.payouts).toHaveLength(2);
      expect(result.payouts[0].amount).toBe(chips(60));
      expect(result.payouts[1].amount).toBe(chips(20));
    });

    it('should handle different winners for different pots', () => {
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
      ];
      const winners = [createPlayerId('p3'), createPlayerId('p2')]; // p3 best, p2 second

      const result = distributeAllPots(pots, winners);

      // Both p3 and p2 are eligible for both pots, so they split
      const p3Payouts = result.payouts.filter((p) => p.playerId === 'p3');
      const p2Payouts = result.payouts.filter((p) => p.playerId === 'p2');

      expect(p3Payouts).toHaveLength(2);
      expect(p2Payouts).toHaveLength(2);

      // Pot 1 (30) split between p3 and p2
      expect(p3Payouts[0].amount).toBe(chips(15));
      expect(p2Payouts[0].amount).toBe(chips(15));

      // Pot 2 (20) split between p3 and p2
      expect(p3Payouts[1].amount).toBe(chips(10));
      expect(p2Payouts[1].amount).toBe(chips(10));
    });
  });

  describe('distributeToSoleWinner', () => {
    it('should give entire pot to sole winner without rake', () => {
      const pot = {
        total: chips(100),
        participants: [createPlayerId('p1'), createPlayerId('p2')],
      };
      const winner = createPlayerId('p1');

      const result = distributeToSoleWinner(pot, winner);

      expect(result.payouts).toHaveLength(1);
      expect(result.payouts[0].amount).toBe(chips(100));
      expect(result.rake.amount).toBe(0n);
    });
  });

  describe('applyPayouts', () => {
    it('should apply payouts to player stacks', () => {
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
          committed: 0n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ];

      const payouts = [
        { playerId: createPlayerId('p1'), amount: chips(30), potIndex: 0 },
        { playerId: createPlayerId('p2'), amount: chips(70), potIndex: 0 },
      ];

      const result = applyPayouts(players, payouts);

      expect(isOk(result)).toBe(true);
      expect(players[0].stack).toBe(chips(130));
      expect(players[1].stack).toBe(chips(120));
    });

    it('should return error for non-existent player', () => {
      const players: PlayerState[] = [
        {
          id: createPlayerId('p1'),
          seat: 0,
          stack: chips(100),
          committed: 0n,
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ];

      const payouts = [
        { playerId: createPlayerId('p99'), amount: chips(30), potIndex: 0 },
      ];

      const result = applyPayouts(players, payouts);

      expect(isOk(result)).toBe(false);
    });
  });

  describe('consolidatePots', () => {
    it('should consolidate pots from player contributions', () => {
      const players: PlayerState[] = [
        {
          id: createPlayerId('p1'),
          seat: 0,
          stack: chips(90),
          committed: chips(10),
          status: PlayerStatus.Active,
          holeCards: {},
        },
        {
          id: createPlayerId('p2'),
          seat: 1,
          stack: chips(80),
          committed: chips(20),
          status: PlayerStatus.Active,
          holeCards: {},
        },
      ];

      const pots = consolidatePots(players);

      expect(pots).toHaveLength(2);
      expect(pots[0].total).toBe(chips(20)); // 10 * 2
      expect(pots[1].total).toBe(chips(10)); // 10 * 1
    });
  });
});
