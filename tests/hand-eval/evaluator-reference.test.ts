import { isDeepStrictEqual } from 'node:util';
import { describe, it, expect } from 'vitest';
import { evaluateHand } from '../../src/hand-eval';
import { Card, parseCard } from '../../src/core/card';
import { createShuffledDeck } from '../../src/deck';
import { SeededRng } from '../../src/rng';
import { referenceEvaluateHand } from './reference-evaluator';

function cardsOf(text: string): Card[] {
  return text.split(' ').map(parseCard);
}

function expectSameAsReference(cards: Card[]): void {
  expect(evaluateHand(cards)).toStrictEqual(referenceEvaluateHand(cards));
}

function findFirstDifference(inputs: Card[][]): Card[] | null {
  for (const cards of inputs) {
    const actual = evaluateHand(cards);
    const expected = referenceEvaluateHand(cards);
    if (!isDeepStrictEqual(actual, expected)) {
      return cards;
    }
  }
  return null;
}

function randomInputs(seed: number, count: number): Card[][] {
  const rng = new SeededRng(seed);
  const inputs: Card[][] = [];
  for (let i = 0; i < count; i++) {
    const size = 5 + (i % 3);
    inputs.push(createShuffledDeck(rng).getCards().slice(0, size));
  }
  return inputs;
}

function fewRankInputs(seed: number, count: number): Card[][] {
  const rng = new SeededRng(seed);
  const inputs: Card[][] = [];
  for (let i = 0; i < count; i++) {
    const size = 5 + (i % 3);
    const rankCount = 3 + rng.nextInt(4);
    const ranks = new Set<number>();
    while (ranks.size < rankCount) {
      ranks.add(rng.nextInt(13));
    }
    const pool = createShuffledDeck(rng)
      .getCards()
      .filter((card) => ranks.has(Math.floor(card / 4)));
    inputs.push(pool.slice(0, size));
  }
  return inputs;
}

function suitedInputs(seed: number, count: number): Card[][] {
  const rng = new SeededRng(seed);
  const inputs: Card[][] = [];
  for (let i = 0; i < count; i++) {
    const size = 5 + (i % 3);
    const suit = rng.nextInt(4);
    const deck = createShuffledDeck(rng).getCards();
    const suited = deck.filter((card) => card % 4 === suit);
    const other = deck.filter((card) => card % 4 !== suit);
    const suitedCount = 5 + rng.nextInt(size - 4);
    inputs.push([
      ...suited.slice(0, suitedCount),
      ...other.slice(0, size - suitedCount),
    ]);
  }
  return inputs;
}

describe('evaluateHand matches the reference evaluator', () => {
  it('matches on 30 000 random 5, 6 and 7 card inputs', () => {
    expect(findFirstDifference(randomInputs(20261010, 30000))).toBeNull();
  });

  it('matches on 15 000 inputs with few ranks (many tied combinations)', () => {
    expect(findFirstDifference(fewRankInputs(4242, 15000))).toBeNull();
  });

  it('matches on 5 000 inputs with 5 to 7 cards of one suit', () => {
    expect(findFirstDifference(suitedInputs(777, 5000))).toBeNull();
  });

  it.each([
    ['wheel', 'Ah 2c 3d 4s 5h Kd Qc'],
    ['steel wheel', 'Ah 2h 3h 4h 5h Kd Qc'],
    ['six high straight over wheel', 'Ah 2c 3d 4s 5h 6c Kd'],
    ['broadway', 'Ah Kc Qd Js Th 2c 3d'],
    ['royal flush with extra suited cards', 'Ah Kh Qh Jh Th 9h 8h'],
    ['board plays (straight on board)', '2c 3d 5h 6s 7c 8d 9h'],
    ['board plays (pair kickers on board)', '2c 3d Ah Ad Kc Qs Jh'],
    ['two trips', 'Ah Ad Ac Kc Kd Ks 2h'],
    ['three pairs', 'Ah Ad Kc Kd Qs Qh 2c'],
    ['three pairs with high single', 'Ah Kd Kc Qd Qs Jh Jc'],
    ['quads with pair', 'Ah Ad Ac As Kc Kd 2h'],
    ['quads with trips', '2h 2d 2c 2s Kc Kd Kh'],
    ['flush with six suited cards', 'Ah Kh 9h 7h 5h 3h Qd'],
    ['flush with seven suited cards', 'Ah Kh 9h 7h 5h 3h 2h'],
    ['straight and flush but no straight flush', '9h 8h 7h 6h 5c Ah 2d'],
    ['straight with paired cards', '9h 9c 8d 7s 6h 5c 5d'],
    ['five card high card', '2c 4d 7h 9s Jc'],
    ['five card full house', 'Kc Kd Kh 2s 2c'],
    ['six card two pair', '2c 2d 3h 3s 4c 4d'],
  ])('matches on %s', (_name, text) => {
    expectSameAsReference(cardsOf(text));
  });

  it('returns new arrays on each call', () => {
    const cards = cardsOf('Ah Ad Kc Kd Qs Qh 2c');
    const first = evaluateHand(cards);
    const second = evaluateHand(cards);
    expect(first.primaryRanks).not.toBe(second.primaryRanks);
    expect(first.kickers).not.toBe(second.kickers);
    expect(first.bestCards).not.toBe(second.bestCards);
  });

  it.each([
    ['duplicate cards', [0, 0, 5, 9, 13, 17, 21]],
    ['out of range cards', [52, 60, 3, 7, 11]],
    ['negative cards', [-1, -5, 3, 7, 11, 15]],
    ['negative zero', [-0, 4, 8, 12, 16]],
    ['non-integer cards', [1.5, 4, 8, 12, 16]],
  ])('keeps the old result for invalid input: %s', (_name, cards) => {
    expectSameAsReference(cards);
  });

  it('throws for fewer than 5 or more than 7 cards', () => {
    expect(() => evaluateHand(cardsOf('Ah Kd Qc Js'))).toThrow(
      'Hand evaluation requires 5 to 7 cards'
    );
    expect(() => evaluateHand(cardsOf('Ah Kd Qc Js Th 9h 8h 7h'))).toThrow(
      'Hand evaluation requires 5 to 7 cards'
    );
  });
});
