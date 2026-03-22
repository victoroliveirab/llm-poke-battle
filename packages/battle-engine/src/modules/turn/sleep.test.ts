import { describe, expect, it } from 'bun:test';
import { resumeTurnAfterReplacement } from './resolve-turn';
import { createTurnStateFixture } from './test/builders/turn-state-fixture';
import { PLAYER_ONE_ID, PLAYER_TWO_ID } from './test/builders/shared';

describe('turn sleep status effect', () => {
  it('prevents a sleeping pokemon from executing its move and decrements the counter', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.5, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = {
      kind: 'sleep',
      turnsRemaining: 2,
    };

    const result = fixture.resolveAttackTurn('Strength', 'Sludge Bomb');

    expect(
      result.events.some(
        (event) => event.type === 'attack.asleep' && event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.major_status_updated' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status.kind === 'sleep' &&
          event.status.turnsRemaining === 1,
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus).toEqual({
      kind: 'sleep',
      turnsRemaining: 1,
    });
  });

  it('wakes up and acts on the same turn', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 1 accuracy check
        0.9, // Player 1 crit check
        0.5, // Player 1 damage random factor
        0.5, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
        0.99, // Player 2 poison chance fails
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = {
      kind: 'sleep',
      turnsRemaining: 1,
    };

    const result = fixture.resolveAttackTurn('Strength', 'Sludge Bomb');

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status.kind === 'sleep' &&
          event.status.turnsRemaining === 0 &&
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

  it('does not decrement sleep when the pokemon switches out and back in', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.5, // Player 2 accuracy check after first switch
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
        0.5, // Player 2 accuracy check after return switch
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
        0.5, // Player 2 accuracy check after sleep blocks
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = {
      kind: 'sleep',
      turnsRemaining: 3,
    };

    const switchOutResult = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Raichu'),
      fixture.attack(PLAYER_TWO_ID, 'Sludge Bomb'),
    );
    const switchedOutPokemon = fixture.simulatedParties
      .get(PLAYER_ONE_ID)
      ?.find((pokemon) => pokemon.name === 'Charizard');

    expect(
      switchOutResult.events.some(
        (event) =>
          event.type === 'pokemon.major_status_updated' &&
          event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
    expect(switchedOutPokemon?.majorStatus).toEqual({
      kind: 'sleep',
      turnsRemaining: 3,
    });

    const switchInResult = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Charizard'),
      fixture.attack(PLAYER_TWO_ID, 'Sludge Bomb'),
    );

    expect(
      switchInResult.events.some(
        (event) =>
          event.type === 'pokemon.major_status_updated' &&
          event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus).toEqual({
      kind: 'sleep',
      turnsRemaining: 3,
    });

    const resumedTurn = fixture.resolveAttackTurn('Strength', 'Sludge Bomb');

    expect(
      resumedTurn.events.some(
        (event) =>
          event.type === 'pokemon.major_status_updated' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status.kind === 'sleep' &&
          event.status.turnsRemaining === 2,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus).toEqual({
      kind: 'sleep',
      turnsRemaining: 2,
    });
  });

  it('can wake up and be put back to sleep later in the same turn', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 1 accuracy check
        0.9, // Player 1 crit check
        0.5, // Player 1 damage random factor
        0, // Player 2 Sleep Powder accuracy check
        0, // Player 2 sleep effect chance
        0.99, // Player 2 sleep duration => 4 turns
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus = {
      kind: 'sleep',
      turnsRemaining: 1,
    };

    const result = fixture.resolveAttackTurn('Strength', 'Sleep Powder');

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status.kind === 'sleep' &&
          event.status.turnsRemaining === 0 &&
          event.active === false,
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status.kind === 'sleep' &&
          event.status.turnsRemaining === 4 &&
          event.active === true,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus).toEqual({
      kind: 'sleep',
      turnsRemaining: 4,
    });
  });

  it('does not decrement sleep when a sleeping bench pokemon is brought in as a replacement', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.2, // Player 1 confusion self-hit succeeds
        0, // Player 1 confusion damage random factor
        0.5, // Player 2 accuracy check after replacement
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).volatileStatuses = [
      { kind: 'confusion', turnsRemaining: 2 },
    ];
    fixture.setActivePokemonHealth(PLAYER_ONE_ID, 1);
    const sleepingBenchPokemon = fixture.simulatedParties
      .get(PLAYER_ONE_ID)
      ?.find((pokemon) => pokemon.name === 'Raichu');
    if (!sleepingBenchPokemon) {
      throw new Error('Expected Raichu to exist on the bench.');
    }
    sleepingBenchPokemon.majorStatus = {
      kind: 'sleep',
      turnsRemaining: 3,
    };

    const interruptedTurn = fixture.resolveAttackTurn('Strength', 'Sludge Bomb');
    if (!interruptedTurn.suspendedTurn) {
      throw new Error('Expected the turn to suspend for a replacement switch.');
    }

    const resumedTurn = resumeTurnAfterReplacement({
      playerIds: [PLAYER_ONE_ID, PLAYER_TWO_ID],
      replacementAction: fixture.switchPokemon(PLAYER_ONE_ID, 'Raichu'),
      remainingAction: interruptedTurn.suspendedTurn.remainingAction,
      simulatedParties: fixture.simulatedParties,
      getSpecies: fixture.getSpecies,
      random: fixture.random,
    });

    expect(
      resumedTurn.events.some(
        (event) =>
          event.type === 'pokemon.major_status_updated' &&
          event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
    expect(
      resumedTurn.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus).toEqual({
      kind: 'sleep',
      turnsRemaining: 3,
    });
  });
});
