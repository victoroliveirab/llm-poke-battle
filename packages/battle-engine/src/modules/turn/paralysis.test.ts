import { describe, expect, it } from 'bun:test';
import { createTurnStateFixture } from './test/builders/turn-state-fixture';
import {
  getDamageAppliedEvent,
  PLAYER_ONE_ID,
  PLAYER_TWO_ID,
} from './test/builders/shared';

describe('turn paralysis status effect', () => {
  it('may prevent a paralyzed pokemon from executing its attack', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.1, // Player 1 paralysis check (fully paralyzed)
        0.5, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.setActivePokemonParalysis(PLAYER_ONE_ID, true);

    const events = fixture.resolveAttackTurn('Strength', 'Sludge Bomb').events;

    expect(
      events.some(
        (event) =>
          event.type === 'attack.paralyzed' && event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
  });

  it('lets a paralyzed pokemon act when paralysis check passes', () => {
    const fixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Exeggutor', 'Fearow', 'Charizard'],
      randomSequence: [
        0.9, // Player 1 paralysis check (passes)
        0, // Player 1 accuracy check
        0.9, // Player 1 crit check (fails)
        0.5, // Player 1 damage random factor
        0.5, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.setActivePokemonParalysis(PLAYER_ONE_ID, true);

    const events = fixture.resolveAttackTurn('Strength', 'Sludge Bomb').events;

    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.paralyzed' && event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
  });

  it('reduces speed enough to reverse action order when speed is tied before status', () => {
    const noParalysisFixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Fearow', 'Exeggutor', 'Nidoking'],
      randomSequence: [
        0.4, // Speed tie breaker favors player one
        0, // Player 1 accuracy check
        0.9, // Player 1 crit check (fails)
        0, // Player 1 damage random factor
        0.5, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    noParalysisFixture.setActivePokemonHealth(PLAYER_ONE_ID, 1);
    noParalysisFixture.setActivePokemonHealth(PLAYER_TWO_ID, 1);

    const noParalysisTurn = noParalysisFixture.resolveAttackTurn('Strength', 'Drill Peck');
    expect(
      getDamageAppliedEvent(noParalysisTurn.events, PLAYER_ONE_ID).damage,
    ).toBeGreaterThan(0);
    expect(
      noParalysisTurn.events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_TWO_ID,
      ),
    ).toBe(false);

    const paralysisFixture = createTurnStateFixture({
      playerOneParty: ['Charizard', 'Raichu', 'Nidoking'],
      playerTwoParty: ['Fearow', 'Exeggutor', 'Nidoking'],
      randomSequence: [
        0.5, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
        0.9, // Player 1 paralysis check
        0, // Player 1 accuracy check
        0.9, // Player 1 crit check
        0, // Player 1 damage random factor
      ],
    });
    paralysisFixture.setActivePokemonHealth(PLAYER_ONE_ID, 1);
    paralysisFixture.setActivePokemonHealth(PLAYER_TWO_ID, 1);
    paralysisFixture.setActivePokemonParalysis(PLAYER_ONE_ID, true);

    const paralysisTurn = paralysisFixture.resolveAttackTurn('Strength', 'Drill Peck');
    expect(
      getDamageAppliedEvent(paralysisTurn.events, PLAYER_TWO_ID).damage,
    ).toBeGreaterThan(0);
    expect(
      paralysisTurn.events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
  });
});
