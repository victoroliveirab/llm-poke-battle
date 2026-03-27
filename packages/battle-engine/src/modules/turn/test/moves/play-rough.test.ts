import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Play Rough', () => {
  it('deals damage before applying its attack drop chance', () => {
    const fixture = createMoveFixture({
      playerOneParty: [
        {
          species: 'Clefable',
          gender: 'female',
          stats: {
            hp: 95,
            attack: 70,
            defense: 73,
            specialAttack: 95,
            specialDefense: 90,
            speed: 60,
          },
          type1: 'fairy',
          type2: null,
          moves: ['play-rough'],
        },
        'Fearow',
        'Charizard',
      ],
      playerTwoParty: [
        {
          species: 'Raichu',
          gender: 'male',
          stats: {
            attack: 90,
            defense: 55,
            specialAttack: 90,
            specialDefense: 80,
            speed: 110,
            hp: 60,
          },
          type1: 'electric',
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
        0.05, // attack drop chance
      ],
    });

    const { events } = fixture.execute('Play Rough', 'Growl');
    const damageIndex = events.findIndex(
      (event) => event.type === 'damage.applied',
    );
    const stageIndex = events.findIndex(
      (event) =>
        event.type === 'battle.stat_stage_changed' &&
        event.playerId === 'player-two' &&
        event.stat === 'attack' &&
        event.delta === -1,
    );

    expect(damageIndex).toBeGreaterThanOrEqual(0);
    expect(stageIndex).toBeGreaterThan(damageIndex);
    expect(fixture.getActivePokemon('player-two').attackStage).toBe(-1);
  });
});
