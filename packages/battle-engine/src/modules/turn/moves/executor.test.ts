import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../test/builders/move-fixture';

describe('move executor', () => {
  it('skips post-damage status effects when the defender faints', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Nidoking', 'Fearow', 'Charizard'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Body Slam accuracy
        0.99, // critical check (fails)
        0, // damage random factor
      ],
    });
    fixture.setActivePokemonHealth('player-two', 1);

    const { events, result } = fixture.execute('Body Slam', 'Sludge Bomb');

    expect(result.defenderFainted).toBe(true);
    expect(events.some((event) => event.type === 'pokemon.fainted')).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.status_changed' && event.status === 'paralysis',
      ),
    ).toBe(false);
  });

  it('emits already_affected for status-only moves against an affected target', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Exeggutor', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Stun Spore accuracy
      ],
    });
    fixture.setActivePokemonParalysis('player-two', true);

    const { events } = fixture.execute('Stun Spore', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === 'player-one' &&
          event.targetPlayerId === 'player-two',
      ),
    ).toBe(true);
  });

  it('emits attack.missed when every stage change is blocked by clamping', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Fearow', 'Raichu', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Raichu', 'Charizard'],
      randomSequence: [
        0, // Sand Attack accuracy
      ],
    });
    fixture.setActivePokemonStages('player-two', { accuracy: -6 });

    const { events } = fixture.execute('Sand Attack', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' && event.moveName === 'Sand Attack',
      ),
    ).toBe(true);
    expect(
      events.some((event) => event.type === 'battle.stat_stage_changed'),
    ).toBe(false);
  });
});
