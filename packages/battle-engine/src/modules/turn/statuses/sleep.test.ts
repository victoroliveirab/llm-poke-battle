import { describe, expect, it } from 'bun:test';
import { getActivePokemon } from '../party-state';
import {
  buildPartyEntries,
  PLAYER_ONE_ID,
  PLAYER_TWO_ID,
} from '../test/builders/shared';
import { sleepStatusHandler } from './sleep';
import { MoveStatusContext } from './types';

function createMoveStatusContext(turnsRemaining: number): MoveStatusContext {
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
  const defender = getActivePokemon(simulatedParties, PLAYER_TWO_ID);

  attacker.majorStatus = {
    kind: 'sleep',
    turnsRemaining,
  };

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
      class: 'physical',
      effects: [{ kind: 'damage' }],
      name: 'Strength',
      power: 80,
      type: 'normal',
    },
  };
}

describe('sleep status handler', () => {
  it('decrements the counter, emits an update, and blocks the move while asleep', () => {
    const context = createMoveStatusContext(2);

    expect(sleepStatusHandler.beforeMove?.(context)).toEqual({ canAct: false });
    expect(context.attacker.majorStatus).toEqual({
      kind: 'sleep',
      turnsRemaining: 1,
    });
    expect(context.events).toEqual([
      {
        type: 'pokemon.major_status_updated',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: {
          kind: 'sleep',
          turnsRemaining: 1,
        },
        active: true,
        sourcePlayerId: PLAYER_ONE_ID,
        moveName: 'Strength',
      },
      {
        type: 'attack.asleep',
        playerId: PLAYER_ONE_ID,
        targetPlayerId: PLAYER_TWO_ID,
        pokemonName: 'Charizard',
        targetPokemonName: 'Exeggutor',
        moveName: 'Strength',
      },
    ]);
  });

  it('clears sleep on the wake turn and lets the pokemon act normally', () => {
    const context = createMoveStatusContext(1);

    expect(sleepStatusHandler.beforeMove?.(context)).toEqual({ canAct: true });
    expect(context.attacker.majorStatus).toBeNull();
    expect(context.events).toEqual([
      {
        type: 'pokemon.major_status_changed',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: {
          kind: 'sleep',
          turnsRemaining: 0,
        },
        active: false,
        sourcePlayerId: PLAYER_ONE_ID,
        moveName: 'Strength',
      },
    ]);
  });
});
