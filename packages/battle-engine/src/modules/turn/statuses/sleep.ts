import { StatusHandler } from './types';

export const sleepStatusHandler: StatusHandler = {
  beforeMove(ctx) {
    const sleep = ctx.attacker.majorStatus;
    if (sleep === null || sleep.kind !== 'sleep') {
      return { canAct: true };
    }

    if (sleep.turnsRemaining <= 1) {
      ctx.attacker.majorStatus = null;
      ctx.events.push({
        type: 'pokemon.major_status_changed',
        playerId: ctx.playerId,
        pokemonName: ctx.attacker.name,
        status: {
          kind: 'sleep',
          turnsRemaining: 0,
        },
        active: false,
        sourcePlayerId: ctx.playerId,
        moveName: ctx.move.name,
      });

      return { canAct: true };
    }

    sleep.turnsRemaining = Math.max(0, sleep.turnsRemaining - 1);
    ctx.events.push({
      type: 'pokemon.major_status_updated',
      playerId: ctx.playerId,
      pokemonName: ctx.attacker.name,
      status: {
        kind: 'sleep',
        turnsRemaining: sleep.turnsRemaining,
      },
      active: true,
      sourcePlayerId: ctx.playerId,
      moveName: ctx.move.name,
    });
    ctx.events.push({
      type: 'attack.asleep',
      playerId: ctx.playerId,
      targetPlayerId: ctx.opponentPlayerId,
      pokemonName: ctx.attacker.name,
      targetPokemonName: ctx.defender.name,
      moveName: ctx.move.name,
    });

    return { canAct: false };
  },
};
