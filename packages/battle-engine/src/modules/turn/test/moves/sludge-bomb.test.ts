import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Sludge Bomb', () => {
  it('lands and has a chance to poison the opponent after dealing damage', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // accuracy check
        0.9, // critical check (fails)
        0.5, // damage random factor
        0.05, // status chance (poison)
      ],
    });

    const { events } = fixture.execute('Sludge Bomb', 'Sleep Powder');

    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'poison' &&
          event.active === true,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon('player-two').majorStatus).toEqual({
      kind: 'poison',
    });
  });

  it('damages poison-type targets without applying poison', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // accuracy check
        0.9, // critical check (fails)
        0.5, // damage random factor
        0.05, // status chance (poison)
      ],
    });

    const { events } = fixture.execute('Sludge Bomb', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'poison',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' &&
          event.playerId === 'player-one' &&
          event.moveName === 'Sludge Bomb',
      ),
    ).toBe(false);
    expect(fixture.getActivePokemon('player-two').majorStatus).toBeNull();
  });
});
