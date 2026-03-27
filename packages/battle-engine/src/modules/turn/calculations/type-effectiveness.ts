import { PokemonType } from '../../species';

const typeChart: Partial<
  Record<PokemonType, Partial<Record<PokemonType, number>>>
> = {
  bug: {
    dark: 2,
    fairy: 0.5,
    fighting: 0.5,
    fire: 0.5,
    flying: 0.5,
    grass: 2,
    poison: 0.5,
    psychic: 2,
    rock: 1,
    steel: 0.5,
  },
  dark: {
    dark: 0.5,
    fairy: 0.5,
    fighting: 0.5,
    psychic: 2,
  },
  electric: {
    electric: 0.5,
    flying: 2,
    grass: 0.5,
    ground: 0,
    water: 2,
  },
  fairy: {
    dark: 2,
    fighting: 2,
    fire: 0.5,
    poison: 0.5,
    steel: 0.5,
  },
  fighting: {
    bug: 0.5,
    dark: 2,
    fairy: 0.5,
    flying: 0.5,
    ice: 2,
    normal: 2,
    poison: 0.5,
    psychic: 0.5,
    rock: 2,
    steel: 2,
  },
  fire: {
    bug: 2,
    fire: 0.5,
    grass: 2,
    ice: 2,
    rock: 0.5,
    steel: 2,
    water: 0.5,
  },
  flying: {
    bug: 2,
    electric: 0.5,
    fighting: 2,
    grass: 2,
    rock: 0.5,
    steel: 0.5,
  },
  grass: {
    bug: 0.5,
    fire: 0.5,
    flying: 0.5,
    grass: 0.5,
    ground: 2,
    poison: 0.5,
    rock: 2,
    steel: 0.5,
    water: 2,
  },
  ground: {
    bug: 0.5,
    electric: 2,
    fire: 2,
    flying: 0,
    grass: 0.5,
    poison: 2,
    rock: 2,
    steel: 2,
  },
  ice: {
    fire: 0.5,
    flying: 2,
    grass: 2,
    ground: 2,
    ice: 0.5,
    steel: 0.5,
    water: 0.5,
  },
  normal: {
    rock: 0.5,
    steel: 0.5,
  },
  poison: {
    fairy: 2,
    grass: 2,
    ground: 0.5,
    poison: 0.5,
    rock: 0.5,
    steel: 0,
  },
  psychic: {
    dark: 0,
    fighting: 2,
    poison: 2,
    psychic: 0.5,
    steel: 0.5,
  },
  rock: {
    bug: 2,
    fighting: 0.5,
    fire: 2,
    flying: 2,
    ground: 0.5,
    ice: 2,
    steel: 0.5,
  },
  steel: {
    electric: 0.5,
    fairy: 2,
    fire: 0.5,
    ice: 2,
    rock: 2,
    steel: 0.5,
    water: 0.5,
  },
  water: {
    fire: 2,
    grass: 0.5,
    ground: 2,
    rock: 2,
    water: 0.5,
  },
};

export function getTypeEffectiveness(
  attackType: PokemonType,
  defenderType1: PokemonType,
  defenderType2: PokemonType | null,
) {
  const againstType1 = typeChart[attackType]?.[defenderType1] ?? 1;
  if (!defenderType2) {
    return againstType1;
  }

  const againstType2 = typeChart[attackType]?.[defenderType2] ?? 1;
  return againstType1 * againstType2;
}
