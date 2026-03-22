import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Stun Spore', () => {
  it('lands and inflicts paralysis on the opponent', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Exeggutor', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 1 accuracy check (75% accuracy)
      ],
    });

    const { events } = fixture.execute('Stun Spore', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'paralysis' &&
          event.active === true,
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' &&
          event.playerId === 'player-one' &&
          event.moveName === 'Stun Spore',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === 'player-one',
      ),
    ).toBe(false);
  });

  it('misses without inflicting paralysis', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Exeggutor', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0.99, // Player 1 accuracy check (miss at 75%)
      ],
    });

    const { events } = fixture.execute('Stun Spore', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' &&
          event.playerId === 'player-one' &&
          event.moveName === 'Stun Spore',
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
  });

  it('emits already_affected when the target is already paralyzed', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Exeggutor', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 1 accuracy check (75% accuracy)
      ],
    });
    fixture.setActivePokemonMajorStatus('player-two', { kind: 'paralysis' });

    const { events } = fixture.execute('Stun Spore', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === 'player-one' &&
          event.targetPlayerId === 'player-two' &&
          event.moveName === 'Stun Spore' &&
          event.status === 'paralysis' &&
          event.blockingStatus === 'paralysis',
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
  });

  it('reports sleep as the blocking status when the target already has a different major status', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Exeggutor', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 1 accuracy check (75% accuracy)
      ],
    });
    fixture.setActivePokemonMajorStatus('player-two', {
      kind: 'sleep',
      turnsRemaining: 2,
    });

    const { events } = fixture.execute('Stun Spore', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === 'player-one' &&
          event.targetPlayerId === 'player-two' &&
          event.moveName === 'Stun Spore' &&
          event.status === 'paralysis' &&
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
