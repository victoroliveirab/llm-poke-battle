import { describe, expect, it } from 'bun:test';
import { createTurnStateFixture } from './test/builders/turn-state-fixture';
import { PLAYER_ONE_ID, PLAYER_TWO_ID } from './test/builders/shared';

describe('turn resolver', () => {
  it('skips the second attack when the first attacker knocks out the defender', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Body Slam accuracy
        0.9, // crit check (fails)
        0.5, // damage random factor
      ],
    });
    fixture.setActivePokemonHealth(PLAYER_TWO_ID, 1);

    const result = fixture.resolveAttackTurn('Body Slam', 'Sludge Bomb');

    expect(
      result.events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_TWO_ID,
      ),
    ).toBe(false);
    expect(result.pendingReplacementPlayers).toEqual([PLAYER_TWO_ID]);
    expect(result.winner).toBeNull();
  });

  it('declares a winner when the defender has no healthy pokemon left', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Body Slam accuracy
        0.9, // crit check (fails)
        0.5, // damage random factor
      ],
    });
    fixture.setActivePokemonHealth(PLAYER_TWO_ID, 1);
    const playerTwoParty = fixture.simulatedParties.get(PLAYER_TWO_ID);
    if (!playerTwoParty) {
      throw new Error('Expected player two party in resolver fixture.');
    }
    for (const benchedPokemon of playerTwoParty.slice(1)) {
      benchedPokemon.health = 0;
    }

    const result = fixture.resolveAttackTurn('Body Slam', 'Sludge Bomb');

    expect(result.winner).toBe(PLAYER_ONE_ID);
    expect(result.pendingReplacementPlayers).toEqual([]);
    expect(
      result.events.some(
        (event) => event.type === 'game.over' && event.winner === PLAYER_ONE_ID,
      ),
    ).toBe(true);
  });

  it('resolves switches before attacks and targets the new active pokemon', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Nidoking', 'Raichu'],
      playerTwoParty: ['Nidoking', 'Exeggutor', 'Raichu'],
      randomSequence: [
        0.1, // Sludge Bomb accuracy
        0.9, // crit check (fails)
        0, // damage random factor
      ],
    });

    const result = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Nidoking'),
      fixture.attack(PLAYER_TWO_ID, 'Sludge Bomb'),
    );

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.switched' &&
          event.playerId === PLAYER_ONE_ID &&
          event.pokemonName === 'Nidoking',
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.playerId === PLAYER_ONE_ID &&
          event.pokemonName === 'Nidoking',
      ),
    ).toBe(true);
  });

  it('runs endTurn hooks before determining the winner', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.99, // Exeggutor Stun Spore miss check
      ],
    });
    const playerTwoParty = fixture.simulatedParties.get(PLAYER_TWO_ID);
    if (!playerTwoParty) {
      throw new Error('Expected player two party in resolver fixture.');
    }
    playerTwoParty[0].majorStatus = { kind: 'burn' };
    playerTwoParty[0].health = 1;
    for (const benchedPokemon of playerTwoParty.slice(1)) {
      benchedPokemon.health = 0;
    }

    const result = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Fearow'),
      fixture.attack(PLAYER_TWO_ID, 'Stun Spore'),
    );

    expect(result.winner).toBe(PLAYER_ONE_ID);
    expect(result.pendingReplacementPlayers).toEqual([]);
    expect(fixture.getActivePokemon(PLAYER_TWO_ID).health).toBe(0);
  });

  it('applies burn residual damage at end of turn', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.99, // Exeggutor Stun Spore miss check
      ],
    });
    const burnedPokemon = fixture.getActivePokemon(PLAYER_TWO_ID);
    burnedPokemon.majorStatus = { kind: 'burn' };
    const initialHealth = burnedPokemon.health;
    const expectedBurnDamage = Math.floor(burnedPokemon.stats.hp / 8);

    const result = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Fearow'),
      fixture.attack(PLAYER_TWO_ID, 'Stun Spore'),
    );

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.hurt_by_status' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status === 'burn' &&
          event.damage === expectedBurnDamage,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_TWO_ID).health).toBe(
      initialHealth - expectedBurnDamage,
    );
  });

  it('lets burn KO a pokemon and trigger winner logic correctly', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.99, // Exeggutor Stun Spore miss check
      ],
    });
    const playerTwoParty = fixture.simulatedParties.get(PLAYER_TWO_ID);
    if (!playerTwoParty) {
      throw new Error('Expected player two party in resolver fixture.');
    }
    playerTwoParty[0].majorStatus = { kind: 'burn' };
    playerTwoParty[0].health = 1;
    for (const benchedPokemon of playerTwoParty.slice(1)) {
      benchedPokemon.health = 0;
    }

    const result = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Fearow'),
      fixture.attack(PLAYER_TWO_ID, 'Stun Spore'),
    );

    expect(result.winner).toBe(PLAYER_ONE_ID);
    expect(result.pendingReplacementPlayers).toEqual([]);
    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.hurt_by_status' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status === 'burn',
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.fainted' && event.playerId === PLAYER_TWO_ID,
      ),
    ).toBe(true);
  });

  it('applies poison residual damage at end of turn', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.99, // Exeggutor Stun Spore miss check
      ],
    });
    const poisonedPokemon = fixture.getActivePokemon(PLAYER_TWO_ID);
    poisonedPokemon.majorStatus = { kind: 'poison' };
    const initialHealth = poisonedPokemon.health;
    const expectedPoisonDamage = Math.floor(poisonedPokemon.stats.hp / 8);

    const result = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Fearow'),
      fixture.attack(PLAYER_TWO_ID, 'Stun Spore'),
    );

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.hurt_by_status' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status === 'poison' &&
          event.damage === expectedPoisonDamage,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_TWO_ID).health).toBe(
      initialHealth - expectedPoisonDamage,
    );
  });

  it('damages a poisoned pokemon that switched in this turn', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Fearow', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Raichu', 'Nidoking'],
      randomSequence: [
        0.99, // Exeggutor Stun Spore miss check
      ],
    });
    const playerOneParty = fixture.simulatedParties.get(PLAYER_ONE_ID);
    if (!playerOneParty) {
      throw new Error('Expected player one party in resolver fixture.');
    }
    const switchedInPokemon = playerOneParty[1];
    if (!switchedInPokemon) {
      throw new Error('Expected benched pokemon for switch-in test.');
    }
    switchedInPokemon.majorStatus = { kind: 'poison' };
    const initialHealth = switchedInPokemon.health;
    const expectedPoisonDamage = Math.floor(switchedInPokemon.stats.hp / 8);

    const result = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Fearow'),
      fixture.attack(PLAYER_TWO_ID, 'Stun Spore'),
    );

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.hurt_by_status' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status === 'poison' &&
          event.damage === expectedPoisonDamage,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).name).toBe('Fearow');
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).health).toBe(
      initialHealth - expectedPoisonDamage,
    );
  });

  it('does not damage a poisoned pokemon that switched out this turn', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Fearow', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Raichu', 'Nidoking'],
      randomSequence: [
        0.99, // Exeggutor Stun Spore miss check
      ],
    });
    const switchedOutPokemon = fixture.getActivePokemon(PLAYER_ONE_ID);
    switchedOutPokemon.majorStatus = { kind: 'poison' };
    const initialHealth = switchedOutPokemon.health;

    const result = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Fearow'),
      fixture.attack(PLAYER_TWO_ID, 'Stun Spore'),
    );

    const playerOneParty = fixture.simulatedParties.get(PLAYER_ONE_ID);
    const benchedCharizard = playerOneParty?.find(
      (pokemon) => pokemon.name === 'Charizard',
    );

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.hurt_by_status' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status === 'poison',
      ),
    ).toBe(false);
    expect(benchedCharizard?.health).toBe(initialHealth);
  });

  it('applies increasing badly poisoned damage across consecutive turns', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.99, // turn 1 Exeggutor Stun Spore miss check
        0.99, // turn 2 Exeggutor Stun Spore miss check
      ],
    });
    const badlyPoisonedPokemon = fixture.getActivePokemon(PLAYER_TWO_ID);
    badlyPoisonedPokemon.majorStatus = {
      kind: 'badly-poisoned',
      turnsElapsed: 1,
    };
    const expectedFirstDamage = Math.floor(badlyPoisonedPokemon.stats.hp / 16);
    const expectedSecondDamage = Math.floor(
      (badlyPoisonedPokemon.stats.hp * 2) / 16,
    );

    const firstTurn = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Fearow'),
      fixture.attack(PLAYER_TWO_ID, 'Stun Spore'),
    );

    expect(
      firstTurn.events.some(
        (event) =>
          event.type === 'pokemon.hurt_by_status' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status === 'badly-poisoned' &&
          event.damage === expectedFirstDamage,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_TWO_ID).majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 2,
    });

    const secondTurn = fixture.resolveActions(
      fixture.attack(PLAYER_ONE_ID, 'Drill Peck'),
      fixture.attack(PLAYER_TWO_ID, 'Stun Spore'),
    );

    expect(
      secondTurn.events.some(
        (event) =>
          event.type === 'pokemon.hurt_by_status' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status === 'badly-poisoned' &&
          event.damage === expectedSecondDamage,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_TWO_ID).majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 3,
    });
  });

  it('resets badly poisoned damage when the pokemon switches out and back in', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Fearow', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Raichu', 'Nidoking'],
      randomSequence: [
        0.99, // turn 1 Exeggutor Stun Spore miss check
        0.99, // turn 2 Exeggutor Stun Spore miss check
      ],
    });
    const switchedOutPokemon = fixture.getActivePokemon(PLAYER_ONE_ID);
    switchedOutPokemon.majorStatus = {
      kind: 'badly-poisoned',
      turnsElapsed: 3,
    };
    const initialHealth = switchedOutPokemon.health;
    const expectedResetDamage = Math.floor(switchedOutPokemon.stats.hp / 16);

    const switchOutTurn = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Fearow'),
      fixture.attack(PLAYER_TWO_ID, 'Stun Spore'),
    );

    const playerOneParty = fixture.simulatedParties.get(PLAYER_ONE_ID);
    const benchedCharizard = playerOneParty?.find(
      (pokemon) => pokemon.name === 'Charizard',
    );

    expect(
      switchOutTurn.events.some(
        (event) =>
          event.type === 'pokemon.hurt_by_status' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status === 'badly-poisoned',
      ),
    ).toBe(false);
    expect(benchedCharizard?.health).toBe(initialHealth);
    expect(benchedCharizard?.majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 1,
    });

    const switchInTurn = fixture.resolveActions(
      fixture.switchPokemon(PLAYER_ONE_ID, 'Charizard'),
      fixture.attack(PLAYER_TWO_ID, 'Stun Spore'),
    );

    expect(
      switchInTurn.events.some(
        (event) =>
          event.type === 'pokemon.hurt_by_status' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status === 'badly-poisoned' &&
          event.damage === expectedResetDamage,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 2,
    });
  });
});
