import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

const ATTRACT_USER = {
  species: 'AttractUser',
  gender: 'female' as const,
  genderMalePercentage: 0,
  stats: {
    hp: 140,
    attack: 75,
    defense: 80,
    specialAttack: 90,
    specialDefense: 85,
    speed: 75,
  },
  type1: 'normal' as const,
  type2: null,
  moves: ['attract', 'growl'],
};

const ATTRACT_TARGET = {
  species: 'AttractTarget',
  gender: 'male' as const,
  genderMalePercentage: 1,
  stats: {
    hp: 150,
    attack: 90,
    defense: 80,
    specialAttack: 70,
    specialDefense: 80,
    speed: 80,
  },
  type1: 'normal' as const,
  type2: null,
  moves: ['strength'],
};

describe('move: Attract', () => {
  it('lands and inflicts infatuation on an opposite-gender opponent', () => {
    const fixture = createMoveFixture({
      playerOneParty: [ATTRACT_USER, 'Raichu', 'Nidoking'],
      playerTwoParty: [ATTRACT_TARGET, 'Fearow', 'Charizard'],
      randomSequence: [
        0, // accuracy
        0, // infatuation chance
      ],
    });

    const { events } = fixture.execute('Attract', 'Strength');

    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.volatile_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'infatuation' &&
          event.active === true,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon('player-two').volatileStatuses).toEqual([
      { kind: 'infatuation' },
    ]);
  });

  it('emits already_affected when the target is already infatuated', () => {
    const fixture = createMoveFixture({
      playerOneParty: [ATTRACT_USER, 'Raichu', 'Nidoking'],
      playerTwoParty: [ATTRACT_TARGET, 'Fearow', 'Charizard'],
      randomSequence: [
        0, // accuracy
      ],
    });
    fixture.getActivePokemon('player-two').volatileStatuses = [
      { kind: 'infatuation' },
    ];

    const { events } = fixture.execute('Attract', 'Strength');

    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === 'player-one' &&
          event.targetPlayerId === 'player-two' &&
          event.moveName === 'Attract' &&
          event.status === 'infatuation' &&
          event.blockingStatus === 'infatuation',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.volatile_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'infatuation' &&
          event.active === true,
      ),
    ).toBe(false);
  });
});
