import { DomainEvent } from '../../../../engine/events';
import { PartyEntry } from '../../../party/party';
import { clampBattleStage } from '../../calculations/accuracy';
import { clampCriticalStage } from '../../calculations/critical';
import { StageStat, TurnAction } from '../../types';
import { MoveEffect } from '../types';

type StageEffect = Extract<MoveEffect, { kind: 'modify-stage' }>;

type ApplyStageEffectParams = {
  attacker: PartyEntry;
  attackerAction: TurnAction;
  defender: PartyEntry;
  defenderAction: TurnAction;
  effect: StageEffect;
  events: DomainEvent[];
  moveName: string;
  random: () => number;
};

export function applyStageEffect(params: ApplyStageEffectParams) {
  const isSelfTarget = params.effect.target === 'self';
  const targetPokemon = isSelfTarget ? params.attacker : params.defender;
  const targetPlayerId = isSelfTarget
    ? params.attackerAction.playerId
    : params.defenderAction.playerId;

  if (typeof params.effect.chance === 'number') {
    const chance = Math.min(1, Math.max(0, params.effect.chance / 100));
    if (chance <= 0 || params.random() >= chance) {
      return false;
    }
  }

  const currentStage = getPokemonStageValue(targetPokemon, params.effect.stat);
  const nextStage = getClampedStageAfterDelta(
    currentStage,
    params.effect.stat,
    params.effect.stages,
  );

  if (nextStage === currentStage) {
    return false;
  }

  const delta = nextStage - currentStage;
  setPokemonStageValue(targetPokemon, params.effect.stat, nextStage);
  params.events.push({
    type: 'battle.stat_stage_changed',
    playerId: targetPlayerId,
    pokemonName: targetPokemon.name,
    sourcePlayerId: params.attackerAction.playerId,
    moveName: params.moveName,
    stat: params.effect.stat,
    delta,
    resultingStage: nextStage,
  });

  return true;
}

function getClampedStageAfterDelta(currentStage: number, stat: StageStat, delta: number) {
  const nextStage = currentStage + Math.trunc(delta);
  if (stat === 'critical') {
    return clampCriticalStage(nextStage);
  }

  return clampBattleStage(nextStage);
}

function getPokemonStageValue(pokemon: PartyEntry, stat: StageStat) {
  if (stat === 'accuracy') {
    return pokemon.accuracyStage;
  }
  if (stat === 'attack') {
    return pokemon.attackStage;
  }
  if (stat === 'critical') {
    return pokemon.criticalStage;
  }
  if (stat === 'defense') {
    return pokemon.defenseStage;
  }
  if (stat === 'evasion') {
    return pokemon.evasionStage;
  }
  if (stat === 'specialAttack') {
    return pokemon.specialAttackStage;
  }

  return pokemon.specialDefenseStage;
}

function setPokemonStageValue(pokemon: PartyEntry, stat: StageStat, nextStage: number) {
  if (stat === 'accuracy') {
    pokemon.accuracyStage = nextStage;
    return;
  }
  if (stat === 'attack') {
    pokemon.attackStage = nextStage;
    return;
  }
  if (stat === 'critical') {
    pokemon.criticalStage = nextStage;
    return;
  }
  if (stat === 'defense') {
    pokemon.defenseStage = nextStage;
    return;
  }
  if (stat === 'evasion') {
    pokemon.evasionStage = nextStage;
    return;
  }
  if (stat === 'specialAttack') {
    pokemon.specialAttackStage = nextStage;
    return;
  }

  pokemon.specialDefenseStage = nextStage;
}
