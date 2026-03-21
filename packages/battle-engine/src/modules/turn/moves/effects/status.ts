import {
  AppliedMoveStatus,
  MoveExecutionContext,
  MoveEffect,
} from '../types';
import {
  createVolatileStatus,
  hasMajorStatus,
  hasVolatileStatus,
} from '../../status-state';

type StatusEffect = Extract<MoveEffect, { kind: 'apply-status' }>;

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
  const appliedStatusKind = getAppliedStatusKind(params.effect.status);
  const isAlreadyAffected =
    params.effect.status.kind === 'major-status'
      ? hasMajorStatus(targetPokemon, params.effect.status.status)
      : hasVolatileStatus(targetPokemon, params.effect.status.status);

  if (isAlreadyAffected && params.isStatusOnlyMove) {
    params.context.events.push({
      type: 'attack.already_affected',
      playerId: params.context.attackerAction.playerId,
      targetPlayerId,
      pokemonName: params.context.attacker.name,
      targetPokemonName: targetPokemon.name,
      status: appliedStatusKind,
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

  if (params.effect.status.kind === 'major-status') {
    targetPokemon.majorStatus = params.effect.status.status;
    params.context.events.push({
      type: 'pokemon.major_status_changed',
      playerId: targetPlayerId,
      pokemonName: targetPokemon.name,
      status: params.effect.status.status,
      active: true,
      sourcePlayerId: params.context.attackerAction.playerId,
      moveName: params.context.move.name,
    });
    return;
  }

  const appliedStatus = resolveVolatileStatus(
    params.effect.status.status,
    params.context.random,
  );
  targetPokemon.volatileStatuses.push(appliedStatus);
  params.context.events.push({
    type: 'pokemon.volatile_status_changed',
    playerId: targetPlayerId,
    pokemonName: targetPokemon.name,
    status: appliedStatus,
    active: true,
    sourcePlayerId: params.context.attackerAction.playerId,
    moveName: params.context.move.name,
  });
}

function getAppliedStatusKind(status: AppliedMoveStatus) {
  return status.status;
}

function resolveVolatileStatus(
  status: Extract<AppliedMoveStatus, { kind: 'volatile-status' }>['status'],
  random: () => number,
) {
  return createVolatileStatus(status, random);
}
