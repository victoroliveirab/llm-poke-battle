import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Thunderbolt', () => {
  it('deals damage before applying its paralysis chance', () => {
    const fixture = createMoveFixture({
      playerOneParty: [
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
          moves: ['thunderbolt'],
        },
        'Fearow',
        'Charizard',
      ],
      playerTwoParty: [
        {
          species: 'Clefable',
          gender: 'female',
          stats: {
            attack: 70,
            defense: 73,
            specialAttack: 95,
            specialDefense: 90,
            speed: 60,
            hp: 95,
          },
          type1: 'fairy',
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
        0.05, // paralysis chance
      ],
    });

    const { events } = fixture.execute('Thunderbolt', 'Growl');
    const damageIndex = events.findIndex(
      (event) => event.type === 'damage.applied',
    );
    const statusIndex = events.findIndex(
      (event) =>
        event.type === 'pokemon.major_status_changed' &&
        event.playerId === 'player-two' &&
        event.status.kind === 'paralysis' &&
        event.active === true,
    );

    expect(damageIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThan(damageIndex);
    expect(fixture.getActivePokemon('player-two').majorStatus).toEqual({
      kind: 'paralysis',
    });
  });
});
