import { describe, expect, it } from 'bun:test';
import {
  buildBattleWithRandomSequence,
  getDamageAppliedEvent,
  resolveAttackTurn,
  setActivePokemonHealth,
  setActivePokemonParalysis,
} from './test/turn-test-utils';

describe('turn paralysis status effect', () => {
  it('may prevent a paralyzed pokemon from executing its attack', () => {
    const game = buildBattleWithRandomSequence([
      0.1, // Player 1 paralysis check (fully paralyzed)
      0.5, // Player 2 accuracy check
      0.9, // Player 2 crit check
      0, // Player 2 damage random factor
    ]);

    game.selectParty('player-one', ['Charizard', 'Raichu', 'Nidoking']);
    game.selectParty('player-two', ['Exeggutor', 'Fearow', 'Charizard']);
    setActivePokemonParalysis(game, 'player-one', true);

    const events = resolveAttackTurn(game, 'Strength', 'Sludge Bomb');

    expect(
      events.some(
        (event) => event.type === 'attack.paralyzed' && event.playerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === 'player-one',
      ),
    ).toBe(false);
  });

  it('lets a paralyzed pokemon act when paralysis check passes', () => {
    const game = buildBattleWithRandomSequence([
      0.9, // Player 1 paralysis check (passes)
      0, // Player 1 accuracy check
      0.9, // Player 1 critical check (fails)
      0.5, // Player 1 damage random factor
      0.5, // Player 2 accuracy check
      0.9, // Player 2 critical check
      0, // Player 2 damage random factor
    ]);

    game.selectParty('player-one', ['Charizard', 'Raichu', 'Nidoking']);
    game.selectParty('player-two', ['Exeggutor', 'Fearow', 'Charizard']);
    setActivePokemonParalysis(game, 'player-one', true);

    const events = resolveAttackTurn(game, 'Strength', 'Sludge Bomb');

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
          event.type === 'attack.paralyzed' && event.playerId === 'player-one',
      ),
    ).toBe(false);
  });

  it('reduces speed enough to reverse action order when speed is tied before status', () => {
    const noParalysisGame = buildBattleWithRandomSequence([
      0.4, // Speed tie breaker favors player one
      0, // Player 1 accuracy check
      0.9, // Player 1 critical check (fails)
      0, // Player 1 damage random factor
      0.5, // Player 2 accuracy check
      0.9, // Player 2 critical check
      0, // Player 2 damage random factor
    ]);
    noParalysisGame.selectParty('player-one', ['Charizard', 'Raichu', 'Nidoking']);
    noParalysisGame.selectParty('player-two', ['Fearow', 'Exeggutor', 'Nidoking']);
    setActivePokemonHealth(noParalysisGame, 'player-one', 1);
    setActivePokemonHealth(noParalysisGame, 'player-two', 1);

    const noParalysisTurn = resolveAttackTurn(noParalysisGame, 'Strength', 'Drill Peck');
    expect(
      getDamageAppliedEvent(noParalysisTurn, 'player-one').damage,
    ).toBeGreaterThan(0);
    expect(
      noParalysisTurn.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === 'player-two',
      ),
    ).toBe(false);

    const paralysisGame = buildBattleWithRandomSequence([
      0.5, // Player 2 accuracy check
      0.9, // Player 2 critical check
      0, // Player 2 damage random factor
      0.9, // Player 1 paralysis check
      0, // Player 1 accuracy check
      0.9, // Player 1 critical check
      0, // Player 1 damage random factor
    ]);
    paralysisGame.selectParty('player-one', ['Charizard', 'Raichu', 'Nidoking']);
    paralysisGame.selectParty('player-two', ['Fearow', 'Exeggutor', 'Nidoking']);
    setActivePokemonHealth(paralysisGame, 'player-one', 1);
    setActivePokemonHealth(paralysisGame, 'player-two', 1);
    setActivePokemonParalysis(paralysisGame, 'player-one', true);

    const paralysisTurn = resolveAttackTurn(paralysisGame, 'Strength', 'Drill Peck');
    expect(
      getDamageAppliedEvent(paralysisTurn, 'player-two').damage,
    ).toBeGreaterThan(0);
    expect(
      paralysisTurn.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === 'player-one',
      ),
    ).toBe(false);
  });
});
