import { StatusHandler } from './types';

const THAW_CHANCE = 0.2;

export const freezeStatusHandler: StatusHandler = {
  beforeMove(ctx) {
    if (ctx.random() < THAW_CHANCE) {
      ctx.attacker.majorStatus = null;
      ctx.events.push({
        type: 'pokemon.major_status_changed',
        playerId: ctx.playerId,
        pokemonName: ctx.attacker.name,
        status: {
          kind: 'freeze',
        },
        active: false,
        sourcePlayerId: ctx.playerId,
        moveName: ctx.move.name,
      });

      return { canAct: true };
    }

    ctx.events.push({
      type: 'attack.frozen',
      playerId: ctx.playerId,
      targetPlayerId: ctx.opponentPlayerId,
      pokemonName: ctx.attacker.name,
      targetPokemonName: ctx.defender.name,
      moveName: ctx.move.name,
    });

    return { canAct: false };
  },
};
