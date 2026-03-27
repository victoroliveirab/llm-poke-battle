import { getActivePokemon } from '../party-state';
import { StatusHandler } from './types';

const BURN_DAMAGE_DIVISOR = 2;
const BURN_RESIDUAL_DIVISOR = 8;

export const burnStatusHandler: StatusHandler = {
  modifyDamage(ctx) {
    if (ctx.move.class !== 'physical' || ctx.damage <= 0) {
      return { damage: ctx.damage };
    }

    return {
      damage: Math.max(1, Math.floor(ctx.damage / BURN_DAMAGE_DIVISOR)),
    };
  },

  endTurn(ctx) {
    const pokemon = getActivePokemon(ctx.simulatedParties, ctx.playerId);
    if (pokemon.health <= 0) {
      return;
    }

    const damage = Math.max(
      1,
      Math.floor(pokemon.stats.hp / BURN_RESIDUAL_DIVISOR),
    );
    pokemon.health = Math.max(0, pokemon.health - damage);

    ctx.events.push({
      type: 'pokemon.hurt_by_status',
      playerId: ctx.playerId,
      pokemonName: pokemon.name,
      status: 'burn',
      damage,
    });

    if (pokemon.health <= 0) {
      ctx.events.push({
        type: 'pokemon.fainted',
        playerId: ctx.playerId,
        pokemonName: pokemon.name,
      });
    }
  },
};
