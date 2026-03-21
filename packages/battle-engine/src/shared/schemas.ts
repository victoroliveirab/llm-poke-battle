import { z } from 'zod';

export const pokemonTypeEnum = z.enum([
  'bug',
  'dark',
  'electric',
  'fairy',
  'fighting',
  'fire',
  'flying',
  'grass',
  'ground',
  'ice',
  'normal',
  'poison',
  'psychic',
  'rock',
  'steel',
  'water',
  'ghost',
]);
