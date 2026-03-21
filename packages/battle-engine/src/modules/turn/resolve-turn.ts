import { DomainEvent } from '../../engine/events';
import { PartyEntry } from '../party/party';
import { getActionsInSpeedOrder } from './action-order';
import {
  getActivePokemon,
  getPendingReplacementPlayers,
  hasHealthyPokemon,
  needsReplacement,
} from './party-state';
import { PokemonSpecies } from '../species';
import { executeMove } from './moves/executor';
import { clearVolatileStatuses } from './status-state';
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

export type SuspendedTurn = {
  remainingAction: TurnAction;
  waitingForPlayerId: string;
};

export type ResolveTurnResult = {
  events: DomainEvent[];
  pendingReplacementPlayers: string[];
  suspendedTurn: SuspendedTurn | null;
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
    const suspendedTurn = getSuspendedTurn(
      orderedActions[0],
      orderedActions[1],
      simulatedParties,
    );
    if (suspendedTurn) {
      return {
        events,
        pendingReplacementPlayers: [suspendedTurn.waitingForPlayerId],
        suspendedTurn,
        winner: null,
      };
    }

    performAttackIfPossible(
      orderedActions[1],
      orderedActions[0],
      simulatedParties,
      params,
      events,
    );
  }

  return finalizeTurn({
    events,
    playerIds: [playerA, playerB],
    simulatedParties,
    params,
  });
}

export function resumeTurnAfterReplacement(params: {
  playerIds: [string, string];
  replacementAction: TurnAction;
  remainingAction: TurnAction;
  simulatedParties: Map<string, PartyEntry[]>;
  getSpecies: (speciesName: string) => PokemonSpecies;
  random: () => number;
  statusHandlerRegistry?: StatusHandlerRegistry;
}): ResolveTurnResult {
  const events: DomainEvent[] = [];

  if (params.replacementAction.action.type !== 'switch') {
    throw new Error('Replacement action must be a switch.');
  }

  applySwitch(
    params.simulatedParties,
    params.replacementAction.playerId,
    params.replacementAction.action.payload.newPokemon,
  );
  events.push({
    type: 'pokemon.switched',
    playerId: params.replacementAction.playerId,
    pokemonName: params.replacementAction.action.payload.newPokemon,
  });

  performActionIfPossible(
    params.remainingAction,
    params.replacementAction,
    params.simulatedParties,
    params,
    events,
  );

  return finalizeTurn({
    events,
    playerIds: params.playerIds,
    simulatedParties: params.simulatedParties,
    params,
  });
}

function finalizeTurn(params: {
  events: DomainEvent[];
  playerIds: [string, string];
  simulatedParties: Map<string, PartyEntry[]>;
  params: Pick<
    ResolveTurnParams,
    'getSpecies' | 'random' | 'statusHandlerRegistry'
  >;
}): ResolveTurnResult {
  const [playerA, playerB] = params.playerIds;
  const { simulatedParties, events } = params;
  const createStatusContext = (
    playerId: string,
    opponentPlayerId: string,
  ): StatusContext => ({
    simulatedParties,
    playerId,
    opponentPlayerId,
    random: params.params.random,
    events,
  });
  const statusHandlerRegistry =
    params.params.statusHandlerRegistry ?? defaultStatusHandlerRegistry;

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
    suspendedTurn: null,
    winner,
  };
}

function getSuspendedTurn(
  completedAction: TurnAction,
  remainingAction: TurnAction,
  simulatedParties: Map<string, PartyEntry[]>,
): SuspendedTurn | null {
  if (!needsReplacement(simulatedParties, completedAction.playerId)) {
    return null;
  }

  if (!hasHealthyPokemon(simulatedParties, remainingAction.playerId)) {
    return null;
  }

  return {
    remainingAction,
    waitingForPlayerId: completedAction.playerId,
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

  const activePokemon = party[0];
  if (activePokemon && activePokemon.name !== pokemonName) {
    clearVolatileStatuses(activePokemon);
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

function performActionIfPossible(
  attackerAction: TurnAction,
  defenderAction: TurnAction,
  simulatedParties: Map<string, PartyEntry[]>,
  params: Pick<ResolveTurnParams, 'getSpecies' | 'random' | 'statusHandlerRegistry'>,
  events: DomainEvent[],
) {
  if (attackerAction.action.type === 'switch') {
    applySwitch(
      simulatedParties,
      attackerAction.playerId,
      attackerAction.action.payload.newPokemon,
    );
    events.push({
      type: 'pokemon.switched',
      playerId: attackerAction.playerId,
      pokemonName: attackerAction.action.payload.newPokemon,
    });
    return;
  }

  performAttackIfPossible(
    attackerAction,
    defenderAction,
    simulatedParties,
    params,
    events,
  );
}
