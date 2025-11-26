import { describe, it, expect } from 'vitest';
import {
  createPlayerId,
  createDefaultTableConfig,
  isValidTableConfig,
  isPlayerStatus,
  isTablePhase,
  TableConfig,
  TablePhase,
  PlayerStatus,
  PlayerState,
  PotState,
  TableState,
  HoleCards,
} from '../../src/core/table.js';
import { chips } from '../../src/core/money.js';
import { createCard, Rank, Suit } from '../../src/core/card.js';

describe('PlayerId', () => {
  it('should create a branded PlayerId', () => {
    const id = createPlayerId('player-123');
    expect(id).toBe('player-123');
  });

  it('should allow different ID formats', () => {
    const uuid = createPlayerId('550e8400-e29b-41d4-a716-446655440000');
    const numeric = createPlayerId('42');
    const alphanumeric = createPlayerId('player_1_xyz');

    expect(uuid).toBeTruthy();
    expect(numeric).toBeTruthy();
    expect(alphanumeric).toBeTruthy();
  });
});

describe('TableConfig', () => {
  it('should create a default config with correct values', () => {
    const config = createDefaultTableConfig();

    expect(config.minPlayers).toBe(2);
    expect(config.maxPlayers).toBe(10);
    expect(config.smallBlind).toBe(1n);
    expect(config.bigBlind).toBe(2n);
    expect(config.ante).toBeUndefined();
    expect(config.straddle).toBeUndefined();
    expect(config.rake).toBeUndefined();
    expect(config.rngSeed).toBeUndefined();
  });

  it('should accept valid config with all required fields', () => {
    const config: TableConfig = {
      minPlayers: 2,
      maxPlayers: 6,
      smallBlind: chips(5),
      bigBlind: chips(10),
    };

    expect(isValidTableConfig(config)).toBe(true);
  });

  it('should accept valid config with optional fields', () => {
    const config: TableConfig = {
      minPlayers: 3,
      maxPlayers: 9,
      smallBlind: chips(10),
      bigBlind: chips(20),
      ante: chips(2),
      straddle: chips(40),
      rake: {
        percentage: 0.05,
        cap: chips(5),
      },
      rngSeed: 12345,
    };

    expect(isValidTableConfig(config)).toBe(true);
  });

  it('should reject config with minPlayers < 2', () => {
    const config: TableConfig = {
      minPlayers: 1,
      maxPlayers: 10,
      smallBlind: chips(1),
      bigBlind: chips(2),
    };

    expect(isValidTableConfig(config)).toBe(false);
  });

  it('should reject config with minPlayers > maxPlayers', () => {
    const config: TableConfig = {
      minPlayers: 8,
      maxPlayers: 6,
      smallBlind: chips(1),
      bigBlind: chips(2),
    };

    expect(isValidTableConfig(config)).toBe(false);
  });

  it('should reject config with maxPlayers > 23', () => {
    const config: TableConfig = {
      minPlayers: 2,
      maxPlayers: 24,
      smallBlind: chips(1),
      bigBlind: chips(2),
    };

    expect(isValidTableConfig(config)).toBe(false);
  });

  it('should reject config with negative or zero blinds', () => {
    const config1: TableConfig = {
      minPlayers: 2,
      maxPlayers: 10,
      smallBlind: chips(0),
      bigBlind: chips(2),
    };

    const config2: TableConfig = {
      minPlayers: 2,
      maxPlayers: 10,
      smallBlind: chips(1),
      bigBlind: chips(0),
    };

    expect(isValidTableConfig(config1)).toBe(false);
    expect(isValidTableConfig(config2)).toBe(false);
  });

  it('should reject config with smallBlind >= bigBlind', () => {
    const config1: TableConfig = {
      minPlayers: 2,
      maxPlayers: 10,
      smallBlind: chips(2),
      bigBlind: chips(2),
    };

    const config2: TableConfig = {
      minPlayers: 2,
      maxPlayers: 10,
      smallBlind: chips(3),
      bigBlind: chips(2),
    };

    expect(isValidTableConfig(config1)).toBe(false);
    expect(isValidTableConfig(config2)).toBe(false);
  });

  it('should reject config with negative or zero ante', () => {
    const config: TableConfig = {
      minPlayers: 2,
      maxPlayers: 10,
      smallBlind: chips(1),
      bigBlind: chips(2),
      ante: chips(0),
    };

    expect(isValidTableConfig(config)).toBe(false);
  });

  it('should reject config with negative or zero straddle', () => {
    const config: TableConfig = {
      minPlayers: 2,
      maxPlayers: 10,
      smallBlind: chips(1),
      bigBlind: chips(2),
      straddle: chips(0),
    };

    expect(isValidTableConfig(config)).toBe(false);
  });

  it('should reject config with invalid rake percentage', () => {
    const config1: TableConfig = {
      minPlayers: 2,
      maxPlayers: 10,
      smallBlind: chips(1),
      bigBlind: chips(2),
      rake: {
        percentage: -0.05,
        cap: chips(5),
      },
    };

    const config2: TableConfig = {
      minPlayers: 2,
      maxPlayers: 10,
      smallBlind: chips(1),
      bigBlind: chips(2),
      rake: {
        percentage: 1.5,
        cap: chips(5),
      },
    };

    expect(isValidTableConfig(config1)).toBe(false);
    expect(isValidTableConfig(config2)).toBe(false);
  });

  it('should reject config with negative or zero rake cap', () => {
    const config: TableConfig = {
      minPlayers: 2,
      maxPlayers: 10,
      smallBlind: chips(1),
      bigBlind: chips(2),
      rake: {
        percentage: 0.05,
        cap: chips(0),
      },
    };

    expect(isValidTableConfig(config)).toBe(false);
  });

  it('should accept valid rake percentages at boundaries', () => {
    const config1: TableConfig = {
      minPlayers: 2,
      maxPlayers: 10,
      smallBlind: chips(1),
      bigBlind: chips(2),
      rake: {
        percentage: 0,
        cap: chips(1),
      },
    };

    const config2: TableConfig = {
      minPlayers: 2,
      maxPlayers: 10,
      smallBlind: chips(1),
      bigBlind: chips(2),
      rake: {
        percentage: 1,
        cap: chips(1),
      },
    };

    expect(isValidTableConfig(config1)).toBe(true);
    expect(isValidTableConfig(config2)).toBe(true);
  });
});

