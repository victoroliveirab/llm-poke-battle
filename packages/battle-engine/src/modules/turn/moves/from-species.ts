import { PokemonMove, PokemonStatusEffect } from '../../species';
import { MoveDefinition, MoveEffect } from './types';

export function fromSpeciesMove(move: PokemonMove): MoveDefinition {
  const effects: MoveEffect[] = [];

  for (const stageChange of move.statChanges ?? []) {
    effects.push({
      kind: 'modify-stage',
      target: stageChange.target,
      stat: stageChange.stat,
      stages: stageChange.stages,
    });
  }

  if (move.power > 0) {
    effects.push({ kind: 'damage' });
  }

  for (const statusEffect of move.statusEffects ?? []) {
    effects.push(fromSpeciesStatusEffect(statusEffect));
  }

  return {
    accuracy: move.accuracy,
    class: move.class,
    effects,
    name: move.name,
    power: move.power,
    type: move.type,
  };
}

function fromSpeciesStatusEffect(
  statusEffect: PokemonStatusEffect,
): Extract<MoveEffect, { kind: 'apply-status' }> {
  if (statusEffect.kind === 'volatile-status') {
    return {
      kind: 'apply-status',
      target: statusEffect.target,
      status: {
        kind: 'volatile-status',
        status: statusEffect.status,
      },
      chance: statusEffect.chance,
    };
  }

  return {
    kind: 'apply-status',
    target: statusEffect.target,
    status: {
      kind: 'major-status',
      status: statusEffect.status,
    },
    chance: statusEffect.chance,
  };
}
