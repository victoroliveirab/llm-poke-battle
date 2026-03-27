import { describe, expect, it } from 'bun:test';
import { createTurnStateFixture } from './test/builders/turn-state-fixture';
import { PLAYER_TWO_ID } from './test/builders/shared';

const ATTRACT_USER = {
  species: 'TurnAttractUser',
  gender: 'female' as const,
  genderMalePercentage: 0,
  stats: {
    hp: 155,
    attack: 70,
    defense: 85,
    specialAttack: 80,
    specialDefense: 85,
    speed: 70,
  },
  type1: 'normal' as const,
  type2: null,
  moves: ['attract', 'growl'],
};

const ATTRACT_TARGET = {
  species: 'TurnAttractTarget',
  gender: 'male' as const,
  genderMalePercentage: 1,
  stats: {
    hp: 160,
    attack: 90,
    defense: 80,
    specialAttack: 70,
    specialDefense: 80,
    speed: 110,
  },
  type1: 'normal' as const,
  type2: null,
  moves: ['strength'],
};

describe('turn infatuation status effect', () => {
  it('can block a pokemon that was infatuated on a previous turn', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: [ATTRACT_USER, 'Raichu', 'Nidoking'],
      playerTwoParty: [ATTRACT_TARGET, 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 2 Strength accuracy check on turn 1
        0.9, // Player 2 crit check on turn 1
        0, // Player 2 damage random factor on turn 1
        0, // Player 1 Attract accuracy check on turn 1
        0, // Player 1 infatuation chance on turn 1
        0.4, // Player 2 infatuation check on turn 2 (blocked)
        0, // Player 1 Growl accuracy check on turn 2
      ],
    });

    fixture.resolveAttackTurn('Attract', 'Strength');

    expect(fixture.getActivePokemon(PLAYER_TWO_ID).volatileStatuses).toEqual([
      { kind: 'infatuation' },
    ]);

    const turnTwo = fixture.resolveAttackTurn('Growl', 'Strength');

    expect(
      turnTwo.events.some(
        (event) =>
          event.type === 'attack.infatuated' &&
          event.playerId === PLAYER_TWO_ID,
      ),
    ).toBe(true);
    expect(
      turnTwo.events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_TWO_ID,
      ),
    ).toBe(false);
  });
});
