import { describe, expect, it } from 'bun:test';
import { getActivePokemon } from '../party-state';
import { buildPartyEntries, PLAYER_ONE_ID, PLAYER_TWO_ID } from '../test/builders/shared';
import { burnStatusHandler } from './burn';
import { MoveStatusContext, StatusContext } from './types';

function createMoveStatusContext(moveClass: 'physical' | 'special'): MoveStatusContext {
  const simulatedParties = new Map([
    [PLAYER_ONE_ID, buildPartyEntries(PLAYER_ONE_ID, ['Charizard', 'Raichu', 'Nidoking'])],
    [PLAYER_TWO_ID, buildPartyEntries(PLAYER_TWO_ID, ['Exeggutor', 'Fearow', 'Charizard'])],
  ]);
  const attacker = getActivePokemon(simulatedParties, PLAYER_ONE_ID);
  const defender = getActivePokemon(simulatedParties, PLAYER_TWO_ID);

  attacker.majorStatus = { kind: 'burn' };

  return {
    simulatedParties,
    playerId: PLAYER_ONE_ID,
    opponentPlayerId: PLAYER_TWO_ID,
    random: () => 0,
    events: [],
    attacker,
    defender,
    move: {
      accuracy: 100,
      class: moveClass,
      effects: [{ kind: 'damage' }],
      name: moveClass === 'physical' ? 'Strength' : 'Fire Punch',
      power: 80,
      type: moveClass === 'physical' ? 'normal' : 'fire',
    },
  };
}

function createStatusContext(): StatusContext {
  const simulatedParties = new Map([
    [PLAYER_ONE_ID, buildPartyEntries(PLAYER_ONE_ID, ['Charizard', 'Raichu', 'Nidoking'])],
    [PLAYER_TWO_ID, buildPartyEntries(PLAYER_TWO_ID, ['Exeggutor', 'Fearow', 'Charizard'])],
  ]);
  const attacker = getActivePokemon(simulatedParties, PLAYER_ONE_ID);
  attacker.majorStatus = { kind: 'burn' };

  return {
    simulatedParties,
    playerId: PLAYER_ONE_ID,
    opponentPlayerId: PLAYER_TWO_ID,
    random: () => 0,
    events: [],
  };
}

describe('burn status handler', () => {
  it('reduces physical damage while leaving special damage unchanged', () => {
    const physicalContext = createMoveStatusContext('physical');
    const specialContext = createMoveStatusContext('special');

    expect(burnStatusHandler.modifyDamage?.({ ...physicalContext, damage: 21 })).toEqual({
      damage: 10,
    });
    expect(burnStatusHandler.modifyDamage?.({ ...specialContext, damage: 21 })).toEqual({
      damage: 21,
    });
  });

  it('applies residual damage at end of turn and emits a burn damage event', () => {
    const context = createStatusContext();
    const pokemon = getActivePokemon(context.simulatedParties, PLAYER_ONE_ID);
    const expectedDamage = Math.floor(pokemon.stats.hp / 8);

    burnStatusHandler.endTurn?.(context);

    expect(pokemon.health).toBe(pokemon.stats.hp - expectedDamage);
    expect(context.events).toEqual([
      {
        type: 'pokemon.hurt_by_status',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: 'burn',
        damage: expectedDamage,
      },
    ]);
  });

  it('can faint the burned pokemon at end of turn', () => {
    const context = createStatusContext();
    const pokemon = getActivePokemon(context.simulatedParties, PLAYER_ONE_ID);
    pokemon.health = 1;

    burnStatusHandler.endTurn?.(context);

    expect(pokemon.health).toBe(0);
    expect(context.events).toEqual([
      {
        type: 'pokemon.hurt_by_status',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: 'burn',
        damage: Math.floor(pokemon.stats.hp / 8),
      },
      {
        type: 'pokemon.fainted',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
      },
    ]);
  });
});
