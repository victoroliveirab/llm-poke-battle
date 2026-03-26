import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Toxic', () => {
  it('lands and badly poisons the opponent for a custom test species', () => {
    const fixture = createMoveFixture({
      playerOneParty: [
        {
          species: 'Nidoking',
          stats: {
            attack: 70,
            defense: 80,
            specialAttack: 95,
            specialDefense: 90,
            speed: 100,
            hp: 90,
          },
          type1: 'poison',
          type2: null,
          moves: ['toxic', 'growl'],
        },
      ],
      playerTwoParty: [
        {
          species: 'Snorlax',
          stats: {
            attack: 85,
            defense: 85,
            specialAttack: 85,
            specialDefense: 85,
            speed: 70,
            hp: 95,
          },
          type1: 'normal',
          type2: null,
          moves: ['growl'],
        },
      ],
      randomSequence: [
        0, // accuracy check
        0, // status chance
      ],
    });

    const { events } = fixture.execute('Toxic', 'Growl');

    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'badly-poisoned' &&
          event.status.turnsElapsed === 1 &&
          event.active === true,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon('player-two').majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 1,
    });
  });
});
