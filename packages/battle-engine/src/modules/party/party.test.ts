import { describe, expect, it } from 'bun:test';
import { createTestParty } from '../../test/builders/species-fixture';

function createParty() {
  return createTestParty({
    owner: 'player-one',
    pokemon: [
      {
        species: 'Charizard',
        stats: {
          attack: 84,
          defense: 78,
          specialAttack: 109,
          specialDefense: 85,
          speed: 100,
          hp: 78,
        },
        type1: 'fire',
        type2: 'flying',
        moves: ['fire-punch', 'strength'],
      },
      {
        species: 'Raichu',
        stats: {
          attack: 90,
          defense: 55,
          specialAttack: 90,
          specialDefense: 80,
          speed: 110,
          hp: 60,
        },
        type1: 'electric',
        type2: null,
        moves: ['thunderbolt', 'growl'],
      },
    ],
  });
}

describe('party status state', () => {
  it('copies attack catalog data into party move state on construction', () => {
    const party = createParty();
    const charizard = party.getPokemonByName('Charizard');
    const firePunch = charizard?.moves.find((move) => move.name === 'Fire Punch');

    expect(firePunch).toEqual({
      accuracy: 100,
      class: 'physical',
      id: 'fire-punch',
      maxPP: 15,
      name: 'Fire Punch',
      power: 75,
      remaining: 15,
      statusEffects: [
        {
          chance: 10,
          kind: 'major-status',
          status: 'burn',
          target: 'opponent',
        },
      ],
      type: 'fire',
      used: 0,
    });
  });

  it('assigns gender from the configured male percentage during construction', () => {
    const party = createTestParty({
      owner: 'player-one',
      random: (() => {
        const values = [0.874, 0.5];
        let index = 0;
        return () => values[index++] ?? 0;
      })(),
      pokemon: [
        {
          species: 'Charizard',
          genderMalePercentage: 0.875,
          stats: {
            attack: 84,
            defense: 78,
            specialAttack: 109,
            specialDefense: 85,
            speed: 100,
            hp: 78,
          },
          type1: 'fire',
          type2: 'flying',
          moves: ['fire-punch', 'strength'],
        },
        {
          species: 'Raichu',
          genderMalePercentage: 0.5,
          stats: {
            attack: 90,
            defense: 55,
            specialAttack: 90,
            specialDefense: 80,
            speed: 110,
            hp: 60,
          },
          type1: 'electric',
          type2: null,
          moves: ['thunderbolt', 'growl'],
        },
      ],
    });

    expect(party.getPokemonByName('Charizard')?.gender).toBe('male');
    expect(party.getPokemonByName('Raichu')?.gender).toBe('female');
  });

  it('applies a major status', () => {
    const party = createParty();

    expect(party.applyMajorStatus('Charizard', { kind: 'paralysis' })).toBe(true);
    expect(party.getPokemonByName('Charizard')?.majorStatus).toEqual({
      kind: 'paralysis',
    });
  });

  it('refuses a second incompatible major status', () => {
    const party = createParty();
    party.applyMajorStatus('Charizard', { kind: 'paralysis' });

    expect(party.applyMajorStatus('Charizard', { kind: 'burn' })).toBe(false);
    expect(party.getPokemonByName('Charizard')?.majorStatus).toEqual({
      kind: 'paralysis',
    });
  });

  it('applies badly poisoned as a major status', () => {
    const party = createParty();

    expect(
      party.applyMajorStatus('Charizard', {
        kind: 'badly-poisoned',
        turnsElapsed: 1,
      }),
    ).toBe(true);
    expect(party.getPokemonByName('Charizard')?.majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 1,
    });
  });

  it('adds a volatile status', () => {
    const party = createParty();

    expect(
      party.applyVolatileStatus('Charizard', {
        kind: 'confusion',
        turnsRemaining: 3,
      }),
    ).toBe(true);
    expect(party.getPokemonByName('Charizard')?.volatileStatuses).toEqual([
      { kind: 'confusion', turnsRemaining: 3 },
    ]);
  });

  it('clears a volatile status', () => {
    const party = createParty();
    party.applyVolatileStatus('Charizard', {
      kind: 'confusion',
      turnsRemaining: 3,
    });

    expect(party.clearStatus('Charizard', 'confusion')).toBe(true);
    expect(party.getPokemonByName('Charizard')?.volatileStatuses).toEqual([]);
  });

  it('updates an existing volatile status duration', () => {
    const party = createParty();
    party.applyVolatileStatus('Charizard', {
      kind: 'confusion',
      turnsRemaining: 3,
    });

    expect(
      party.setVolatileStatus('Charizard', {
        kind: 'confusion',
        turnsRemaining: 1,
      }),
    ).toBe(true);
    expect(party.getPokemonByName('Charizard')?.volatileStatuses).toEqual([
      { kind: 'confusion', turnsRemaining: 1 },
    ]);
  });

  it('clears volatile statuses but keeps major status when switching out', () => {
    const party = createParty();
    party.applyMajorStatus('Charizard', { kind: 'paralysis' });
    party.applyVolatileStatus('Charizard', {
      kind: 'confusion',
      turnsRemaining: 2,
    });

    party.putPokemonInFront('Raichu');

    expect(party.getPokemonByName('Charizard')?.majorStatus).toEqual({
      kind: 'paralysis',
    });
    expect(party.getPokemonByName('Charizard')?.volatileStatuses).toEqual([]);
  });

  it('resets badly poisoned turns when switching out', () => {
    const party = createParty();
    party.applyMajorStatus('Charizard', {
      kind: 'badly-poisoned',
      turnsElapsed: 3,
    });

    party.putPokemonInFront('Raichu');

    expect(party.getPokemonByName('Charizard')?.majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 1,
    });
  });

  it('clones major status state when reading the full party', () => {
    const party = createParty();
    party.applyMajorStatus('Charizard', {
      kind: 'sleep',
      turnsRemaining: 3,
    });

    const snapshot = party.all();
    const active = snapshot[0];
    if (!active || active.majorStatus === null || active.majorStatus.kind !== 'sleep') {
      throw new Error('Expected Charizard to be asleep in the snapshot.');
    }

    active.majorStatus.turnsRemaining = 1;

    expect(party.getPokemonByName('Charizard')?.majorStatus).toEqual({
      kind: 'sleep',
      turnsRemaining: 3,
    });
  });

  it('clones badly poisoned state when reading the full party', () => {
    const party = createParty();
    party.applyMajorStatus('Charizard', {
      kind: 'badly-poisoned',
      turnsElapsed: 2,
    });

    const snapshot = party.all();
    const active = snapshot[0];
    if (
      !active ||
      active.majorStatus === null ||
      active.majorStatus.kind !== 'badly-poisoned'
    ) {
      throw new Error('Expected Charizard to be badly poisoned in the snapshot.');
    }

    active.majorStatus.turnsElapsed = 4;

    expect(party.getPokemonByName('Charizard')?.majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 2,
    });
  });

  it('includes gender when reading the full party snapshot', () => {
    const party = createParty();

    expect(party.all()[0]?.gender).toBe('male');
    expect(party.all()[1]?.gender).toBe('male');
  });
});
