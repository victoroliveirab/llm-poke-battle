import { getActivePokemon } from '../party-state';
import { StatusHandler } from './types';

const POISON_RESIDUAL_DIVISOR = 8;

export const poisonStatusHandler: StatusHandler = {
  endTurn(ctx) {
    const pokemon = getActivePokemon(ctx.simulatedParties, ctx.playerId);
    if (pokemon.health <= 0) {
      return;
    }

    const damage = Math.max(
      1,
      Math.floor(pokemon.stats.hp / POISON_RESIDUAL_DIVISOR),
    );
    pokemon.health = Math.max(0, pokemon.health - damage);

    ctx.events.push({
      type: 'pokemon.hurt_by_status',
      playerId: ctx.playerId,
      pokemonName: pokemon.name,
      status: 'poison',
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
