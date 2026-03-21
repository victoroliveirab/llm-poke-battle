import { DomainEvent } from '../../../../engine/events';
import { Party, PartyEntry } from '../../../party/party';
import { PokemonSpecies } from '../../../species';
import { DefaultLoader } from '../../../species/loader';
import { getActivePokemon } from '../../party-state';
import { TurnAction } from '../../types';

export const PLAYER_ONE_ID = 'player-one';
export const PLAYER_TWO_ID = 'player-two';

const speciesCatalog = new DefaultLoader().load();
const speciesByName = new Map<string, PokemonSpecies>(
  speciesCatalog.map((entry) => [entry.species, entry]),
);

export function getSpecies(speciesName: string) {
  const species = speciesByName.get(speciesName);
  if (!species) {
    throw new Error(`Pokemon ${speciesName} not found in test fixture catalog.`);
  }

  return species;
}

export function buildPartyEntries(owner: string, pokemonNames: string[]) {
  return new Party({
    level: 50,
    pokemon: pokemonNames.map((name) => getSpecies(name)),
    owner,
  }).all();
}

export function buildRandomSequence(sequence: number[]) {
  let randomIndex = 0;

  return () => {
    const value = sequence[randomIndex];
    randomIndex += 1;
    return typeof value === 'number' ? value : 0;
  };
}

export function buildAttackAction(playerId: string, attackName: string): TurnAction {
  return {
    playerId,
    action: {
      playerID: playerId,
      type: 'attack',
      payload: {
        attackName,
      },
    },
  };
}

export function buildSwitchAction(playerId: string, newPokemon: string): TurnAction {
  return {
    playerId,
    action: {
      playerID: playerId,
      type: 'switch',
      payload: {
        newPokemon,
      },
    },
  };
}

export function getDamageAppliedEvent(
  events: DomainEvent[],
  sourcePlayerId: string,
) {
  const damageEvent = events.find(
    (event) =>
      event.type === 'damage.applied' && event.sourcePlayerId === sourcePlayerId,
  );
  if (!damageEvent || damageEvent.type !== 'damage.applied') {
    throw new Error(
      `Expected a damage.applied event from source '${sourcePlayerId}'.`,
    );
  }

  return damageEvent;
}
