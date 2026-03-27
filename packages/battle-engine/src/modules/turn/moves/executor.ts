import { InvalidMoveError } from '../../../errors';
import { DomainEvent } from '../../../engine/events';
import { PartyEntry } from '../../party/party';
import { PokemonSpecies } from '../../species';
import { didAttackLand } from '../calculations/accuracy';
import { getActivePokemon } from '../party-state';
import { TurnAction } from '../types';
import { fromPartyMove } from './from-party';
import { applyDamageEffect } from './effects/damage';
import { applyStageEffect } from './effects/stage';
import { applyStatusEffect } from './effects/status';
import { MoveDefinition } from './types';
import { defaultStatusHandlerRegistry } from '../statuses/registry';
import { runAfterMoveHooks, runBeforeMoveHooks } from '../statuses/runtime';
import { StatusHandlerRegistry } from '../statuses/types';

type ExecuteMoveParams = {
  attackerAction: TurnAction;
  defenderAction: TurnAction;
  events: DomainEvent[];
  getSpecies: (speciesName: string) => PokemonSpecies;
  random: () => number;
  simulatedParties: Map<string, PartyEntry[]>;
  statusHandlerRegistry?: StatusHandlerRegistry;
};

export function executeMove(params: ExecuteMoveParams) {
  if (params.attackerAction.action.type !== 'attack') {
    return { defenderFainted: false };
  }

  const attacker = getActivePokemon(
    params.simulatedParties,
    params.attackerAction.playerId,
  );
  const defender = getActivePokemon(
    params.simulatedParties,
    params.defenderAction.playerId,
  );

  if (attacker.health <= 0) {
    return { defenderFainted: false };
  }

  if (defender.health <= 0) {
    return { defenderFainted: false };
  }

  const moveName = params.attackerAction.action.payload.attackName;
  const moveState = attacker.moves.find((move) => move.name === moveName);
  if (!moveState) {
    throw new InvalidMoveError(
      `Pokemon ${attacker.name} does not contain attack ${moveName}.`,
    );
  }

  if (moveState.remaining <= 0) {
    return { defenderFainted: false };
  }

  const attackerSpecies = params.getSpecies(attacker.name);
  const defenderSpecies = params.getSpecies(defender.name);
  const move = fromPartyMove(moveState);
  const statusHandlerRegistry =
    params.statusHandlerRegistry ?? defaultStatusHandlerRegistry;
  const statusContext = {
    simulatedParties: params.simulatedParties,
    playerId: params.attackerAction.playerId,
    opponentPlayerId: params.defenderAction.playerId,
    random: params.random,
    events: params.events,
    attacker,
    defender,
    move,
  };
  const runAfterMove = () =>
    runAfterMoveHooks({
      context: statusContext,
      pokemon: attacker,
      registry: statusHandlerRegistry,
    });

  moveState.used += 1;
  moveState.remaining = Math.max(0, moveState.remaining - 1);
  params.events.push({
    type: 'move.consumed',
    playerId: params.attackerAction.playerId,
    pokemonName: attacker.name,
    moveName,
  });

  if (
    !runBeforeMoveHooks({
      context: statusContext,
      pokemon: attacker,
      registry: statusHandlerRegistry,
    }).canAct
  ) {
    return { defenderFainted: false };
  }

  if (
    !didAttackLand(
      move.accuracy,
      attacker.accuracyStage,
      defender.evasionStage,
      params.random,
    )
  ) {
    emitAttackMissed(
      params.events,
      params.attackerAction,
      params.defenderAction,
      attacker,
      defender,
      move.name,
    );
    runAfterMove();
    return { defenderFainted: false };
  }

  const isStatusOnlyMove = !move.effects.some(
    (effect) => effect.kind === 'damage',
  );
  let stageEffectsEncountered = false;
  let appliedAtLeastOneStage = false;

  for (const effect of move.effects) {
    if (effect.kind === 'modify-stage') {
      stageEffectsEncountered = true;
      appliedAtLeastOneStage =
        applyStageEffect({
          attacker,
          attackerAction: params.attackerAction,
          defender,
          defenderAction: params.defenderAction,
          effect,
          events: params.events,
          moveName: move.name,
          random: params.random,
        }) || appliedAtLeastOneStage;
      continue;
    }

    if (
      isStatusOnlyMove &&
      stageEffectsEncountered &&
      !appliedAtLeastOneStage
    ) {
      emitAttackMissed(
        params.events,
        params.attackerAction,
        params.defenderAction,
        attacker,
        defender,
        move.name,
      );
      runAfterMove();
      return { defenderFainted: false };
    }

    if (effect.kind === 'damage') {
      const damageResult = applyDamageEffect({
        attacker,
        attackerAction: params.attackerAction,
        attackerSpecies,
        defender,
        defenderAction: params.defenderAction,
        defenderSpecies,
        events: params.events,
        move,
        opponentPlayerId: params.defenderAction.playerId,
        playerId: params.attackerAction.playerId,
        random: params.random,
        simulatedParties: params.simulatedParties,
        statusHandlerRegistry,
      });
      if (damageResult.defenderFainted) {
        runAfterMove();
        return damageResult;
      }
      continue;
    }

    applyStatusEffect({
      effect,
      isStatusOnlyMove,
      context: {
        attacker,
        attackerAction: params.attackerAction,
        attackerSpecies,
        defender,
        defenderAction: params.defenderAction,
        defenderSpecies,
        events: params.events,
        move,
        opponentPlayerId: params.defenderAction.playerId,
        playerId: params.attackerAction.playerId,
        random: params.random,
        simulatedParties: params.simulatedParties,
      },
    });
  }

  if (isStatusOnlyMove && stageEffectsEncountered && !appliedAtLeastOneStage) {
    emitAttackMissed(
      params.events,
      params.attackerAction,
      params.defenderAction,
      attacker,
      defender,
      move.name,
    );
    runAfterMove();
    return { defenderFainted: false };
  }

  runAfterMove();
  return { defenderFainted: false };
}

function emitAttackMissed(
  events: DomainEvent[],
  attackerAction: TurnAction,
  defenderAction: TurnAction,
  attacker: PartyEntry,
  defender: PartyEntry,
  moveName: MoveDefinition['name'],
) {
  events.push({
    type: 'attack.missed',
    playerId: attackerAction.playerId,
    targetPlayerId: defenderAction.playerId,
    pokemonName: attacker.name,
    targetPokemonName: defender.name,
    moveName,
  });
}
