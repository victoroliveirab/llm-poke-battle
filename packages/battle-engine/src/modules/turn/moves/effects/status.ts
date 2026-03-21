import { MoveExecutionContext, MoveEffect } from '../types';
import {
  hasMajorStatus,
  hasVolatileStatus,
  isMajorStatusKind,
} from '../../status-state';

type StatusEffect = Extract<MoveEffect, { kind: 'apply-status' }>;
const CONFUSION_MIN_DURATION = 1;
const CONFUSION_MAX_DURATION = 4;

type ApplyStatusEffectParams = {
  effect: StatusEffect;
  isStatusOnlyMove: boolean;
  context: MoveExecutionContext;
};

export function applyStatusEffect(params: ApplyStatusEffectParams) {
  const isSelfTarget = params.effect.target === 'self';
  const targetPokemon = isSelfTarget ? params.context.attacker : params.context.defender;
  const targetPlayerId = isSelfTarget
    ? params.context.attackerAction.playerId
    : params.context.defenderAction.playerId;
  const isAlreadyAffected = isMajorStatusKind(params.effect.status)
    ? hasMajorStatus(targetPokemon, params.effect.status)
    : hasVolatileStatus(targetPokemon, params.effect.status);

  if (isAlreadyAffected && params.isStatusOnlyMove) {
    params.context.events.push({
      type: 'attack.already_affected',
      playerId: params.context.attackerAction.playerId,
      targetPlayerId,
      pokemonName: params.context.attacker.name,
      targetPokemonName: targetPokemon.name,
      status: params.effect.status,
      moveName: params.context.move.name,
    });
    return;
  }

  if (isAlreadyAffected) {
    return;
  }

  const chance = Math.min(1, Math.max(0, params.effect.chance / 100));
  if (params.context.random() >= chance) {
    return;
  }

  if (isMajorStatusKind(params.effect.status)) {
    targetPokemon.majorStatus = params.effect.status;
    params.context.events.push({
      type: 'pokemon.major_status_changed',
      playerId: targetPlayerId,
      pokemonName: targetPokemon.name,
      status: params.effect.status,
      active: true,
      sourcePlayerId: params.context.attackerAction.playerId,
      moveName: params.context.move.name,
    });
    return;
  }

  const confusionDuration = sampleConfusionDuration(params.context.random);
  targetPokemon.volatileStatuses.push({
    kind: 'confusion',
    turnsRemaining: confusionDuration,
  });
  params.context.events.push({
    type: 'pokemon.volatile_status_changed',
    playerId: targetPlayerId,
    pokemonName: targetPokemon.name,
    status: {
      kind: 'confusion',
      turnsRemaining: confusionDuration,
    },
    active: true,
    sourcePlayerId: params.context.attackerAction.playerId,
    moveName: params.context.move.name,
  });
}

function sampleConfusionDuration(random: () => number) {
  return (
    Math.floor(random() * (CONFUSION_MAX_DURATION - CONFUSION_MIN_DURATION + 1)) +
    CONFUSION_MIN_DURATION
  );
}
