import { describe, expect, it } from 'bun:test';
import {
  clampCriticalStage,
  getCriticalHitChance,
  isCriticalHit,
} from './critical';

describe('critical hit calculations', () => {
  it('does not allow negative critical stages', () => {
    expect(clampCriticalStage(-5)).toBe(0);
  });

  it('uses guaranteed critical hits at stage three and above', () => {
    expect(getCriticalHitChance(3)).toBe(1);
    expect(getCriticalHitChance(8)).toBe(1);
  });

  it('evaluates critical hits against the injected random source', () => {
    expect(isCriticalHit(2, () => 0.49)).toBe(true);
    expect(isCriticalHit(2, () => 0.51)).toBe(false);
  });
});
