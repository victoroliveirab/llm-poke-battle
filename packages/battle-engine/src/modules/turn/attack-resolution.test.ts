import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from './test/builders/move-fixture';
import {
  getDamageAppliedEvent,
  PLAYER_ONE_ID,
} from './test/builders/shared';
import { StatusHandlerRegistry } from './statuses/types';

describe('turn attack resolution', () => {
  it('consumes PP and emits attack.missed without applying damage on miss', () => {
    const fixture = createMoveFixture({
      randomSequence: [
        0.95, // Charizard Rock Slide miss check (90% accuracy)
      ],
    });

    const { events } = fixture.execute('Rock Slide', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'move.consumed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.moveName === 'Rock Slide',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.moveName === 'Rock Slide',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);

    const rockSlide = fixture
      .getActivePokemon(PLAYER_ONE_ID)
      .moves.find((move: { name: string }) => move.name === 'Rock Slide');
    expect(rockSlide?.remaining).toBe(9);
  });

  it('applies accuracy/evasion stage modifiers to hit checks', () => {
    const lowAccuracyFixture = createMoveFixture({
      randomSequence: [
        0.2, // Fire Punch miss check at -6 accuracy vs +6 evasion (effective 1/9)
      ],
    });
    lowAccuracyFixture.setActivePokemonStages(PLAYER_ONE_ID, { accuracy: -6 });
    lowAccuracyFixture.setActivePokemonStages('player-two', { evasion: 6 });

    const missEvents = lowAccuracyFixture.execute('Fire Punch', 'Sludge Bomb').events;
    expect(
      missEvents.some(
        (event) =>
          event.type === 'attack.missed' && event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);

    const highAccuracyFixture = createMoveFixture({
      randomSequence: [
        0.99, // Fire Punch hit check at +6 accuracy vs -6 evasion
        0.5, // Fire Punch crit check
        0, // Fire Punch damage random factor
      ],
    });
    highAccuracyFixture.setActivePokemonStages(PLAYER_ONE_ID, { accuracy: 6 });
    highAccuracyFixture.setActivePokemonStages('player-two', { evasion: -6 });

    const hitEvents = highAccuracyFixture.execute('Fire Punch', 'Sludge Bomb').events;
    expect(
      hitEvents.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(
      hitEvents.some(
        (event) =>
          event.type === 'attack.missed' && event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
  });

  it('clamps out-of-range stages to the [-6, +6] bounds', () => {
    const fixture = createMoveFixture({
      randomSequence: [
        0.05, // Fire Punch hit check should land when stages are clamped
        0.5, // Fire Punch crit check
        0, // Fire Punch damage random factor
      ],
    });
    fixture.setActivePokemonStages(PLAYER_ONE_ID, { accuracy: -99 });
    fixture.setActivePokemonStages('player-two', { evasion: 99 });

    const events = fixture.execute('Fire Punch', 'Sludge Bomb').events;
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' && event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
  });

  it('applies physical attack and defense stages to damage calculation', () => {
    const baselineFixture = createMoveFixture({
      randomSequence: [
        0, // Strength hit check
        0.9, // crit check (fails)
        0, // damage random factor
      ],
    });
    const baselineDamage = getDamageAppliedEvent(
      baselineFixture.execute('Strength', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    ).damage;

    const boostedAttackFixture = createMoveFixture({
      randomSequence: [0, 0.9, 0],
    });
    boostedAttackFixture.setActivePokemonStages(PLAYER_ONE_ID, { attack: 2 });
    const boostedAttackDamage = getDamageAppliedEvent(
      boostedAttackFixture.execute('Strength', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    ).damage;

    const boostedDefenseFixture = createMoveFixture({
      randomSequence: [0, 0.9, 0],
    });
    boostedDefenseFixture.setActivePokemonStages('player-two', { defense: 2 });
    const boostedDefenseDamage = getDamageAppliedEvent(
      boostedDefenseFixture.execute('Strength', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    ).damage;

    expect(boostedAttackDamage).toBeGreaterThan(baselineDamage);
    expect(boostedDefenseDamage).toBeLessThan(baselineDamage);
  });

  it('applies special attack and special defense stages to damage calculation', () => {
    const baselineFixture = createMoveFixture({
      randomSequence: [
        0, // Fire Punch hit check
        0.9, // crit check (fails)
        0, // damage random factor
      ],
    });
    const baselineDamage = getDamageAppliedEvent(
      baselineFixture.execute('Fire Punch', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    ).damage;

    const boostedSpecialAttackFixture = createMoveFixture({
      randomSequence: [0, 0.9, 0],
    });
    boostedSpecialAttackFixture.setActivePokemonStages(PLAYER_ONE_ID, {
      specialAttack: 2,
    });
    const boostedSpecialAttackDamage = getDamageAppliedEvent(
      boostedSpecialAttackFixture.execute('Fire Punch', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    ).damage;

    const boostedSpecialDefenseFixture = createMoveFixture({
      randomSequence: [0, 0.9, 0],
    });
    boostedSpecialDefenseFixture.setActivePokemonStages('player-two', {
      specialDefense: 2,
    });
    const boostedSpecialDefenseDamage = getDamageAppliedEvent(
      boostedSpecialDefenseFixture.execute('Fire Punch', 'Sludge Bomb').events,
      PLAYER_ONE_ID,
    ).damage;

    expect(boostedSpecialAttackDamage).toBeGreaterThan(baselineDamage);
    expect(boostedSpecialDefenseDamage).toBeLessThan(baselineDamage);
  });

  it('runs afterMove hooks after a move resolves, including misses', () => {
    let afterMoveCalls = 0;
    const fixture = createMoveFixture({
      randomSequence: [
        0.95, // Rock Slide miss check
      ],
      statusHandlerRegistry: {
        burn: {
          afterMove() {
            afterMoveCalls += 1;
          },
        },
      } satisfies StatusHandlerRegistry,
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = 'burn';

    fixture.execute('Rock Slide', 'Sludge Bomb');

    expect(afterMoveCalls).toBe(1);
  });

  it('does not run afterMove hooks when beforeMove blocks the action', () => {
    let afterMoveCalls = 0;
    const fixture = createMoveFixture({
      randomSequence: [
        0, // paralysis block check
      ],
      statusHandlerRegistry: {
        paralysis: {
          beforeMove() {
            return { canAct: false };
          },
          afterMove() {
            afterMoveCalls += 1;
          },
        },
      } satisfies StatusHandlerRegistry,
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = 'paralysis';

    fixture.execute('Rock Slide', 'Sludge Bomb');

    expect(afterMoveCalls).toBe(0);
  });
});
