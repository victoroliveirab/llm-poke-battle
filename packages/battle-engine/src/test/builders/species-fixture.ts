import { Party } from '../../modules/party/party';
import {
  AttackDefinition,
  PokemonSpecies,
  SpeciesLoader,
} from '../../modules/species';
import { DefaultLoader } from '../../modules/species/loader';

export type TestPokemonSpecies = PokemonSpecies;
export type TestPokemonInput = string | TestPokemonSpecies;

const catalog = new DefaultLoader().load();
const catalogSpeciesByName = new Map<string, PokemonSpecies>(
  catalog.species.map((entry) => [entry.species, entry]),
);
const attacksById = new Map<string, AttackDefinition>(
  catalog.attacks.map((entry) => [entry.id, entry]),
);

export function getAttackDefinition(attackId: string) {
  const attack = attacksById.get(attackId);
  if (!attack) {
    throw new Error(`Attack ${attackId} not found in test fixture catalog.`);
  }

  return attack;
}

export function getCatalogSpecies(speciesName: string) {
  const species = catalogSpeciesByName.get(speciesName);
  if (!species) {
    throw new Error(`Pokemon ${speciesName} not found in test fixture catalog.`);
  }

  return species;
}

export function resolveTestPokemon(pokemon: TestPokemonInput) {
  if (typeof pokemon === 'string') {
    return getCatalogSpecies(pokemon);
  }

  for (const attackId of pokemon.moves) {
    getAttackDefinition(attackId);
  }

  return pokemon;
}

export function resolveTestPokemonList(pokemon: TestPokemonInput[]) {
  return pokemon.map(resolveTestPokemon);
}

export function createTestSpeciesLookup(pokemon: TestPokemonInput[]) {
  const byName = new Map<string, PokemonSpecies>();

  for (const entry of resolveTestPokemonList(pokemon)) {
    const existing = byName.get(entry.species);
    if (existing) {
      const existingSignature = JSON.stringify(existing);
      const nextSignature = JSON.stringify(entry);
      if (existingSignature !== nextSignature) {
        throw new Error(
          `Conflicting definitions found for test Pokemon ${entry.species}.`,
        );
      }
      continue;
    }

    byName.set(entry.species, entry);
  }

  return {
    getSpecies(speciesName: string) {
      const species = byName.get(speciesName);
      if (!species) {
        throw new Error(`Pokemon ${speciesName} not found in test fixture lookup.`);
      }

      return species;
    },
    hasSpecies(speciesName: string) {
      return byName.has(speciesName);
    },
  };
}

export function createTestSpeciesLoader(
  pokemon: TestPokemonInput[],
): SpeciesLoader {
  const species = resolveTestPokemonList(pokemon);

  return {
    load: () => ({
      attacks: catalog.attacks,
      species,
    }),
  };
}

export function createTestParty(params: {
  owner: string;
  pokemon: TestPokemonInput[];
  level?: number;
}) {
  return new Party({
    getAttack: getAttackDefinition,
    level: params.level ?? 50,
    owner: params.owner,
    pokemon: resolveTestPokemonList(params.pokemon),
  });
}

export function buildPartyEntries(owner: string, pokemon: TestPokemonInput[]) {
  return createTestParty({ owner, pokemon }).all();
}
