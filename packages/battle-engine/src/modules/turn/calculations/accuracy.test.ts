import { describe, expect, it } from 'bun:test';
import {
  calculateEffectiveAccuracy,
  clampBattleStage,
  getModifiedBattleStat,
} from './accuracy';

describe('accuracy calculations', () => {
  it('clamps stages to the battle range before applying modifiers', () => {
    expect(clampBattleStage(-99)).toBe(-6);
    expect(clampBattleStage(99)).toBe(6);
  });

  it('applies accuracy and evasion stage modifiers to hit chance', () => {
    expect(calculateEffectiveAccuracy(100, -6, 6)).toBeCloseTo(1 / 9, 5);
    expect(calculateEffectiveAccuracy(100, 6, -6)).toBe(1);
  });

  it('reuses the same stage modifier math for battle stats', () => {
    expect(getModifiedBattleStat(90, 2)).toBeCloseTo(150, 5);
    expect(getModifiedBattleStat(90, -2)).toBeCloseTo(54, 5);
  });
});
