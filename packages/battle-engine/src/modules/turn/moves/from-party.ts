import { PartyMove } from '../../party/party';
import { AttackStatusEffect } from '../../species';
import { MoveDefinition, MoveEffect } from './types';

export function fromPartyMove(move: PartyMove): MoveDefinition {
  const effects: MoveEffect[] = [];

  if (move.power > 0) {
    effects.push({ kind: 'damage' });
  }

  for (const stageChange of move.statChanges ?? []) {
    effects.push({
      kind: 'modify-stage',
      target: stageChange.target,
      stat: stageChange.stat,
      stages: stageChange.stages,
      chance: stageChange.chance,
    });
  }

  for (const statusEffect of move.statusEffects ?? []) {
    effects.push(fromAttackStatusEffect(statusEffect));
  }

  return {
    accuracy: move.accuracy,
    class: move.class,
    effects,
    makesContact: move.makesContact,
    name: move.name,
    power: move.power,
    type: move.type,
  };
}

function fromAttackStatusEffect(
  statusEffect: AttackStatusEffect,
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
