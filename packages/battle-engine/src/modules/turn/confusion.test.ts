import { describe, expect, it } from 'bun:test';
import { resumeTurnAfterReplacement } from './resolve-turn';
import { createTurnStateFixture } from './test/builders/turn-state-fixture';
import { PLAYER_ONE_ID, PLAYER_TWO_ID } from './test/builders/shared';

describe('turn confusion status effect', () => {
  it('prevents a confused pokemon from executing its move when it self-hits', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.2, // Player 1 confusion self-hit succeeds
        0, // Player 1 confusion damage random factor
        0.5, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).volatileStatuses = [
      { kind: 'confusion', turnsRemaining: 2 },
    ];

    const events = fixture.resolveAttackTurn('Strength', 'Sludge Bomb').events;

    expect(
      events.some(
        (event) => event.type === 'attack.confused' && event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).volatileStatuses).toEqual([
      { kind: 'confusion', turnsRemaining: 1 },
    ]);
  });

  it('clears confusion on the last turn and lets the pokemon attack normally', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 1 accuracy check
        0.9, // Player 1 crit check
        0.5, // Player 1 damage random factor
        0.5, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).volatileStatuses = [
      { kind: 'confusion', turnsRemaining: 1 },
    ];

    const result = fixture.resolveAttackTurn('Strength', 'Sludge Bomb');

    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.volatile_status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status.kind === 'confusion' &&
          event.active === false,
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).volatileStatuses).toEqual([]);
  });

  it('keeps confusion active against a faster opponent until the confused pokemon begins its move', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Exeggutor', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Lapras', 'Fearow', 'Charizard'],
      randomSequence: [
        0, // Player 2 Confuse Ray accuracy check
        0, // Player 1 Psychic accuracy check
        0.9, // Player 1 crit check
        0.5, // Player 1 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).volatileStatuses = [
      { kind: 'confusion', turnsRemaining: 1 },
    ];

    const result = fixture.resolveAttackTurn('Psychic', 'Confuse Ray');

    expect(
      result.events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === PLAYER_TWO_ID &&
          event.status === 'confusion',
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'pokemon.volatile_status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.status.kind === 'confusion' &&
          event.active === false,
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(fixture.getActivePokemon(PLAYER_ONE_ID).volatileStatuses).toEqual([]);
  });

  it('waits for a replacement and then lets the opposing queued attack hit that replacement', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.2, // Player 1 confusion self-hit succeeds
        0, // Player 1 confusion damage random factor
        0.5, // Player 2 accuracy check after replacement
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.getActivePokemon(PLAYER_ONE_ID).volatileStatuses = [
      { kind: 'confusion', turnsRemaining: 2 },
    ];
    fixture.setActivePokemonHealth(PLAYER_ONE_ID, 1);

    const interruptedTurn = fixture.resolveAttackTurn('Strength', 'Sludge Bomb');

    expect(
      interruptedTurn.events.some(
        (event) => event.type === 'pokemon.fainted' && event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(
      interruptedTurn.events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_TWO_ID,
      ),
    ).toBe(false);
    expect(interruptedTurn.pendingReplacementPlayers).toEqual([PLAYER_ONE_ID]);
    expect(interruptedTurn.suspendedTurn?.remainingAction.playerId).toBe(PLAYER_TWO_ID);
    expect(
      interruptedTurn.events.some((event) => event.type === 'turn.resolved'),
    ).toBe(false);

    if (!interruptedTurn.suspendedTurn) {
      throw new Error('Expected the turn to suspend for a replacement switch.');
    }

    const resumedTurn = resumeTurnAfterReplacement({
      playerIds: [PLAYER_ONE_ID, PLAYER_TWO_ID],
      replacementAction: fixture.switchPokemon(PLAYER_ONE_ID, 'Raichu'),
      remainingAction: interruptedTurn.suspendedTurn.remainingAction,
      simulatedParties: fixture.simulatedParties,
      getSpecies: fixture.getSpecies,
      random: fixture.random,
    });

    expect(
      resumedTurn.events.some(
        (event) =>
          event.type === 'pokemon.switched' &&
          event.playerId === PLAYER_ONE_ID &&
          event.pokemonName === 'Raichu',
      ),
    ).toBe(true);
    expect(
      resumedTurn.events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_TWO_ID &&
          event.pokemonName === 'Raichu',
      ),
    ).toBe(true);
    expect(resumedTurn.pendingReplacementPlayers).toEqual([]);
    expect(
      resumedTurn.events.some((event) => event.type === 'turn.resolved'),
    ).toBe(true);
  });
});
