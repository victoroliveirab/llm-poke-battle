import { describe, expect, it } from 'bun:test';
import { getActivePokemon } from '../party-state';
import { buildPartyEntries, PLAYER_ONE_ID, PLAYER_TWO_ID } from '../test/builders/shared';
import { confusionStatusHandler } from './confusion';
import { MoveStatusContext } from './types';

function createMoveStatusContext(
  randomSequence: number[],
  turnsRemaining: number,
): MoveStatusContext {
  const simulatedParties = new Map([
    [PLAYER_ONE_ID, buildPartyEntries(PLAYER_ONE_ID, ['Charizard', 'Raichu', 'Nidoking'])],
    [PLAYER_TWO_ID, buildPartyEntries(PLAYER_TWO_ID, ['Exeggutor', 'Fearow', 'Charizard'])],
  ]);
  const attacker = getActivePokemon(simulatedParties, PLAYER_ONE_ID);
  const defender = getActivePokemon(simulatedParties, PLAYER_TWO_ID);
  let randomIndex = 0;

  attacker.volatileStatuses = [{ kind: 'confusion', turnsRemaining }];

  return {
    simulatedParties,
    playerId: PLAYER_ONE_ID,
    opponentPlayerId: PLAYER_TWO_ID,
    random: () => {
      const value = randomSequence[randomIndex];
      randomIndex += 1;
      return typeof value === 'number' ? value : 0;
    },
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

describe('confusion status handler', () => {
  it('self-hits at the expected chance, damages the attacker, and decrements duration', () => {
    const context = createMoveStatusContext([0.2, 0], 2);
    const startingHealth = context.attacker.health;

    expect(confusionStatusHandler.beforeMove?.(context)).toEqual({ canAct: false });

    const selfHitEvent = context.events.find((event) => event.type === 'attack.confused');
    if (!selfHitEvent || selfHitEvent.type !== 'attack.confused') {
      throw new Error('Expected an attack.confused event.');
    }

    expect(selfHitEvent.damage).toBeGreaterThan(0);
    expect(context.attacker.health).toBe(startingHealth - selfHitEvent.damage);
    expect(context.attacker.volatileStatuses).toEqual([
      { kind: 'confusion', turnsRemaining: 1 },
    ]);
    expect(context.events).toContainEqual({
      type: 'pokemon.volatile_status_updated',
      playerId: PLAYER_ONE_ID,
      pokemonName: 'Charizard',
      status: {
        kind: 'confusion',
        turnsRemaining: 1,
      },
    });
  });

  it('lets the pokemon act when the self-hit check fails and still decrements duration', () => {
    const context = createMoveStatusContext([0.34], 2);

    expect(confusionStatusHandler.beforeMove?.(context)).toEqual({ canAct: true });
    expect(context.events).toEqual([
      {
        type: 'pokemon.volatile_status_updated',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: {
          kind: 'confusion',
          turnsRemaining: 1,
        },
      },
    ]);
    expect(context.attacker.volatileStatuses).toEqual([
      { kind: 'confusion', turnsRemaining: 1 },
    ]);
  });

  it('clears confusion when the duration expires and allows the pokemon to act normally', () => {
    const context = createMoveStatusContext([0.2], 1);

    expect(confusionStatusHandler.beforeMove?.(context)).toEqual({ canAct: true });
    expect(context.attacker.volatileStatuses).toEqual([]);
    expect(context.events).toEqual([
      {
        type: 'pokemon.volatile_status_changed',
        playerId: PLAYER_ONE_ID,
        pokemonName: 'Charizard',
        status: {
          kind: 'confusion',
          turnsRemaining: 0,
        },
        active: false,
        sourcePlayerId: PLAYER_ONE_ID,
        moveName: 'Strength',
      },
    ]);
    expect(
      context.events.some((event) => event.type === 'attack.confused'),
    ).toBe(false);
  });
});
