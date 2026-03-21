import { PokemonMove } from '../../species';
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
    effects.push({
      kind: 'apply-status',
      target: statusEffect.target,
      status: statusEffect.status,
      chance: statusEffect.chance,
    });
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
