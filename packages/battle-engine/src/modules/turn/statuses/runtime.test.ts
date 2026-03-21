import { describe, expect, it } from 'bun:test';
import { getActivePokemon } from '../party-state';
import { buildPartyEntries, PLAYER_ONE_ID, PLAYER_TWO_ID } from '../test/builders/shared';
import { getStatusHandlers, runBeforeMoveHooks, runModifyDamageHooks } from './runtime';
import { MoveStatusContext, StatusHandlerRegistry } from './types';

function createMoveStatusContext(): MoveStatusContext {
  const simulatedParties = new Map([
    [PLAYER_ONE_ID, buildPartyEntries(PLAYER_ONE_ID, ['Charizard', 'Raichu', 'Nidoking'])],
    [PLAYER_TWO_ID, buildPartyEntries(PLAYER_TWO_ID, ['Exeggutor', 'Fearow', 'Charizard'])],
  ]);
  const attacker = getActivePokemon(simulatedParties, PLAYER_ONE_ID);
  const defender = getActivePokemon(simulatedParties, PLAYER_TWO_ID);

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

describe('status runtime', () => {
  it('safely skips statuses that have no registered handlers', () => {
    const context = createMoveStatusContext();
    context.attacker.majorStatus = 'burn';
    context.attacker.volatileStatuses = [{ kind: 'confusion', turnsRemaining: 2 }];

    expect(
      runBeforeMoveHooks({
        context,
        pokemon: context.attacker,
        registry: {},
      }).canAct,
    ).toBe(true);
    expect(
      runModifyDamageHooks({
        context,
        damage: 42,
        pokemon: context.attacker,
        registry: {},
      }).damage,
    ).toBe(42);
  });

  it('runs handlers in deterministic major-then-volatile order', () => {
    const context = createMoveStatusContext();
    context.attacker.majorStatus = 'burn';
    context.attacker.volatileStatuses = [{ kind: 'confusion', turnsRemaining: 3 }];
    const calls: string[] = [];

    const registry = {
      burn: {
        beforeMove() {
          calls.push('burn');
          return { canAct: true };
        },
      },
      confusion: {
        beforeMove() {
          calls.push('confusion');
          return { canAct: true };
        },
      },
    } satisfies StatusHandlerRegistry;

    expect(getStatusHandlers(context.attacker, registry).map((entry) => entry.kind)).toEqual([
      'burn',
      'confusion',
    ]);

    runBeforeMoveHooks({
      context,
      pokemon: context.attacker,
      registry,
    });

    expect(calls).toEqual(['burn', 'confusion']);
  });

  it('allows a beforeMove hook to block the action', () => {
    const context = createMoveStatusContext();
    context.attacker.majorStatus = 'freeze';
    let laterHandlerCalled = false;

    const registry = {
      freeze: {
        beforeMove() {
          return { canAct: false };
        },
      },
      confusion: {
        beforeMove() {
          laterHandlerCalled = true;
          return { canAct: true };
        },
      },
    } satisfies StatusHandlerRegistry;

    context.attacker.volatileStatuses = [{ kind: 'confusion', turnsRemaining: 2 }];

    expect(
      runBeforeMoveHooks({
        context,
        pokemon: context.attacker,
        registry,
      }).canAct,
    ).toBe(false);
    expect(laterHandlerCalled).toBe(false);
  });

  it('allows modifyDamage hooks to change the computed damage', () => {
    const context = createMoveStatusContext();
    context.attacker.majorStatus = 'burn';

    const registry = {
      burn: {
        modifyDamage(ctx) {
          return { damage: Math.floor(ctx.damage / 2) };
        },
      },
    } satisfies StatusHandlerRegistry;

    expect(
      runModifyDamageHooks({
        context,
        damage: 21,
        pokemon: context.attacker,
        registry,
      }).damage,
    ).toBe(10);
  });
});
