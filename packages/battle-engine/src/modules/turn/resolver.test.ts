import { describe, expect, it } from 'bun:test';
import { getActivePokemon } from './party-state';
import { createTurnStateFixture } from './test/builders/turn-state-fixture';
import { PLAYER_ONE_ID, PLAYER_TWO_ID } from './test/builders/shared';
import { StatusHandlerRegistry } from './statuses/types';

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
        0, // Body Slam accuracy
        0.9, // crit check (fails)
        0.5, // damage random factor
        0, // Sludge Bomb accuracy
        0.9, // crit check (fails)
        0.5, // damage random factor
      ],
      statusHandlerRegistry: {
        burn: {
          endTurn(ctx) {
            getActivePokemon(ctx.simulatedParties, ctx.playerId).health = 0;
          },
        },
      } satisfies StatusHandlerRegistry,
    });
    const playerTwoParty = fixture.simulatedParties.get(PLAYER_TWO_ID);
    if (!playerTwoParty) {
      throw new Error('Expected player two party in resolver fixture.');
    }
    playerTwoParty[0].majorStatus = 'burn';
    playerTwoParty[0].health = 999;
    for (const benchedPokemon of playerTwoParty.slice(1)) {
      benchedPokemon.health = 0;
    }

    const result = fixture.resolveAttackTurn('Body Slam', 'Sludge Bomb');

    expect(result.winner).toBe(PLAYER_ONE_ID);
    expect(result.pendingReplacementPlayers).toEqual([]);
    expect(fixture.getActivePokemon(PLAYER_TWO_ID).health).toBe(0);
  });
});
