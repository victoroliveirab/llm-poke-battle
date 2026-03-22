import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Sleep Powder', () => {
  it('lands and inflicts sleep on the opponent', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Exeggutor', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 1 accuracy check
        0, // sleep effect chance
        0.6, // sleep duration => 3 turns
      ],
    });

    const { events } = fixture.execute('Sleep Powder', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'sleep' &&
          event.status.turnsRemaining === 3 &&
          event.active === true,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon('player-two').majorStatus).toEqual({
      kind: 'sleep',
      turnsRemaining: 3,
    });
  });

  it('misses without inflicting sleep', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Exeggutor', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0.99, // Player 1 accuracy check (miss at 75%)
      ],
    });

    const { events } = fixture.execute('Sleep Powder', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' &&
          event.playerId === 'player-one' &&
          event.moveName === 'Sleep Powder',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) => event.type === 'pokemon.major_status_changed',
      ),
    ).toBe(false);
  });

  it('emits already_affected when the target is already asleep', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Exeggutor', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 1 accuracy check
      ],
    });
    fixture.setActivePokemonMajorStatus('player-two', {
      kind: 'sleep',
      turnsRemaining: 2,
    });

    const { events } = fixture.execute('Sleep Powder', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === 'player-one' &&
          event.targetPlayerId === 'player-two' &&
          event.moveName === 'Sleep Powder' &&
          event.status === 'sleep' &&
          event.blockingStatus === 'sleep',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) => event.type === 'pokemon.major_status_changed',
      ),
    ).toBe(false);
  });
});
