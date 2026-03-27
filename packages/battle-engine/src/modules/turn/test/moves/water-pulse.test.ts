import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Water Pulse', () => {
  it('deals damage before applying its confusion chance', () => {
    const fixture = createMoveFixture({
      playerOneParty: [
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
          moves: ['water-pulse'],
        },
        'Fearow',
        'Charizard',
      ],
      playerTwoParty: [
        {
          species: 'Clefable',
          gender: 'male',
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
          moves: ['growl'],
        },
        'Fearow',
        'Charizard',
      ],
      randomSequence: [
        0, // accuracy check
        0.9, // critical check (fails)
        0, // damage random factor
        0.05, // confusion chance
        0.6, // confusion duration => 3 turns
      ],
    });

    const { events } = fixture.execute('Water Pulse', 'Growl');
    const damageIndex = events.findIndex(
      (event) => event.type === 'damage.applied',
    );
    const statusIndex = events.findIndex(
      (event) =>
        event.type === 'pokemon.volatile_status_changed' &&
        event.playerId === 'player-two' &&
        event.status.kind === 'confusion' &&
        event.active === true,
    );

    expect(damageIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThan(damageIndex);
    expect(fixture.getActivePokemon('player-two').volatileStatuses).toEqual([
      { kind: 'confusion', turnsRemaining: 3 },
    ]);
  });
});