describe('PlayerStatus', () => {
  it('should identify valid PlayerStatus values', () => {
    expect(isPlayerStatus('active')).toBe(true);
    expect(isPlayerStatus('folded')).toBe(true);
    expect(isPlayerStatus('all-in')).toBe(true);
    expect(isPlayerStatus('sitting-out')).toBe(true);
  });

  it('should reject invalid PlayerStatus values', () => {
    expect(isPlayerStatus('invalid')).toBe(false);
    expect(isPlayerStatus('ACTIVE')).toBe(false);
    expect(isPlayerStatus('')).toBe(false);
    expect(isPlayerStatus(null)).toBe(false);
    expect(isPlayerStatus(undefined)).toBe(false);
    expect(isPlayerStatus(123)).toBe(false);
    expect(isPlayerStatus({})).toBe(false);
  });

  it('should have correct enum values', () => {
    expect(PlayerStatus.Active).toBe('active');
    expect(PlayerStatus.Folded).toBe('folded');
    expect(PlayerStatus.AllIn).toBe('all-in');
    expect(PlayerStatus.SittingOut).toBe('sitting-out');
  });
});

describe('TablePhase', () => {
  it('should identify valid TablePhase values', () => {
    expect(isTablePhase('idle')).toBe(true);
    expect(isTablePhase('preflop')).toBe(true);
    expect(isTablePhase('flop')).toBe(true);
    expect(isTablePhase('turn')).toBe(true);
    expect(isTablePhase('river')).toBe(true);
    expect(isTablePhase('showdown')).toBe(true);
  });

  it('should reject invalid TablePhase values', () => {
    expect(isTablePhase('invalid')).toBe(false);
    expect(isTablePhase('FLOP')).toBe(false);
    expect(isTablePhase('')).toBe(false);
    expect(isTablePhase(null)).toBe(false);
    expect(isTablePhase(undefined)).toBe(false);
    expect(isTablePhase(123)).toBe(false);
    expect(isTablePhase({})).toBe(false);
  });

  it('should have correct enum values', () => {
    expect(TablePhase.Idle).toBe('idle');
    expect(TablePhase.Preflop).toBe('preflop');
    expect(TablePhase.Flop).toBe('flop');
    expect(TablePhase.Turn).toBe('turn');
    expect(TablePhase.River).toBe('river');
    expect(TablePhase.Showdown).toBe('showdown');
  });
});

