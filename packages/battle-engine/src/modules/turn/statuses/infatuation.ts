import { StatusHandler } from './types';

const INFATUATION_BLOCK_CHANCE = 0.5;

export const infatuationStatusHandler: StatusHandler = {
  beforeMove(ctx) {
    const infatuated = ctx.attacker.volatileStatuses.some(
      (status) => status.kind === 'infatuation',
    );
    if (!infatuated) {
      return { canAct: true };
    }

    if (ctx.random() >= INFATUATION_BLOCK_CHANCE) {
      return { canAct: true };
    }

    ctx.events.push({
      type: 'attack.infatuated',
      playerId: ctx.playerId,
      targetPlayerId: ctx.opponentPlayerId,
      pokemonName: ctx.attacker.name,
      targetPokemonName: ctx.defender.name,
      moveName: ctx.move.name,
    });

    return { canAct: false };
  },
};
