import { isCriticalHit } from '../../calculations/critical';
import { getModifiedBattleStat } from '../../calculations/accuracy';
import { calculateDamage } from '../../calculations/damage';
import { getTypeEffectiveness } from '../../calculations/type-effectiveness';
import { MoveExecutionContext } from '../types';

export function applyDamageEffect(context: MoveExecutionContext) {
  const attackStat =
    context.move.class === 'physical'
      ? getModifiedBattleStat(context.attacker.stats.attack, context.attacker.attackStage)
      : getModifiedBattleStat(
          context.attacker.stats.specialAttack,
          context.attacker.specialAttackStage,
        );
  const defenseStat =
    context.move.class === 'physical'
      ? getModifiedBattleStat(context.defender.stats.defense, context.defender.defenseStage)
      : getModifiedBattleStat(
          context.defender.stats.specialDefense,
          context.defender.specialDefenseStage,
        );
  const stab =
    context.move.type === context.attackerSpecies.type1 ||
    context.move.type === context.attackerSpecies.type2
      ? 1.5
      : 1.0;
  const typeEffectiveness = getTypeEffectiveness(
    context.move.type,
    context.defenderSpecies.type1,
    context.defenderSpecies.type2,
  );
  const critical = isCriticalHit(context.attacker.criticalStage, context.random);

  const damage = calculateDamage({
    level: context.attacker.level,
    power: context.move.power,
    attack: attackStat,
    defense: defenseStat,
    stab,
    typeEffectiveness,
    critical,
    random: context.random,
  });

  context.defender.health = Math.max(0, context.defender.health - damage);
  context.events.push({
    type: 'damage.applied',
    playerId: context.defenderAction.playerId,
    pokemonName: context.defender.name,
    damage,
    sourcePlayerId: context.attackerAction.playerId,
    moveName: context.move.name,
    critical,
  });

  if (context.defender.health <= 0) {
    context.events.push({
      type: 'pokemon.fainted',
      playerId: context.defenderAction.playerId,
      pokemonName: context.defender.name,
    });
    return { defenderFainted: true };
  }

  return { defenderFainted: false };
}
