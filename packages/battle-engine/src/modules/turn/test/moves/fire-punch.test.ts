import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Fire Punch', () => {
  it('lands and has a chance to burn the opponent after dealing damage', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // accuracy check
        0.9, // critical check (fails)
        0.5, // damage random factor
        0.05, // status chance (burn)
      ],
    });

    const { events } = fixture.execute('Fire Punch', 'Sludge Bomb');

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
          event.status.kind === 'burn' &&
          event.active === true,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon('player-two').majorStatus).toEqual({
      kind: 'burn',
    });
  });
});
