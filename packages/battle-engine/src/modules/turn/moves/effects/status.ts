import { MoveExecutionContext, MoveEffect } from '../types';

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
  const isAlreadyAffected =
    params.effect.status === 'paralysis' ? targetPokemon.isParalyzed : false;

  if (isAlreadyAffected && params.isStatusOnlyMove) {
    params.context.events.push({
      type: 'attack.already_affected',
      playerId: params.context.attackerAction.playerId,
      targetPlayerId,
      pokemonName: params.context.attacker.name,
      targetPokemonName: targetPokemon.name,
      status: 'paralysis',
      moveName: params.context.move.name,
    });
    return;
  }

  if (isAlreadyAffected) {
    return;
  }

  if (params.effect.status === 'paralysis') {
    const chance = Math.min(1, Math.max(0, params.effect.chance / 100));
    if (params.context.random() >= chance) {
      return;
    }

    params.context.events.push({
      type: 'pokemon.status_changed',
      playerId: targetPlayerId,
      pokemonName: targetPokemon.name,
      status: 'paralysis',
      active: true,
      sourcePlayerId: params.context.attackerAction.playerId,
      moveName: params.context.move.name,
    });
  }
}