describe('PlayerState', () => {
  it('should create a valid PlayerState object', () => {
    const player: PlayerState = {
      id: createPlayerId('player-1'),
      seat: 0,
      stack: chips(1000),
      committed: chips(50),
      status: PlayerStatus.Active,
      holeCards: {},
    };

    expect(player.id).toBeDefined();
    expect(player.seat).toBe(0);
    expect(player.stack).toBe(1000n);
    expect(player.committed).toBe(50n);
    expect(player.status).toBe(PlayerStatus.Active);
    expect(player.holeCards).toBeDefined();
  });

  it('should allow player with hole cards', () => {
    const holeCards: HoleCards = {
      cards: [
        createCard(Rank.Ace, Suit.Spades),
        createCard(Rank.King, Suit.Hearts),
      ],
    };

    const player: PlayerState = {
      id: createPlayerId('player-2'),
      seat: 3,
      stack: chips(500),
      committed: chips(0),
      status: PlayerStatus.Active,
      holeCards,
    };

    expect(player.holeCards.cards).toHaveLength(2);
    expect(player.holeCards.cards).toBeDefined();
  });

  it('should allow player without visible hole cards', () => {
    const player: PlayerState = {
      id: createPlayerId('player-3'),
      seat: 5,
      stack: chips(2000),
      committed: chips(100),
      status: PlayerStatus.Folded,
      holeCards: {},
    };

    expect(player.holeCards.cards).toBeUndefined();
  });

  it('should support different player statuses', () => {
    const players: PlayerState[] = [
      {
        id: createPlayerId('p1'),
        seat: 0,
        stack: chips(1000),
        committed: chips(0),
        status: PlayerStatus.Active,
        holeCards: {},
      },
      {
        id: createPlayerId('p2'),
        seat: 1,
        stack: chips(500),
        committed: chips(0),
        status: PlayerStatus.Folded,
        holeCards: {},
      },
      {
        id: createPlayerId('p3'),
        seat: 2,
        stack: chips(0),
        committed: chips(300),
        status: PlayerStatus.AllIn,
        holeCards: {},
      },
      {
        id: createPlayerId('p4'),
        seat: 3,
        stack: chips(1500),
        committed: chips(0),
        status: PlayerStatus.SittingOut,
        holeCards: {},
      },
    ];

    expect(players[0].status).toBe(PlayerStatus.Active);
    expect(players[1].status).toBe(PlayerStatus.Folded);
    expect(players[2].status).toBe(PlayerStatus.AllIn);
    expect(players[3].status).toBe(PlayerStatus.SittingOut);
  });
});

describe('PotState', () => {
  it('should create a main pot with all participants', () => {
    const pot: PotState = {
      total: chips(300),
      participants: [
        createPlayerId('player-1'),
        createPlayerId('player-2'),
        createPlayerId('player-3'),
      ],
    };

    expect(pot.total).toBe(300n);
    expect(pot.participants).toHaveLength(3);
  });

  it('should create a side pot with limited participants', () => {
    const pot: PotState = {
      total: chips(150),
      participants: [createPlayerId('player-1'), createPlayerId('player-2')],
    };

    expect(pot.total).toBe(150n);
    expect(pot.participants).toHaveLength(2);
  });

  it('should support empty pot', () => {
    const pot: PotState = {
      total: chips(0),
      participants: [],
    };

    expect(pot.total).toBe(0n);
    expect(pot.participants).toHaveLength(0);
  });
});

