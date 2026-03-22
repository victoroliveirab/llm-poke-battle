import { describe, expect, it } from 'bun:test';
import { getActivePokemon } from '../party-state';
import {
  buildPartyEntries,
  PLAYER_ONE_ID,
  PLAYER_TWO_ID,
} from '../test/builders/shared';
import { poisonStatusHandler } from './poison';
import { StatusContext } from './types';

function createStatusContext(): StatusContext {
  const simulatedParties = new Map([
    [
      PLAYER_ONE_ID,
      buildPartyEntries(PLAYER_ONE_ID, ['Charizard', 'Raichu', 'Nidoking']),
    ],
    [
      PLAYER_TWO_ID,
      buildPartyEntries(PLAYER_TWO_ID, ['Exeggutor', 'Fearow', 'Charizard']),
    ],
  ]);
  const attacker = getActivePokemon(simulatedParties, PLAYER_ONE_ID);
  attacker.majorStatus = { kind: 'poison' };

  return {
    simulatedParties,
    playerId: PLAYER_ONE_ID,
    opponentPlayerId: PLAYER_TWO_ID,
    random: () => 0,
    events: [],
  };
}

describe('poison status handler', () => {
  it('applies residual damage at end of turn and emits a poison damage event', () => {
    const context = createStatusContext();
    const pokemon = getActivePokemon(context.simulatedParties, PLAYER_ONE_ID);
    const expectedDamage = Math.floor(pokemon.stats.hp / 8);

    poisonStatusHandler.endTurn?.(context);

    expect(pokemon.health).toBe(pokemon.stats.hp - expectedDamage);
    expect(context.events).toEqual([
      {
        type: 'pokemon.hurt_by_status',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: 'poison',
        damage: expectedDamage,
      },
    ]);
  });

  it('can faint the poisoned pokemon at end of turn', () => {
    const context = createStatusContext();
    const pokemon = getActivePokemon(context.simulatedParties, PLAYER_ONE_ID);
    pokemon.health = 1;

    poisonStatusHandler.endTurn?.(context);

    expect(pokemon.health).toBe(0);
    expect(context.events).toEqual([
      {
        type: 'pokemon.hurt_by_status',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: 'poison',
        damage: Math.floor(pokemon.stats.hp / 8),
      },
      {
        type: 'pokemon.fainted',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
      },
    ]);
  });

  it('does nothing when the poisoned pokemon already fainted', () => {
    const context = createStatusContext();
    const pokemon = getActivePokemon(context.simulatedParties, PLAYER_ONE_ID);
    pokemon.health = 0;

    poisonStatusHandler.endTurn?.(context);

    expect(context.events).toEqual([]);
  });
});
