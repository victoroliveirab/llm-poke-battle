import { describe, expect, it } from 'bun:test';
import { getActivePokemon } from '../party-state';
import { buildPartyEntries, PLAYER_ONE_ID, PLAYER_TWO_ID } from '../test/builders/shared';
import { freezeStatusHandler } from './freeze';
import { MoveStatusContext } from './types';

function createMoveStatusContext(randomValue: number): MoveStatusContext {
  const simulatedParties = new Map([
    [PLAYER_ONE_ID, buildPartyEntries(PLAYER_ONE_ID, ['Charizard', 'Raichu', 'Nidoking'])],
    [PLAYER_TWO_ID, buildPartyEntries(PLAYER_TWO_ID, ['Exeggutor', 'Fearow', 'Charizard'])],
  ]);
  const attacker = getActivePokemon(simulatedParties, PLAYER_ONE_ID);
  const defender = getActivePokemon(simulatedParties, PLAYER_TWO_ID);

  attacker.majorStatus = { kind: 'freeze' };

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

describe('freeze status handler', () => {
  it('thaws at the expected chance and lets the pokemon act', () => {
    const context = createMoveStatusContext(0.19);

    expect(freezeStatusHandler.beforeMove?.(context)).toEqual({ canAct: true });
    expect(context.attacker.majorStatus).toBeNull();
    expect(context.events).toEqual([
      {
        type: 'pokemon.major_status_changed',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: {
          kind: 'freeze',
        },
        active: false,
        sourcePlayerId: PLAYER_ONE_ID,
        moveName: 'Strength',
      },
    ]);
  });

  it('blocks the move and emits attack.frozen when the thaw roll fails', () => {
    const context = createMoveStatusContext(0.2);

    expect(freezeStatusHandler.beforeMove?.(context)).toEqual({ canAct: false });
    expect(context.events).toEqual([
      {
        type: 'attack.frozen',
        playerId: PLAYER_ONE_ID,
        targetPlayerId: PLAYER_TWO_ID,
        pokemonName: 'Charizard',
        targetPokemonName: 'Exeggutor',
        moveName: 'Strength',
      },
    ]);
  });
});
