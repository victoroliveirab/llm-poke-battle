import { describe, expect, it } from 'bun:test';
import { getActivePokemon } from '../party-state';
import {
  buildPartyEntries,
  PLAYER_ONE_ID,
  PLAYER_TWO_ID,
} from '../test/builders/shared';
import { badlyPoisonedStatusHandler } from './badly-poisoned';
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
  attacker.majorStatus = { kind: 'badly-poisoned', turnsElapsed: 1 };

  return {
    simulatedParties,
    playerId: PLAYER_ONE_ID,
    opponentPlayerId: PLAYER_TWO_ID,
    random: () => 0,
    events: [],
  };
}

describe('badly poisoned status handler', () => {
  it('applies residual damage at end of turn and increments the counter', () => {
    const context = createStatusContext();
    const pokemon = getActivePokemon(context.simulatedParties, PLAYER_ONE_ID);
    const expectedDamage = Math.floor(pokemon.stats.hp / 16);

    badlyPoisonedStatusHandler.endTurn?.(context);

    expect(pokemon.health).toBe(pokemon.stats.hp - expectedDamage);
    expect(pokemon.majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 2,
    });
    expect(context.events).toEqual([
      {
        type: 'pokemon.hurt_by_status',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: 'badly-poisoned',
        damage: expectedDamage,
      },
      {
        type: 'pokemon.major_status_updated',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: {
          kind: 'badly-poisoned',
          turnsElapsed: 2,
        },
        active: true,
        sourcePlayerId: PLAYER_ONE_ID,
        moveName: 'status',
      },
    ]);
  });

  it('increases damage on the next turn', () => {
    const context = createStatusContext();
    const pokemon = getActivePokemon(context.simulatedParties, PLAYER_ONE_ID);
    const expectedFirstDamage = Math.floor(pokemon.stats.hp / 16);
    const expectedSecondDamage = Math.floor((pokemon.stats.hp * 2) / 16);

    badlyPoisonedStatusHandler.endTurn?.(context);
    context.events = [];
    badlyPoisonedStatusHandler.endTurn?.(context);

    expect(pokemon.health).toBe(
      pokemon.stats.hp - expectedFirstDamage - expectedSecondDamage,
    );
    expect(pokemon.majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 3,
    });
    expect(context.events).toEqual([
      {
        type: 'pokemon.hurt_by_status',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: 'badly-poisoned',
        damage: expectedSecondDamage,
      },
      {
        type: 'pokemon.major_status_updated',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: {
          kind: 'badly-poisoned',
          turnsElapsed: 3,
        },
        active: true,
        sourcePlayerId: PLAYER_ONE_ID,
        moveName: 'status',
      },
    ]);
  });

  it('respects minimum damage of one', () => {
    const context = createStatusContext();
    const pokemon = getActivePokemon(context.simulatedParties, PLAYER_ONE_ID);
    pokemon.stats.hp = 8;
    pokemon.health = 8;

    badlyPoisonedStatusHandler.endTurn?.(context);

    expect(pokemon.health).toBe(7);
    expect(context.events).toEqual([
      {
        type: 'pokemon.hurt_by_status',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: 'badly-poisoned',
        damage: 1,
      },
      {
        type: 'pokemon.major_status_updated',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: {
          kind: 'badly-poisoned',
          turnsElapsed: 2,
        },
        active: true,
        sourcePlayerId: PLAYER_ONE_ID,
        moveName: 'status',
      },
    ]);
  });

  it('can faint the badly poisoned pokemon at end of turn', () => {
    const context = createStatusContext();
    const pokemon = getActivePokemon(context.simulatedParties, PLAYER_ONE_ID);
    pokemon.health = 1;

    badlyPoisonedStatusHandler.endTurn?.(context);

    expect(pokemon.health).toBe(0);
    expect(pokemon.majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 2,
    });
    expect(context.events).toEqual([
      {
        type: 'pokemon.hurt_by_status',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: 'badly-poisoned',
        damage: Math.floor(pokemon.stats.hp / 16),
      },
      {
        type: 'pokemon.major_status_updated',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: {
          kind: 'badly-poisoned',
          turnsElapsed: 2,
        },
        active: true,
        sourcePlayerId: PLAYER_ONE_ID,
        moveName: 'status',
      },
      {
        type: 'pokemon.fainted',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
      },
    ]);
  });

  it('does nothing when the badly poisoned pokemon already fainted', () => {
    const context = createStatusContext();
    const pokemon = getActivePokemon(context.simulatedParties, PLAYER_ONE_ID);
    pokemon.health = 0;

    badlyPoisonedStatusHandler.endTurn?.(context);

    expect(context.events).toEqual([]);
    expect(pokemon.majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 1,
    });
  });
});