describe('TableState', () => {
  it('should create a valid idle table state', () => {
    const state: TableState = {
      phase: TablePhase.Idle,
      handId: 0,
      players: [],
      communityCards: [],
      pots: [],
      currentPlayerId: undefined,
    };

    expect(state.phase).toBe(TablePhase.Idle);
    expect(state.handId).toBe(0);
    expect(state.players).toHaveLength(0);
    expect(state.communityCards).toHaveLength(0);
    expect(state.pots).toHaveLength(0);
    expect(state.currentPlayerId).toBeUndefined();
  });

  it('should create a preflop state with players', () => {
    const players: PlayerState[] = [
      {
        id: createPlayerId('p1'),
        seat: 0,
        stack: chips(990),
        committed: chips(10),
        status: PlayerStatus.Active,
        holeCards: {
          cards: [
            createCard(Rank.Ace, Suit.Hearts),
            createCard(Rank.King, Suit.Hearts),
          ],
        },
      },
      {
        id: createPlayerId('p2'),
        seat: 1,
        stack: chips(980),
        committed: chips(20),
        status: PlayerStatus.Active,
        holeCards: {
          cards: [
            createCard(Rank.Queen, Suit.Diamonds),
            createCard(Rank.Jack, Suit.Diamonds),
          ],
        },
      },
    ];

    const state: TableState = {
      phase: TablePhase.Preflop,
      handId: 1,
      players,
      communityCards: [],
      pots: [
        {
          total: chips(30),
          participants: [createPlayerId('p1'), createPlayerId('p2')],
        },
      ],
      currentPlayerId: createPlayerId('p1'),
    };

    expect(state.phase).toBe(TablePhase.Preflop);
    expect(state.handId).toBe(1);
    expect(state.players).toHaveLength(2);
    expect(state.communityCards).toHaveLength(0);
    expect(state.pots).toHaveLength(1);
    expect(state.currentPlayerId).toBe('p1');
  });

  it('should create a flop state with 3 community cards', () => {
    const state: TableState = {
      phase: TablePhase.Flop,
      handId: 5,
      players: [],
      communityCards: [
        createCard(Rank.Ace, Suit.Spades),
        createCard(Rank.King, Suit.Clubs),
        createCard(Rank.Queen, Suit.Diamonds),
      ],
      pots: [{ total: chips(100), participants: [] }],
      currentPlayerId: undefined,
    };

    expect(state.phase).toBe(TablePhase.Flop);
    expect(state.communityCards).toHaveLength(3);
  });

  it('should create a turn state with 4 community cards', () => {
    const state: TableState = {
      phase: TablePhase.Turn,
      handId: 10,
      players: [],
      communityCards: [
        createCard(Rank.Ace, Suit.Spades),
        createCard(Rank.King, Suit.Clubs),
        createCard(Rank.Queen, Suit.Diamonds),
        createCard(Rank.Jack, Suit.Hearts),
      ],
      pots: [],
      currentPlayerId: undefined,
    };

    expect(state.phase).toBe(TablePhase.Turn);
    expect(state.communityCards).toHaveLength(4);
  });

  it('should create a river state with 5 community cards', () => {
    const state: TableState = {
      phase: TablePhase.River,
      handId: 15,
      players: [],
      communityCards: [
        createCard(Rank.Ace, Suit.Spades),
        createCard(Rank.King, Suit.Clubs),
        createCard(Rank.Queen, Suit.Diamonds),
        createCard(Rank.Jack, Suit.Hearts),
        createCard(Rank.Ten, Suit.Spades),
      ],
      pots: [],
      currentPlayerId: undefined,
    };

    expect(state.phase).toBe(TablePhase.River);
    expect(state.communityCards).toHaveLength(5);
  });

  it('should support multiple side pots', () => {
    const state: TableState = {
      phase: TablePhase.Showdown,
      handId: 20,
      players: [],
      communityCards: [
        createCard(Rank.Ace, Suit.Spades),
        createCard(Rank.King, Suit.Clubs),
        createCard(Rank.Queen, Suit.Diamonds),
        createCard(Rank.Jack, Suit.Hearts),
        createCard(Rank.Ten, Suit.Spades),
      ],
      pots: [
        {
          total: chips(300),
          participants: [
            createPlayerId('p1'),
            createPlayerId('p2'),
            createPlayerId('p3'),
          ],
        },
        {
          total: chips(200),
          participants: [createPlayerId('p2'), createPlayerId('p3')],
        },
        {
          total: chips(100),
          participants: [createPlayerId('p3')],
        },
      ],
      currentPlayerId: undefined,
    };

    expect(state.pots).toHaveLength(3);
    expect(state.pots[0].total).toBe(300n);
    expect(state.pots[1].total).toBe(200n);
    expect(state.pots[2].total).toBe(100n);
  });
});
