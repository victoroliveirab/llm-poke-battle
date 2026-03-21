import { describe, expect, it } from 'bun:test';
import { calculateDamage } from './damage';

describe('damage calculation', () => {
  it('applies stab, effectiveness, criticals, and random factor', () => {
    const baseline = calculateDamage({
      level: 50,
      power: 80,
      attack: 120,
      defense: 100,
      stab: 1,
      typeEffectiveness: 1,
      critical: false,
      random: () => 0,
    });
    const boosted = calculateDamage({
      level: 50,
      power: 80,
      attack: 120,
      defense: 100,
      stab: 1.5,
      typeEffectiveness: 2,
      critical: true,
      random: () => 0,
    });

    expect(boosted).toBeGreaterThan(baseline);
  });
});
