import { describe, expect, it } from 'bun:test';
import { createMoveFixture } from '../builders/move-fixture';

describe('move: Confuse Ray', () => {
  it('lands and inflicts confusion on the opponent', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Lapras', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 1 accuracy check
        0, // confusion chance
        0.6, // confusion duration => 3 turns
      ],
    });

    const { events } = fixture.execute('Confuse Ray', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.volatile_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'confusion' &&
          event.status.turnsRemaining === 3 &&
          event.active === true,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon('player-two').volatileStatuses).toEqual([
      { kind: 'confusion', turnsRemaining: 3 },
    ]);
  });

  it('emits already_affected when the target is already confused', () => {
    const fixture = createMoveFixture({
      playerOneParty: ['Lapras', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 1 accuracy check
      ],
    });
    fixture.getActivePokemon('player-two').volatileStatuses = [
      { kind: 'confusion', turnsRemaining: 4 },
    ];

    const { events } = fixture.execute('Confuse Ray', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === 'player-one' &&
          event.targetPlayerId === 'player-two' &&
          event.moveName === 'Confuse Ray' &&
          event.status === 'confusion',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.volatile_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'confusion' &&
          event.active === true,
      ),
    ).toBe(false);
  });

  it('samples confusion duration between 1 and 4 turns inclusive', () => {
    const shortestFixture = createMoveFixture({
      playerOneParty: ['Lapras', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // accuracy
        0, // confusion chance
        0, // duration => 1
      ],
    });
    const longestFixture = createMoveFixture({
      playerOneParty: ['Lapras', 'Fearow', 'Charizard'],
      playerTwoParty: ['Nidoking', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // accuracy
        0, // confusion chance
        0.99, // duration => 4
      ],
    });

    shortestFixture.execute('Confuse Ray', 'Sludge Bomb');
    longestFixture.execute('Confuse Ray', 'Sludge Bomb');

    expect(
      shortestFixture.getActivePokemon('player-two').volatileStatuses,
    ).toEqual([{ kind: 'confusion', turnsRemaining: 1 }]);
    expect(
      longestFixture.getActivePokemon('player-two').volatileStatuses,
    ).toEqual([{ kind: 'confusion', turnsRemaining: 4 }]);
  });
});
