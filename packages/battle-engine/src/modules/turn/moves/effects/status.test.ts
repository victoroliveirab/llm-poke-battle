import { describe, expect, it } from 'bun:test';
import { getActivePokemon } from '../../party-state';
import {
  buildAttackAction,
  buildPartyEntries,
  PLAYER_ONE_ID,
  PLAYER_TWO_ID,
} from '../../test/builders/shared';
import { PokemonSpecies } from '../../../species';
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

    expect(burnContext.defender.majorStatus).toEqual({ kind: 'burn' });
    expect(
      burnContext.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status.kind === 'burn' &&
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

    expect(freezeContext.defender.majorStatus).toEqual({ kind: 'freeze' });
    expect(
      freezeContext.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status.kind === 'freeze' &&
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
    context.defender.majorStatus = { kind: 'paralysis' };

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
          event.status === 'paralysis' &&
          event.blockingStatus === 'paralysis',
      ),
    ).toBe(true);
    expect(
      context.events.some(
        (event) => event.type === 'pokemon.major_status_changed',
      ),
    ).toBe(false);
  });

  it('samples sleep duration between 1 and 4 turns inclusive', () => {
    const shortestContext = createContext([0, 0]);
    applyStatusEffect({
      effect: {
        kind: 'apply-status',
        target: 'opponent',
        chance: 100,
        status: {
          kind: 'major-status',
          status: 'sleep',
        },
      },
      isStatusOnlyMove: true,
      context: shortestContext,
    });

    const longestContext = createContext([0, 0.99]);
    applyStatusEffect({
      effect: {
        kind: 'apply-status',
        target: 'opponent',
        chance: 100,
        status: {
          kind: 'major-status',
          status: 'sleep',
        },
      },
      isStatusOnlyMove: true,
      context: longestContext,
    });

    expect(shortestContext.defender.majorStatus).toEqual({
      kind: 'sleep',
      turnsRemaining: 1,
    });
    expect(longestContext.defender.majorStatus).toEqual({
      kind: 'sleep',
      turnsRemaining: 4,
    });
  });

  it('emits already_affected when a status-only sleep move targets another major status', () => {
    const context = createContext([0]);
    context.defender.majorStatus = { kind: 'burn' };

    applyStatusEffect({
      effect: {
        kind: 'apply-status',
        target: 'opponent',
        chance: 100,
        status: {
          kind: 'major-status',
          status: 'sleep',
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
          event.status === 'sleep' &&
          event.blockingStatus === 'burn',
      ),
    ).toBe(true);
    expect(
      context.events.some(
        (event) => event.type === 'pokemon.major_status_changed',
      ),
    ).toBe(false);
  });

  it('applies poison to non-immune targets', () => {
    const context = createContext([0], {
      defenderSpecies: {
        type1: 'grass',
        type2: null,
      },
    });

    applyStatusEffect({
      effect: {
        kind: 'apply-status',
        target: 'opponent',
        chance: 100,
        status: {
          kind: 'major-status',
          status: 'poison',
        },
      },
      isStatusOnlyMove: false,
      context,
    });

    expect(context.defender.majorStatus).toEqual({ kind: 'poison' });
    expect(
      context.events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status.kind === 'poison' &&
          event.active === true,
      ),
    ).toBe(true);
  });

  it('does not apply poison to poison-type targets', () => {
    const context = createContext([0], {
      defenderSpecies: {
        type1: 'poison',
        type2: 'ground',
      },
      move: {
        name: 'Poison Powder',
      },
    });

    applyStatusEffect({
      effect: {
        kind: 'apply-status',
        target: 'opponent',
        chance: 100,
        status: {
          kind: 'major-status',
          status: 'poison',
        },
      },
      isStatusOnlyMove: true,
      context,
    });

    expect(context.defender.majorStatus).toBeNull();
    expect(context.events).toEqual([
      {
        type: 'attack.missed',
        playerId: PLAYER_ONE_ID,
        targetPlayerId: PLAYER_TWO_ID,
        pokemonName: 'Lapras',
        targetPokemonName: 'Nidoking',
        moveName: 'Poison Powder',
      },
    ]);
  });

  it('does not apply poison to steel-type targets', () => {
    const context = createContext([0], {
      defenderSpecies: {
        type1: 'steel',
        type2: null,
      },
      move: {
        name: 'Poison Powder',
      },
    });

    applyStatusEffect({
      effect: {
        kind: 'apply-status',
        target: 'opponent',
        chance: 100,
        status: {
          kind: 'major-status',
          status: 'poison',
        },
      },
      isStatusOnlyMove: true,
      context,
    });

    expect(context.defender.majorStatus).toBeNull();
    expect(context.events).toEqual([
      {
        type: 'attack.missed',
        playerId: PLAYER_ONE_ID,
        targetPlayerId: PLAYER_TWO_ID,
        pokemonName: 'Lapras',
        targetPokemonName: 'Nidoking',
        moveName: 'Poison Powder',
      },
    ]);
  });
});

function createContext(
  randomSequence: number[],
  overrides: {
    attackerSpecies?: Partial<PokemonSpecies>;
    defenderSpecies?: Partial<PokemonSpecies>;
    move?: Partial<MoveExecutionContext['move']>;
  } = {},
): MoveExecutionContext {
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
      ...overrides.attackerSpecies,
    },
    defender,
    defenderAction: buildAttackAction(PLAYER_TWO_ID, 'Sludge Bomb'),
    defenderSpecies: {
      ...defender,
      moves: [],
      species: defender.name,
      type1: 'poison',
      type2: 'ground',
      ...overrides.defenderSpecies,
    },
    move: {
      accuracy: 100,
      class: 'special',
      effects: [],
      name: 'Confuse Ray',
      power: 0,
      type: 'ghost',
      ...overrides.move,
    },
  };
}
