import { StatusHandler } from './types';

const PARALYSIS_CHANCE = 0.25;

export const paralysisStatusHandler: StatusHandler = {
  beforeMove(ctx) {
    if (ctx.random() >= PARALYSIS_CHANCE) {
      return { canAct: true };
    }

    ctx.events.push({
      type: 'attack.paralyzed',
      playerId: ctx.playerId,
      targetPlayerId: ctx.opponentPlayerId,
      pokemonName: ctx.attacker.name,
      targetPokemonName: ctx.defender.name,
      moveName: ctx.move.name,
    });

    return { canAct: false };
  },
};
