import { describe, expect, it } from 'bun:test';
import { getActivePokemon } from '../party-state';
import {
  buildPartyEntries,
  PLAYER_ONE_ID,
  PLAYER_TWO_ID,
} from '../test/builders/shared';
import { paralysisStatusHandler } from './paralysis';
import { MoveStatusContext } from './types';

function createMoveStatusContext(randomValue: number): MoveStatusContext {
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

  attacker.majorStatus = { kind: 'paralysis' };

  return {
    simulatedParties,
    playerId: PLAYER_ONE_ID,
    opponentPlayerId: PLAYER_TWO_ID,
    random: () => randomValue,
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

describe('paralysis status handler', () => {
  it('blocks the move at the expected chance and emits attack.paralyzed', () => {
    const context = createMoveStatusContext(0.24);

    expect(paralysisStatusHandler.beforeMove?.(context)).toEqual({
      canAct: false,
    });
    expect(context.events).toEqual([
      {
        type: 'attack.paralyzed',
        playerId: PLAYER_ONE_ID,
        targetPlayerId: PLAYER_TWO_ID,
        pokemonName: 'Charizard',
        targetPokemonName: 'Exeggutor',
        moveName: 'Strength',
      },
    ]);
  });

  it('allows the move and emits no extra events when the check passes', () => {
    const context = createMoveStatusContext(0.25);

    expect(paralysisStatusHandler.beforeMove?.(context)).toEqual({
      canAct: true,
    });
    expect(context.events).toEqual([]);
  });
});
