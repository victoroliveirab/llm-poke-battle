import { describe, expect, it } from 'bun:test';
import { PartyEntry } from '../party/party';
import { getActionsInSpeedOrder } from './action-order';
import { TurnAction } from './types';

const playerOneAction: TurnAction = {
  playerId: 'player-one',
  action: {
    playerID: 'player-one',
    type: 'attack',
    payload: {
      attackName: 'Strength',
    },
  },
};

const playerTwoAction: TurnAction = {
  playerId: 'player-two',
  action: {
    playerID: 'player-two',
    type: 'attack',
    payload: {
      attackName: 'Sludge Bomb',
    },
  },
};

function buildActivePokemon(overrides: Partial<PartyEntry>): PartyEntry {
  return {
    accuracyStage: 0,
    attackStage: 0,
    criticalStage: 0,
    defenseStage: 0,
    evasionStage: 0,
    health: 100,
    level: 50,
    majorStatus: null,
    moves: [],
    name: 'Charizard',
    specialAttackStage: 0,
    specialDefenseStage: 0,
    stats: {
      attack: 100,
      defense: 100,
      hp: 100,
      specialAttack: 100,
      specialDefense: 100,
      speed: 100,
    },
    used: true,
    volatileStatuses: [],
    ...overrides,
  };
}

describe('turn action order', () => {
  it('orders faster pokemon first', () => {
    const ordered = getActionsInSpeedOrder(
      playerOneAction,
      playerTwoAction,
      buildActivePokemon({ stats: { attack: 100, defense: 100, hp: 100, specialAttack: 100, specialDefense: 100, speed: 120 } }),
      buildActivePokemon({ stats: { attack: 100, defense: 100, hp: 100, specialAttack: 100, specialDefense: 100, speed: 90 } }),
      () => 0.99,
    );

    expect(ordered).toEqual([playerOneAction, playerTwoAction]);
  });

  it('uses paralysis-adjusted speed before the tie breaker', () => {
    const ordered = getActionsInSpeedOrder(
      playerOneAction,
      playerTwoAction,
      buildActivePokemon({
        majorStatus: { kind: 'paralysis' },
        stats: {
          attack: 100,
          defense: 100,
          hp: 100,
          specialAttack: 100,
          specialDefense: 100,
          speed: 100,
        },
      }),
      buildActivePokemon({
        name: 'Nidoking',
        stats: {
          attack: 100,
          defense: 100,
          hp: 100,
          specialAttack: 100,
          specialDefense: 100,
          speed: 90,
        },
      }),
      () => 0,
    );

    expect(ordered).toEqual([playerTwoAction, playerOneAction]);
  });

  it('uses random order on exact speed ties', () => {
    const playerOneFirst = getActionsInSpeedOrder(
      playerOneAction,
      playerTwoAction,
      buildActivePokemon({}),
      buildActivePokemon({ name: 'Nidoking' }),
      () => 0.4,
    );
    const playerTwoFirst = getActionsInSpeedOrder(
      playerOneAction,
      playerTwoAction,
      buildActivePokemon({}),
      buildActivePokemon({ name: 'Nidoking' }),
      () => 0.6,
    );

    expect(playerOneFirst).toEqual([playerOneAction, playerTwoAction]);
    expect(playerTwoFirst).toEqual([playerTwoAction, playerOneAction]);
  });
});
