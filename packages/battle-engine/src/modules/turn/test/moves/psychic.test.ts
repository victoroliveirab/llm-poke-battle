import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Psychic', () => {
  it('deals damage before applying its special defense drop chance', () => {
    const fixture = createMoveFixture({
      playerOneParty: [
        {
          species: 'Exeggutor',
          gender: 'male',
          stats: {
            hp: 95,
            attack: 95,
            defense: 85,
            specialAttack: 125,
            specialDefense: 75,
            speed: 55,
          },
          type1: 'grass',
          type2: 'psychic',
          moves: ['psychic'],
        },
        'Fearow',
        'Charizard',
      ],
      playerTwoParty: [
        {
          species: 'Gyarados',
          gender: 'male',
          stats: {
            attack: 125,
            defense: 79,
            specialAttack: 60,
            specialDefense: 100,
            speed: 81,
            hp: 95,
          },
          type1: 'water',
          type2: 'flying',
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

    const { events } = fixture.execute('Psychic', 'Growl');
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
});
