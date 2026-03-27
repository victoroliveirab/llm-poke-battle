import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Body Slam', () => {
  it('lands and has a chance to paralyze the opponent after dealing damage', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // accuracy check
        0.9, // critical check (fails)
        0.5, // damage random factor
        0.2, // status chance (paralysis)
      ],
    });

    const { events } = fixture.execute('Body Slam', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'paralysis' &&
          event.active === true,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon('player-two').majorStatus).toEqual({
      kind: 'paralysis',
    });
  });

  it('does not apply paralysis when Body Slam knocks out the target', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // accuracy check
        0.9, // critical check (fails)
        0.5, // damage random factor
      ],
    });
    fixture.setActivePokemonHealth('player-two', 1);

    const { events } = fixture.execute('Body Slam', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'paralysis',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.fainted' && event.playerId === 'player-two',
      ),
    ).toBe(true);
  });

  it('skips paralysis RNG when the opponent is already paralyzed', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // accuracy check
        0.9, // critical check (fails)
        0.5, // damage random factor
      ],
    });
    fixture.setActivePokemonMajorStatus('player-two', { kind: 'paralysis' });

    const { events } = fixture.execute('Body Slam', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === 'player-one',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'paralysis',
      ),
    ).toBe(false);
  });
});
