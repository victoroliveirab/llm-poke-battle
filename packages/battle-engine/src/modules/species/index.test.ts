import { describe, expect, it } from 'bun:test';
import type { GameContext } from '../../engine/context';
import { SpeciesModule, type SpeciesData } from '.';
import { DefaultLoader } from './loader';

function buildSpeciesData(overrides: Partial<SpeciesData> = {}): SpeciesData {
  return {
    attacks: [
      {
        id: 'thunderbolt',
        name: 'Thunderbolt',
        power: 90,
        accuracy: 100,
        makesContact: false,
        pp: 15,
        type: 'electric',
        class: 'special',
      },
    ],
    species: [
      {
        species: 'Raichu',
        genderMalePercentage: 0.5,
        stats: {
          attack: 90,
          defense: 55,
          hp: 60,
          specialAttack: 90,
          specialDefense: 80,
          speed: 110,
        },
        type1: 'electric',
        type2: null,
        moves: ['thunderbolt'],
      },
    ],
    ...overrides,
  };
}

describe('species catalog validation', () => {
  it('rejects species that reference unknown attacks', () => {
    const module = new SpeciesModule({
      load: () =>
        buildSpeciesData({
          species: [
            {
              species: 'Raichu',
              genderMalePercentage: 0.5,
              stats: {
                attack: 90,
                defense: 55,
                hp: 60,
                specialAttack: 90,
                specialDefense: 80,
                speed: 110,
              },
              type1: 'electric',
              type2: null,
              moves: ['missing-attack'],
            },
          ],
        }),
    });

    expect(() => module.init(null as unknown as GameContext)).toThrow(
      'references unknown attack missing-attack',
    );
  });

  it('rejects duplicate attack ids', () => {
    const duplicateAttack = {
      id: 'thunderbolt',
      name: 'Thunderbolt',
      power: 90,
      accuracy: 100,
      makesContact: false,
      pp: 15,
      type: 'electric' as const,
      class: 'special' as const,
    };
    const module = new SpeciesModule({
      load: () =>
        buildSpeciesData({
          attacks: [duplicateAttack, duplicateAttack],
        }),
    });

    expect(() => module.init(null as unknown as GameContext)).toThrow(
      'Attack thunderbolt is duplicated',
    );
  });

  it('loads Toxic from the default attack catalog', () => {
    const toxic = new DefaultLoader()
      .load()
      .attacks.find((attack) => attack.id === 'toxic');

    expect(toxic).toEqual({
      id: 'toxic',
      name: 'Toxic',
      power: 0,
      accuracy: 90,
      makesContact: false,
      pp: 10,
      type: 'poison',
      class: 'special',
      statusEffects: [
        {
          target: 'opponent',
          kind: 'major-status',
          status: 'badly-poisoned',
          chance: 100,
        },
      ],
    });
  });

  it('loads Flash Cannon from the default attack catalog', () => {
    const flashCannon = new DefaultLoader()
      .load()
      .attacks.find((attack) => attack.id === 'flash-cannon');

    expect(flashCannon).toEqual({
      id: 'flash-cannon',
      name: 'Flash Cannon',
      power: 80,
      accuracy: 100,
      makesContact: false,
      pp: 10,
      type: 'steel',
      class: 'special',
      statChanges: [
        {
          target: 'opponent',
          stat: 'specialDefense',
          stages: -1,
          chance: 10,
        },
      ],
    });
  });

  it('rejects species with an invalid gender male percentage', () => {
    const module = new SpeciesModule({
      load: () =>
        buildSpeciesData({
          species: [
            {
              species: 'Raichu',
              genderMalePercentage: 1.1,
              stats: {
                attack: 90,
                defense: 55,
                hp: 60,
                specialAttack: 90,
                specialDefense: 80,
                speed: 110,
              },
              type1: 'electric',
              type2: null,
              moves: ['thunderbolt'],
            },
          ],
        }),
    });

    expect(() => module.init(null as unknown as GameContext)).toThrow(
      'Number must be less than or equal to 1',
    );
  });

  it('accepts species with -1 gender male percentage as genderless', () => {
    const module = new SpeciesModule({
      load: () =>
        buildSpeciesData({
          species: [
            {
              species: 'Magnezone',
              genderMalePercentage: -1,
              stats: {
                attack: 70,
                defense: 115,
                hp: 70,
                specialAttack: 130,
                specialDefense: 90,
                speed: 60,
              },
              type1: 'electric',
              type2: 'steel',
              moves: ['thunderbolt'],
            },
          ],
        }),
    });

    expect(() => module.init(null as unknown as GameContext)).not.toThrow();
  });

  it('rejects attacks that omit makesContact', () => {
    const module = new SpeciesModule({
      load: () =>
        buildSpeciesData({
          attacks: [
            {
              id: 'thunderbolt',
              name: 'Thunderbolt',
              power: 90,
              accuracy: 100,
              pp: 15,
              type: 'electric',
              class: 'special',
            },
          ],
        }),
    });

    expect(() => module.init(null as unknown as GameContext)).toThrow(
      'Required',
    );
  });

  it('rejects species with a negative non-sentinel gender male percentage', () => {
    const module = new SpeciesModule({
      load: () =>
        buildSpeciesData({
          species: [
            {
              species: 'Raichu',
              genderMalePercentage: -0.5,
              stats: {
                attack: 90,
                defense: 55,
                hp: 60,
                specialAttack: 90,
                specialDefense: 80,
                speed: 110,
              },
              type1: 'electric',
              type2: null,
              moves: ['thunderbolt'],
            },
          ],
        }),
    });

    expect(() => module.init(null as unknown as GameContext)).toThrow();
  });
});
