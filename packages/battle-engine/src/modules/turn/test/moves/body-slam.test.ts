import { describe, expect, it } from 'bun:test';
import {
  buildBattleWithRandomSequence,
  resolveAttackTurn,
  setActivePokemonHealth,
  setActivePokemonParalysis,
} from '../turn-test-utils';

describe('move: Body Slam', () => {
  it('lands and has a chance to paralyze the opponent after dealing damage', () => {
    const game = buildBattleWithRandomSequence([
      0, // Player 1 accuracy check
      0.9, // Player 1 critical check (fails)
      0.5, // Player 1 damage random factor
      0.2, // Player 1 status chance (paralysis)
      0.99, // Player 2 Sludge Bomb miss check
    ]);
    game.selectParty('player-one', ['Nidoking', 'Fearow', 'Charizard']);
    game.selectParty('player-two', ['Exeggutor', 'Fearow', 'Charizard']);

    const events = resolveAttackTurn(game, 'Body Slam', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.status_changed' &&
          event.playerId === 'player-two' &&
          event.status === 'paralysis' &&
          event.active === true,
      ),
    ).toBe(true);
  });

  it('does not apply paralysis when Body Slam knocks out the target', () => {
    const game = buildBattleWithRandomSequence([
      0, // Player 1 accuracy check
      0.9, // Player 1 critical check (fails)
      0.5, // Player 1 damage random factor
    ]);
    game.selectParty('player-one', ['Nidoking', 'Fearow', 'Charizard']);
    game.selectParty('player-two', ['Exeggutor', 'Fearow', 'Charizard']);
    setActivePokemonHealth(game, 'player-two', 1);

    const events = resolveAttackTurn(game, 'Body Slam', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.status_changed' &&
          event.playerId === 'player-two' &&
          event.status === 'paralysis',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) => event.type === 'pokemon.fainted' && event.playerId === 'player-two',
      ),
    ).toBe(true);
  });

  it('skips paralysis RNG when the opponent is already paralyzed', () => {
    const game = buildBattleWithRandomSequence([
      0, // Player 1 accuracy check
      0.9, // Player 1 critical check (fails)
      0.5, // Player 1 damage random factor
      0.99, // Player 2 Sludge Bomb accuracy check
      0.5, // Player 2 Sludge Bomb critical check
      0.5, // Player 2 Sludge Bomb damage random factor
    ]);
    game.selectParty('player-one', ['Nidoking', 'Fearow', 'Charizard']);
    game.selectParty('player-two', ['Exeggutor', 'Fearow', 'Charizard']);
    setActivePokemonParalysis(game, 'player-two', true);

    const events = resolveAttackTurn(game, 'Body Slam', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === 'player-one',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.status_changed' &&
          event.playerId === 'player-two' &&
          event.status === 'paralysis',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === 'player-two',
      ),
    ).toBe(false);
  });
});
