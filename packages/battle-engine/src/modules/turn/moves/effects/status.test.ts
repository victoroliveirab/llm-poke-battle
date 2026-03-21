import { describe, expect, it } from 'bun:test';
import { getActivePokemon } from '../../party-state';
import {
  buildAttackAction,
  buildPartyEntries,
  PLAYER_ONE_ID,
  PLAYER_TWO_ID,
} from '../../test/builders/shared';
import { applyStatusEffect } from './status';
import { MoveExecutionContext } from '../types';

describe('applyStatusEffect', () => {
  it('applies major statuses like burn and freeze', () => {
    const burnContext = createContext([0]);
    applyStatusEffect({
      effect: {
        kind: 'apply-status',
        target: 'opponent',
        chance: 100,
        status: {
          kind: 'major-status',
          status: 'burn',
        },
      },
      isStatusOnlyMove: false,
      context: burnContext,
    });

    expect(burnContext.defender.majorStatus).toBe('burn');
    expect(
      burnContext.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status === 'burn' &&
          event.active === true,
      ),
    ).toBe(true);

    const freezeContext = createContext([0]);
    applyStatusEffect({
      effect: {
        kind: 'apply-status',
        target: 'opponent',
        chance: 100,
        status: {
          kind: 'major-status',
          status: 'freeze',
        },
      },
      isStatusOnlyMove: false,
      context: freezeContext,
    });

    expect(freezeContext.defender.majorStatus).toBe('freeze');
    expect(
      freezeContext.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status === 'freeze' &&
          event.active === true,
      ),
    ).toBe(true);
  });

  it('applies volatile statuses like confusion from move metadata', () => {
    const context = createContext([0, 0.6]);

    applyStatusEffect({
      effect: {
        kind: 'apply-status',
        target: 'opponent',
        chance: 100,
        status: {
          kind: 'volatile-status',
          status: 'confusion',
        },
      },
      isStatusOnlyMove: true,
      context,
    });

    expect(context.defender.volatileStatuses).toEqual([
      {
        kind: 'confusion',
        turnsRemaining: 3,
      },
    ]);
    expect(
      context.events.some(
        (event) =>
          event.type === 'pokemon.volatile_status_changed' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status.kind === 'confusion' &&
          event.status.turnsRemaining === 3 &&
          event.active === true,
      ),
    ).toBe(true);
  });

  it('keeps already-affected logic for major status-only moves', () => {
    const context = createContext([0]);
    context.defender.majorStatus = 'paralysis';

    applyStatusEffect({
      effect: {
        kind: 'apply-status',
        target: 'opponent',
        chance: 100,
        status: {
          kind: 'major-status',
          status: 'paralysis',
        },
      },
      isStatusOnlyMove: true,
      context,
    });

    expect(
      context.events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === PLAYER_ONE_ID &&
          event.targetPlayerId === PLAYER_TWO_ID &&
          event.status === 'paralysis',
      ),
    ).toBe(true);
    expect(
      context.events.some(
        (event) => event.type === 'pokemon.major_status_changed',
      ),
    ).toBe(false);
  });
});

function createContext(randomSequence: number[]): MoveExecutionContext {
  const simulatedParties = new Map([
    [PLAYER_ONE_ID, buildPartyEntries(PLAYER_ONE_ID, ['Lapras', 'Fearow', 'Charizard'])],
    [PLAYER_TWO_ID, buildPartyEntries(PLAYER_TWO_ID, ['Nidoking', 'Fearow', 'Charizard'])],
  ]);
  const attacker = getActivePokemon(simulatedParties, PLAYER_ONE_ID);
  const defender = getActivePokemon(simulatedParties, PLAYER_TWO_ID);
  let randomIndex = 0;

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
    attackerAction: buildAttackAction(PLAYER_ONE_ID, 'Confuse Ray'),
    attackerSpecies: {
      ...attacker,
      moves: [],
      species: attacker.name,
      type1: 'water',
      type2: 'ice',
    },
    defender,
    defenderAction: buildAttackAction(PLAYER_TWO_ID, 'Sludge Bomb'),
    defenderSpecies: {
      ...defender,
      moves: [],
      species: defender.name,
      type1: 'poison',
      type2: 'ground',
    },
    move: {
      accuracy: 100,
      class: 'special',
      effects: [],
      name: 'Confuse Ray',
      power: 0,
      type: 'ghost',
    },
  };
}
