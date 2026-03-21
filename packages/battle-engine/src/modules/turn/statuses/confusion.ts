import { getModifiedBattleStat } from '../calculations/accuracy';
import { calculateDamage } from '../calculations/damage';
import { MoveStatusContext, StatusHandler } from './types';

const CONFUSION_SELF_HIT_CHANCE = 1 / 3;
const CONFUSION_SELF_HIT_POWER = 40;

export const confusionStatusHandler: StatusHandler = {
  beforeMove(ctx) {
    const confusion = ctx.attacker.volatileStatuses.find(
      (status) => status.kind === 'confusion',
    );
    if (!confusion) {
      return { canAct: true };
    }

    if (confusion.turnsRemaining <= 1) {
      clearConfusion(ctx);
      return { canAct: true };
    }

    confusion.turnsRemaining = Math.max(0, confusion.turnsRemaining - 1);
    ctx.events.push({
      type: 'pokemon.volatile_status_updated',
      playerId: ctx.playerId,
      pokemonName: ctx.attacker.name,
      status: {
        kind: 'confusion',
        turnsRemaining: confusion.turnsRemaining,
      },
    });

    const willSelfHit = ctx.random() < CONFUSION_SELF_HIT_CHANCE;

    if (willSelfHit) {
      const damage = calculateConfusionSelfHitDamage(ctx);
      ctx.attacker.health = Math.max(0, ctx.attacker.health - damage);
      ctx.events.push({
        type: 'attack.confused',
        playerId: ctx.playerId,
        targetPlayerId: ctx.playerId,
        pokemonName: ctx.attacker.name,
        targetPokemonName: ctx.attacker.name,
        moveName: ctx.move.name,
        damage,
      });

      if (ctx.attacker.health <= 0) {
        ctx.events.push({
          type: 'pokemon.fainted',
          playerId: ctx.playerId,
          pokemonName: ctx.attacker.name,
        });
      }
    }

    return { canAct: !willSelfHit };
  },
};

function calculateConfusionSelfHitDamage(ctx: MoveStatusContext) {
  const attack = getModifiedBattleStat(
    ctx.attacker.stats.attack,
    ctx.attacker.attackStage,
  );
  const defense = getModifiedBattleStat(
    ctx.attacker.stats.defense,
    ctx.attacker.defenseStage,
  );

  return Math.max(
    1,
    calculateDamage({
      level: ctx.attacker.level,
      power: CONFUSION_SELF_HIT_POWER,
      attack,
      defense,
      stab: 1,
      typeEffectiveness: 1,
      critical: false,
      random: ctx.random,
    }),
  );
}

function clearConfusion(ctx: MoveStatusContext) {
  ctx.attacker.volatileStatuses = ctx.attacker.volatileStatuses.filter(
    (status) => status.kind !== 'confusion',
  );
  ctx.events.push({
    type: 'pokemon.volatile_status_changed',
    playerId: ctx.playerId,
    pokemonName: ctx.attacker.name,
    status: {
      kind: 'confusion',
      turnsRemaining: 0,
    },
    active: false,
    sourcePlayerId: ctx.playerId,
    moveName: ctx.move.name,
  });
}
