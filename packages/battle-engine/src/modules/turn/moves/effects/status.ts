import {
  AppliedMoveStatus,
  MoveExecutionContext,
  MoveEffect,
} from '../types';
import {
  createMajorStatus,
  createVolatileStatus,
  hasVolatileStatus,
} from '../../status-state';
import { PokemonSpecies } from '../../../species';

type StatusEffect = Extract<MoveEffect, { kind: 'apply-status' }>;

type ApplyStatusEffectParams = {
  effect: StatusEffect;
  isStatusOnlyMove: boolean;
  context: MoveExecutionContext;
};

export function applyStatusEffect(params: ApplyStatusEffectParams) {
  const isSelfTarget = params.effect.target === 'self';
  const targetPokemon = isSelfTarget ? params.context.attacker : params.context.defender;
  const targetSpecies = isSelfTarget
    ? params.context.attackerSpecies
    : params.context.defenderSpecies;
  const targetPlayerId = isSelfTarget
    ? params.context.attackerAction.playerId
    : params.context.defenderAction.playerId;
  const appliedStatusKind = getAppliedStatusKind(params.effect.status);
  const isAlreadyAffected =
    params.effect.status.kind === 'major-status'
      ? targetPokemon.majorStatus !== null
      : hasVolatileStatus(targetPokemon, params.effect.status.status);

  if (isAlreadyAffected && params.isStatusOnlyMove) {
    const blockingStatus =
      params.effect.status.kind === 'major-status'
        ? targetPokemon.majorStatus?.kind
        : targetPokemon.volatileStatuses.find(
            (status) => status.kind === params.effect.status.status,
          )?.kind;
    if (!blockingStatus) {
      throw new Error('Expected an existing blocking status.');
    }

    params.context.events.push({
      type: 'attack.already_affected',
      playerId: params.context.attackerAction.playerId,
      targetPlayerId,
      pokemonName: params.context.attacker.name,
      targetPokemonName: targetPokemon.name,
      status: appliedStatusKind,
      blockingStatus,
      moveName: params.context.move.name,
    });
    return;
  }

  if (isAlreadyAffected) {
    return;
  }

  if (isImmuneToStatus(params.effect.status, targetSpecies)) {
    if (params.isStatusOnlyMove) {
      params.context.events.push({
        type: 'attack.missed',
        playerId: params.context.attackerAction.playerId,
        targetPlayerId,
        pokemonName: params.context.attacker.name,
        targetPokemonName: targetPokemon.name,
        moveName: params.context.move.name,
      });
    }
    return;
  }

  const chance = Math.min(1, Math.max(0, params.effect.chance / 100));
  if (params.context.random() >= chance) {
    return;
  }

  if (params.effect.status.kind === 'major-status') {
    const appliedStatus = createMajorStatus(
      params.effect.status.status,
      params.context.random,
    );
    targetPokemon.majorStatus = appliedStatus;
    params.context.events.push({
      type: 'pokemon.major_status_changed',
      playerId: targetPlayerId,
      pokemonName: targetPokemon.name,
      status: appliedStatus,
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

function isImmuneToStatus(
  status: AppliedMoveStatus,
  targetSpecies: Pick<PokemonSpecies, 'type1' | 'type2'>,
) {
  if (
    status.kind !== 'major-status' ||
    (status.status !== 'poison' && status.status !== 'badly-poisoned')
  ) {
    return false;
  }

  return (
    targetSpecies.type1 === 'poison' ||
    targetSpecies.type2 === 'poison' ||
    targetSpecies.type1 === 'steel' ||
    targetSpecies.type2 === 'steel'
  );
}
