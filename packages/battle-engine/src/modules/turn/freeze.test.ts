import { describe, expect, it } from 'bun:test';
import { createTurnStateFixture } from './test/builders/turn-state-fixture';
import { PLAYER_ONE_ID, PLAYER_TWO_ID } from './test/builders/shared';

describe('turn freeze status effect', () => {
  it('prevents a frozen pokemon from executing its attack when the thaw roll fails', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.2, // Player 1 thaw roll fails
        0.5, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = 'freeze';

    const events = fixture.resolveAttackTurn('Strength', 'Sludge Bomb').events;

    expect(
      events.some(
        (event) => event.type === 'attack.frozen' && event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
  });

  it('thaws before the move and then executes the attack normally', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.19, // Player 1 thaw roll succeeds
        0, // Player 1 accuracy check
        0.9, // Player 1 crit check
        0.5, // Player 1 damage random factor
        0.5, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = 'freeze';

    const result = fixture.resolveAttackTurn('Strength', 'Sludge Bomb');

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status === 'freeze' &&
          event.active === false,
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus).toBeNull();
  });

  it('does not apply the thaw roll when the frozen pokemon switches', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.5, // Player 2 accuracy check after the switch
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = 'freeze';

    const result = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Raichu'),
      fixture.attack(PLAYER_TWO_ID, 'Sludge Bomb'),
    );
    const party = fixture.simulatedParties.get(PLAYER_ONE_ID);
    const switchedOutPokemon = party?.find((pokemon) => pokemon.name === 'Charizard');

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status === 'freeze' &&
          event.active === false,
      ),
    ).toBe(false);
    expect(switchedOutPokemon?.majorStatus).toBe('freeze');
  });

  it('clears volatile statuses but keeps major status when switching out', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.5, // Player 2 accuracy check after the switch
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = 'paralysis';
    fixture.getActivePokemon(PLAYER_ONE_ID).volatileStatuses = [
      { kind: 'confusion', turnsRemaining: 2 },
    ];

    fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Raichu'),
      fixture.attack(PLAYER_TWO_ID, 'Sludge Bomb'),
    );
    const party = fixture.simulatedParties.get(PLAYER_ONE_ID);
    const switchedOutPokemon = party?.find((pokemon) => pokemon.name === 'Charizard');

    expect(switchedOutPokemon?.majorStatus).toBe('paralysis');
    expect(switchedOutPokemon?.volatileStatuses).toEqual([]);
  });

  it('can thaw and get frozen again in the same turn when the frozen pokemon is faster', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Lapras', 'Fearow', 'Charizard'],
      randomSequence: [
        0.19, // Player 1 thaw roll succeeds
        0, // Player 1 accuracy check
        0.9, // Player 1 crit check
        0.5, // Player 1 damage random factor
        0, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0.5, // Player 2 damage random factor
        0.05, // Player 2 freeze chance succeeds
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = 'freeze';

    const result = fixture.resolveAttackTurn('Strength', 'Ice Beam');

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status === 'freeze' &&
          event.active === false,
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status === 'freeze' &&
          event.active === true,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus).toBe('freeze');
  });

  it('cannot get frozen again in the same turn when the frozen pokemon is slower', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Exeggutor', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Lapras', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0.5, // Player 2 damage random factor
        0.19, // Player 1 thaw roll succeeds
        0, // Player 1 accuracy check
        0.9, // Player 1 crit check
        0.5, // Player 1 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = 'freeze';

    const result = fixture.resolveAttackTurn('Psychic', 'Ice Beam');

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status === 'freeze' &&
          event.active === false,
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status === 'freeze' &&
          event.active === true,
      ),
    ).toBe(false);
    expect(
      result.events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus).toBeNull();
  });
});
