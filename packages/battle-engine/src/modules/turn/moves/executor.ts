import { InvalidMoveError } from '../../../errors';
import { DomainEvent } from '../../../engine/events';
import { PartyEntry } from '../../party/party';
import { PokemonSpecies } from '../../species';
import { didAttackLand } from '../calculations/accuracy';
import { getActivePokemon } from '../party-state';
import { TurnAction } from '../types';
import { fromSpeciesMove } from './from-species';
import { applyDamageEffect } from './effects/damage';
import { applyStageEffect } from './effects/stage';
import { applyStatusEffect } from './effects/status';
import { MoveDefinition } from './types';

type ExecuteMoveParams = {
  attackerAction: TurnAction;
  defenderAction: TurnAction;
  events: DomainEvent[];
  getSpecies: (speciesName: string) => PokemonSpecies;
  random: () => number;
  simulatedParties: Map<string, PartyEntry[]>;
};

const PARALYSIS_CHANCE = 0.25;

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
  const speciesMove = attackerSpecies.moves.find((entry) => entry.name === moveName);
  if (!speciesMove) {
    throw new InvalidMoveError(
      `Move ${moveName} not found for Pokemon ${attacker.name}.`,
    );
  }

  const move = fromSpeciesMove(speciesMove);

  moveState.used += 1;
  moveState.remaining = Math.max(0, moveState.remaining - 1);
  params.events.push({
    type: 'move.consumed',
    playerId: params.attackerAction.playerId,
    pokemonName: attacker.name,
    moveName,
  });

  if (attacker.isParalyzed && params.random() < PARALYSIS_CHANCE) {
    params.events.push({
      type: 'attack.paralyzed',
      playerId: params.attackerAction.playerId,
      targetPlayerId: params.defenderAction.playerId,
      pokemonName: attacker.name,
      targetPokemonName: defender.name,
      moveName,
    });
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
    return { defenderFainted: false };
  }

  const isStatusOnlyMove = !move.effects.some((effect) => effect.kind === 'damage');
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
        }) || appliedAtLeastOneStage;
      continue;
    }

    if (stageEffectsEncountered && !appliedAtLeastOneStage) {
      emitAttackMissed(
        params.events,
        params.attackerAction,
        params.defenderAction,
        attacker,
        defender,
        move.name,
      );
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
        random: params.random,
      });
      if (damageResult.defenderFainted) {
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
        random: params.random,
      },
    });
  }

  if (stageEffectsEncountered && !appliedAtLeastOneStage) {
    emitAttackMissed(
      params.events,
      params.attackerAction,
      params.defenderAction,
      attacker,
      defender,
      move.name,
    );
    return { defenderFainted: false };
  }

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
