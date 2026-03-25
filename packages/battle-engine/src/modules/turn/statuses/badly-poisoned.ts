import { getActivePokemon } from '../party-state';
import { StatusHandler } from './types';

const BADLY_POISONED_DIVISOR = 16;

export const badlyPoisonedStatusHandler: StatusHandler = {
  endTurn(ctx) {
    const pokemon = getActivePokemon(ctx.simulatedParties, ctx.playerId);
    if (
      pokemon.health <= 0 ||
      pokemon.majorStatus === null ||
      pokemon.majorStatus.kind !== 'badly-poisoned'
    ) {
      return;
    }

    const damage = Math.max(
      1,
      Math.floor(
        (pokemon.stats.hp * pokemon.majorStatus.turnsElapsed) /
          BADLY_POISONED_DIVISOR,
      ),
    );
    pokemon.health = Math.max(0, pokemon.health - damage);

    ctx.events.push({
      type: 'pokemon.hurt_by_status',
      playerId: ctx.playerId,
      pokemonName: pokemon.name,
      status: 'badly-poisoned',
      damage,
    });

    pokemon.majorStatus = {
      kind: 'badly-poisoned',
      turnsElapsed: pokemon.majorStatus.turnsElapsed + 1,
    };
    ctx.events.push({
      type: 'pokemon.major_status_updated',
      playerId: ctx.playerId,
      pokemonName: pokemon.name,
      status: pokemon.majorStatus,
      active: true,
      sourcePlayerId: ctx.playerId,
      moveName: 'status',
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
