import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Ice Beam', () => {
  it('lands and has a chance to freeze the opponent after dealing damage', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Lapras', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // accuracy check
        0.9, // critical check (fails)
        0.5, // damage random factor
        0.05, // status chance (freeze)
      ],
    });

    const { events } = fixture.execute('Ice Beam', 'Sludge Bomb');

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
          event.status === 'freeze' &&
          event.active === true,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon('player-two').majorStatus).toBe('freeze');
  });
});
