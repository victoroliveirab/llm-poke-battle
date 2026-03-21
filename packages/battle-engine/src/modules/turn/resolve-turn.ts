import { DomainEvent } from '../../engine/events';
import { PartyEntry } from '../party/party';
import { getActionsInSpeedOrder } from './action-order';
import {
  getActivePokemon,
  getPendingReplacementPlayers,
  hasHealthyPokemon,
} from './party-state';
import { PokemonSpecies } from '../species';
import { executeMove } from './moves/executor';
import { TurnAction } from './types';
import { defaultStatusHandlerRegistry } from './statuses/registry';
import { runEndTurnHooks } from './statuses/runtime';
import { StatusContext, StatusHandlerRegistry } from './statuses/types';

type ResolveTurnParams = {
  playerIds: [string, string];
  actions: [TurnAction, TurnAction];
  simulatedParties: Map<string, PartyEntry[]>;
  getSpecies: (speciesName: string) => PokemonSpecies;
  random: () => number;
  statusHandlerRegistry?: StatusHandlerRegistry;
};

type ResolveTurnResult = {
  events: DomainEvent[];
  pendingReplacementPlayers: string[];
  winner: string | null;
};

export function resolveTurn(params: ResolveTurnParams): ResolveTurnResult {
  const [playerA, playerB] = params.playerIds;
  const [actionA, actionB] = params.actions;
  const { simulatedParties } = params;
  const events: DomainEvent[] = [];

  if (actionA.action.type === 'switch') {
    applySwitch(simulatedParties, playerA, actionA.action.payload.newPokemon);
    events.push({
      type: 'pokemon.switched',
      playerId: playerA,
      pokemonName: actionA.action.payload.newPokemon,
    });
  }

  if (actionB.action.type === 'switch') {
    applySwitch(simulatedParties, playerB, actionB.action.payload.newPokemon);
    events.push({
      type: 'pokemon.switched',
      playerId: playerB,
      pokemonName: actionB.action.payload.newPokemon,
    });
  }

  const orderedActions = getActionsInSpeedOrder(
    actionA,
    actionB,
    getActivePokemon(simulatedParties, actionA.playerId),
    getActivePokemon(simulatedParties, actionB.playerId),
    params.random,
  );

  const defenderFaintedAfterFirstAttack = performAttackIfPossible(
    orderedActions[0],
    orderedActions[1],
    simulatedParties,
    params,
    events,
  );

  if (!defenderFaintedAfterFirstAttack) {
    performAttackIfPossible(
      orderedActions[1],
      orderedActions[0],
      simulatedParties,
      params,
      events,
    );
  }

  const createStatusContext = (
    playerId: string,
    opponentPlayerId: string,
  ): StatusContext => ({
    simulatedParties,
    playerId,
    opponentPlayerId,
    random: params.random,
    events,
  });
  const statusHandlerRegistry =
    params.statusHandlerRegistry ?? defaultStatusHandlerRegistry;

  runEndTurnHooks({
    context: createStatusContext(playerA, playerB),
    pokemon: getActivePokemon(simulatedParties, playerA),
    registry: statusHandlerRegistry,
  });
  runEndTurnHooks({
    context: createStatusContext(playerB, playerA),
    pokemon: getActivePokemon(simulatedParties, playerB),
    registry: statusHandlerRegistry,
  });

  const winner = getWinner(simulatedParties, playerA, playerB);
  if (winner) {
    events.push({ type: 'game.over', winner });
  }

  events.push({ type: 'turn.resolved' });

  return {
    events,
    pendingReplacementPlayers: winner
      ? []
      : getPendingReplacementPlayers(simulatedParties, [playerA, playerB]),
    winner,
  };
}

function getWinner(
  simulatedParties: Map<string, PartyEntry[]>,
  playerA: string,
  playerB: string,
) {
  const hasHealthyA = hasHealthyPokemon(simulatedParties, playerA);
  const hasHealthyB = hasHealthyPokemon(simulatedParties, playerB);

  if (!hasHealthyA && !hasHealthyB) {
    return null;
  }

  if (!hasHealthyA) {
    return playerB;
  }

  if (!hasHealthyB) {
    return playerA;
  }

  return null;
}

function applySwitch(
  simulatedParties: Map<string, PartyEntry[]>,
  playerId: string,
  pokemonName: string,
) {
  const party = simulatedParties.get(playerId);
  if (!party) {
    throw new Error(`Party not found for player ${playerId}.`);
  }

  const index = party.findIndex((entry) => entry.name === pokemonName);
  if (index === -1) {
    throw new Error(`Pokemon ${pokemonName} not in your party.`);
  }

  const pokemon = party[index];
  if (!pokemon) {
    throw new Error(`Pokemon ${pokemonName} not in your party.`);
  }

  if (pokemon.health <= 0) {
    throw new Error(`Pokemon ${pokemonName} already fainted.`);
  }

  pokemon.used = true;
  const before = party.slice(0, index);
  const after = party.slice(index + 1);
  simulatedParties.set(playerId, [pokemon, ...before, ...after]);
}

function performAttackIfPossible(
  attackerAction: TurnAction,
  defenderAction: TurnAction,
  simulatedParties: Map<string, PartyEntry[]>,
  params: Pick<ResolveTurnParams, 'getSpecies' | 'random' | 'statusHandlerRegistry'>,
  events: DomainEvent[],
) {
  return executeMove({
    attackerAction,
    defenderAction,
    events,
    getSpecies: params.getSpecies,
    random: params.random,
    simulatedParties,
    statusHandlerRegistry: params.statusHandlerRegistry,
  }).defenderFainted;
}
