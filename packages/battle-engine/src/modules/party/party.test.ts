import { describe, expect, it } from 'bun:test';
import { DefaultLoader } from '../species/loader';
import { Party } from './party';

function createParty() {
  const species = new Map(
    new DefaultLoader().load().map((entry) => [entry.species, entry]),
  );

  return new Party({
    level: 50,
    owner: 'player-one',
    pokemon: ['Charizard', 'Raichu', 'Nidoking'].map((name) => {
      const pokemon = species.get(name);
      if (!pokemon) {
        throw new Error(`Pokemon ${name} not found in test loader.`);
      }
      return pokemon;
    }),
  });
}

describe('party status state', () => {
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
});
