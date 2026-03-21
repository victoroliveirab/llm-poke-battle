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
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_TWO_ID,
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
    playerTwoParty[0].majorStatus = 'burn';
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
    burnedPokemon.majorStatus = 'burn';
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
    playerTwoParty[0].majorStatus = 'burn';
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
        (event) => event.type === 'pokemon.fainted' && event.playerId === PLAYER_TWO_ID,
      ),
    ).toBe(true);
  });
});
