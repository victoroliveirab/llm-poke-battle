import { DomainEvent } from '../../../../engine/events';
import { TurnAction } from '../../types';
import {
  buildPartyEntries as buildEntriesFromTestPokemon,
  createTestParty,
  createTestSpeciesLoader,
  createTestSpeciesLookup,
  getAttackDefinition,
  getCatalogSpecies,
  TestPokemonInput,
  TestPokemonSpecies,
} from '../../../../test/builders/species-fixture';

export const PLAYER_ONE_ID = 'player-one';
export const PLAYER_TWO_ID = 'player-two';

export type { TestPokemonInput, TestPokemonSpecies };
export {
  createTestParty,
  createTestSpeciesLoader,
  createTestSpeciesLookup,
  getAttackDefinition,
};

export function getSpecies(speciesName: string) {
  return getCatalogSpecies(speciesName);
}

export function buildPartyEntries(owner: string, pokemon: TestPokemonInput[]) {
  return buildEntriesFromTestPokemon(owner, pokemon);
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
