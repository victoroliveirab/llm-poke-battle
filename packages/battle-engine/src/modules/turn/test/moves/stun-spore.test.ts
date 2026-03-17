import { describe, expect, it } from 'bun:test';
import {
  buildBattleWithRandomSequence,
  resolveAttackTurn,
  setActivePokemonParalysis,
} from '../turn-test-utils';

describe('move: Stun Spore', () => {
  it('lands and inflicts paralysis on the opponent', () => {
    const game = buildBattleWithRandomSequence([
      0.5, // Player 2 accuracy check for Sludge Bomb
      0.9, // Player 2 critical check (fails)
      0.5, // Player 2 damage random factor
      0, // Player 1 accuracy check (75% accuracy)
    ]);
    game.selectParty('player-one', ['Exeggutor', 'Fearow', 'Charizard']);
    game.selectParty('player-two', ['Nidoking', 'Fearow', 'Charizard']);

    const events = resolveAttackTurn(game, 'Stun Spore', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.status_changed' &&
          event.playerId === 'player-two' &&
          event.status === 'paralysis' &&
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
    const game = buildBattleWithRandomSequence([
      0.5, // Player 2 accuracy check for Sludge Bomb
      0.9, // Player 2 critical check (fails)
      0.5, // Player 2 damage random factor
      0.99, // Player 1 accuracy check (miss at 75%)
    ]);
    game.selectParty('player-one', ['Exeggutor', 'Fearow', 'Charizard']);
    game.selectParty('player-two', ['Nidoking', 'Fearow', 'Charizard']);

    const events = resolveAttackTurn(game, 'Stun Spore', 'Sludge Bomb');

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
          event.type === 'pokemon.status_changed' &&
          event.playerId === 'player-two' &&
          event.status === 'paralysis',
      ),
    ).toBe(false);
  });

  it('emits already_affected when the target is already paralyzed', () => {
    const game = buildBattleWithRandomSequence([
      0.5, // Player 2 accuracy check for Sludge Bomb
      0.9, // Player 2 critical check (fails)
      0.5, // Player 2 damage random factor
      0, // Player 1 accuracy check (75% accuracy)
    ]);
    game.selectParty('player-one', ['Exeggutor', 'Fearow', 'Charizard']);
    game.selectParty('player-two', ['Nidoking', 'Fearow', 'Charizard']);
    setActivePokemonParalysis(game, 'player-two', true);

    const events = resolveAttackTurn(game, 'Stun Spore', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === 'player-one' &&
          event.targetPlayerId === 'player-two' &&
          event.moveName === 'Stun Spore' &&
          event.status === 'paralysis',
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
  });
});
