import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Flash Cannon', () => {
  it('deals damage before applying its special defense drop chance', () => {
    const fixture = createMoveFixture({
      playerOneParty: [
        {
          species: 'Flashmon',
          gender: 'genderless',
          stats: {
            attack: 70,
            defense: 95,
            specialAttack: 120,
            specialDefense: 90,
            speed: 80,
            hp: 90,
          },
          type1: 'steel',
          type2: null,
          moves: ['flash-cannon'],
        },
        'Fearow',
        'Charizard',
      ],
      playerTwoParty: [
        {
          species: 'Targetmon',
          gender: 'male',
          stats: {
            attack: 80,
            defense: 85,
            specialAttack: 70,
            specialDefense: 95,
            speed: 75,
            hp: 90,
          },
          type1: 'normal',
          type2: null,
          moves: ['growl'],
        },
        'Fearow',
        'Charizard',
      ],
      randomSequence: [
        0, // accuracy check
        0.9, // critical check (fails)
        0, // damage random factor
        0.05, // special defense drop chance
      ],
    });

    const { events } = fixture.execute('Flash Cannon', 'Growl');
    const damageIndex = events.findIndex(
      (event) => event.type === 'damage.applied',
    );
    const stageIndex = events.findIndex(
      (event) =>
        event.type === 'battle.stat_stage_changed' &&
        event.playerId === 'player-two' &&
        event.stat === 'specialDefense' &&
        event.delta === -1,
    );

    expect(damageIndex).toBeGreaterThanOrEqual(0);
    expect(stageIndex).toBeGreaterThan(damageIndex);
    expect(fixture.getActivePokemon('player-two').specialDefenseStage).toBe(-1);
  });

  it('still deals damage when the special defense drop does not trigger', () => {
    const fixture = createMoveFixture({
      playerOneParty: [
        {
          species: 'Flashmon',
          gender: 'genderless',
          stats: {
            attack: 70,
            defense: 95,
            specialAttack: 120,
            specialDefense: 90,
            speed: 80,
            hp: 90,
          },
          type1: 'steel',
          type2: null,
          moves: ['flash-cannon'],
        },
        'Fearow',
        'Charizard',
      ],
      playerTwoParty: [
        {
          species: 'Targetmon',
          gender: 'male',
          stats: {
            attack: 80,
            defense: 85,
            specialAttack: 70,
            specialDefense: 95,
            speed: 75,
            hp: 90,
          },
          type1: 'normal',
          type2: null,
          moves: ['growl'],
        },
        'Fearow',
        'Charizard',
      ],
      randomSequence: [
        0, // accuracy check
        0.9, // critical check (fails)
        0, // damage random factor
        0.5, // special defense drop chance miss
      ],
    });

    const { events } = fixture.execute('Flash Cannon', 'Growl');

    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'battle.stat_stage_changed' &&
          event.playerId === 'player-two' &&
          event.stat === 'specialDefense',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' &&
          event.playerId === 'player-one' &&
          event.moveName === 'Flash Cannon',
      ),
    ).toBe(false);
    expect(fixture.getActivePokemon('player-two').specialDefenseStage).toBe(0);
  });
});
