import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from './test/builders/move-fixture';
import { getDamageAppliedEvent, PLAYER_ONE_ID } from './test/builders/shared';

describe('turn critical hit resolution', () => {
  it('marks damage events with critical=false when crit check fails', () => {
    const fixture = createMoveFixture({
      randomSequence: [
        0, // Strength hit check
        0.9, // crit check (fails at stage 0)
        0, // damage random factor
      ],
    });

    const damageEvent = getDamageAppliedEvent(
      fixture.execute('Strength', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    );
    expect(damageEvent.critical).toBe(false);
  });

  it('marks damage events with critical=true and increases damage when crit lands', () => {
    const nonCritFixture = createMoveFixture({
      randomSequence: [0, 0.9, 0],
    });
    const nonCritDamage = getDamageAppliedEvent(
      nonCritFixture.execute('Strength', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    ).damage;

    const critFixture = createMoveFixture({
      randomSequence: [0, 0, 0],
    });
    const critEvent = getDamageAppliedEvent(
      critFixture.execute('Strength', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    );

    expect(critEvent.critical).toBe(true);
    expect(critEvent.damage).toBeGreaterThan(nonCritDamage);
  });

  it('does not ignore stat stages on critical hits', () => {
    const unstagedNonCritFixture = createMoveFixture({
      randomSequence: [0, 0.9, 0],
    });
    const unstagedNonCritDamage = getDamageAppliedEvent(
      unstagedNonCritFixture.execute('Strength', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    ).damage;

    const stagedNonCritFixture = createMoveFixture({
      randomSequence: [0, 0.9, 0],
    });
    stagedNonCritFixture.setActivePokemonStages(PLAYER_ONE_ID, { attack: -6 });
    stagedNonCritFixture.setActivePokemonStages('player-two', { defense: 6 });
    const stagedNonCritDamage = getDamageAppliedEvent(
      stagedNonCritFixture.execute('Strength', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    ).damage;

    const stagedCritFixture = createMoveFixture({
      randomSequence: [0, 0, 0],
    });
    stagedCritFixture.setActivePokemonStages(PLAYER_ONE_ID, { attack: -6 });
    stagedCritFixture.setActivePokemonStages('player-two', { defense: 6 });
    const stagedCritDamageEvent = getDamageAppliedEvent(
      stagedCritFixture.execute('Strength', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    );

    expect(stagedCritDamageEvent.critical).toBe(true);
    expect(stagedCritDamageEvent.damage).toBeGreaterThan(stagedNonCritDamage);
    expect(stagedCritDamageEvent.damage).toBeLessThan(unstagedNonCritDamage);
  });
});
