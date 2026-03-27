import { describe, expect, it } from 'bun:test';
import {
  buildPartyEntries,
  createTestParty,
  createTestSpeciesLookup,
} from './species-fixture';

describe('test species fixture builders', () => {
  it('builds a party from arbitrary schema-compatible species definitions', () => {
    const party = createTestParty({
      owner: 'player-one',
      pokemon: [
        {
          species: 'Raichu',
          stats: {
            attack: 95,
            defense: 80,
            specialAttack: 100,
            specialDefense: 85,
            speed: 110,
            hp: 75,
          },
          type1: 'electric',
          type2: null,
          moves: ['thunderbolt', 'toxic'],
        },
      ],
    });

    expect(party.getPokemonByName('Raichu')?.moves.map((move) => move.name)).toEqual([
      'Thunderbolt',
      'Toxic',
    ]);
  });

  it('rejects unknown attack ids in custom species definitions', () => {
    expect(() =>
      buildPartyEntries('player-one', [
        {
          species: 'Snorlax',
          stats: {
            attack: 80,
            defense: 80,
            specialAttack: 80,
            specialDefense: 80,
            speed: 80,
            hp: 80,
          },
          type1: 'normal',
          type2: null,
          moves: ['not-a-real-attack'],
        },
      ]),
    ).toThrow('Attack not-a-real-attack not found in test fixture catalog.');
  });

  it('looks up custom species by name for turn fixtures', () => {
    const lookup = createTestSpeciesLookup([
      {
        species: 'Nidoking',
        stats: {
          attack: 70,
          defense: 80,
          specialAttack: 95,
          specialDefense: 90,
          speed: 85,
          hp: 90,
        },
        type1: 'poison',
        type2: null,
        moves: ['toxic', 'growl'],
      },
    ]);

    expect(lookup.getSpecies('Nidoking')).toEqual({
      species: 'Nidoking',
      genderMalePercentage: 1,
      stats: {
        attack: 70,
        defense: 80,
        specialAttack: 95,
        specialDefense: 90,
        speed: 85,
        hp: 90,
      },
      type1: 'poison',
      type2: null,
      moves: ['toxic', 'growl'],
    });
  });

  it('allows tests to override gender without specifying gender percentages', () => {
    const party = createTestParty({
      owner: 'player-one',
      pokemon: [
        {
          species: 'Raichu',
          gender: 'female',
          stats: {
            attack: 95,
            defense: 80,
            specialAttack: 100,
            specialDefense: 85,
            speed: 110,
            hp: 75,
          },
          type1: 'electric',
          type2: null,
          moves: ['thunderbolt', 'toxic'],
        },
      ],
    });

    expect(party.getPokemonByName('Raichu')?.gender).toBe('female');
  });
});
