import { describe, expect, it } from 'bun:test';
import { Battle } from '../../index';
import {
  buildBattleWithRandomSequence,
  getDamageAppliedEvent,
  resolveAttackTurn,
  selectDefaultParties,
  setActivePokemonStages,
} from './test/turn-test-utils';

describe('turn accuracy resolution', () => {
  it('exposes battle stages and removes accuracy from party state', () => {
    const game = new Battle({
      partySize: 3,
      players: [
        { id: 'player-one', name: 'Player 1' },
        { id: 'player-two', name: 'Player 2' },
      ],
      random: () => 0,
    });
    selectDefaultParties(game);

    const state = game.getStateAsPlayer('player-one') as {
      player: Array<Record<string, unknown>>;
    };
    const activePokemon = state.player[0];
    if (!activePokemon) {
      throw new Error('Expected an active Pokemon in player state.');
    }

    expect('accuracyStage' in activePokemon).toBe(true);
    expect('attackStage' in activePokemon).toBe(true);
    expect('criticalStage' in activePokemon).toBe(true);
    expect('defenseStage' in activePokemon).toBe(true);
    expect('evasionStage' in activePokemon).toBe(true);
    expect('specialAttackStage' in activePokemon).toBe(true);
    expect('specialDefenseStage' in activePokemon).toBe(true);
    expect('accuracy' in activePokemon).toBe(false);
    expect(activePokemon.attackStage).toBe(0);
    expect(activePokemon.criticalStage).toBe(0);
    expect(activePokemon.defenseStage).toBe(0);
    expect(activePokemon.specialAttackStage).toBe(0);
    expect(activePokemon.specialDefenseStage).toBe(0);
  });

  it('consumes PP and emits attack.missed without applying damage on miss', () => {
    const game = buildBattleWithRandomSequence([
      0.95, // Charizard Rock Slide miss check (90% accuracy)
      0.1, // Nidoking Sludge Bomb hit check
      0.5, // Nidoking crit check
      0, // Nidoking damage random factor
    ]);
    selectDefaultParties(game);

    const events = resolveAttackTurn(game, 'Rock Slide', 'Sludge Bomb');

    expect(
      events.some(
        (event) =>
          event.type === 'move.consumed' &&
          event.playerId === 'player-one' &&
          event.moveName === 'Rock Slide',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' &&
          event.playerId === 'player-one' &&
          event.moveName === 'Rock Slide',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === 'player-one',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.fainted' && event.playerId === 'player-two',
      ),
    ).toBe(false);

    const state = game.getStateAsPlayer('player-one') as {
      player: Array<{ moves: Array<{ name: string; remaining: number }> }>;
    };
    const rockSlide = state.player[0]?.moves.find((move) => move.name === 'Rock Slide');
    expect(rockSlide?.remaining).toBe(9);
  });

  it('applies accuracy/evasion stage modifiers to hit checks', () => {
    const lowAccuracyGame = buildBattleWithRandomSequence([
      0.2, // Fire Punch miss check at -6 accuracy vs +6 evasion (effective 1/9)
      0.1, // Nidoking Sludge Bomb hit check
      0.5, // Nidoking crit check
      0, // Nidoking damage random factor
    ]);
    selectDefaultParties(lowAccuracyGame);
    setActivePokemonStages(lowAccuracyGame, 'player-one', { accuracyStage: -6 });
    setActivePokemonStages(lowAccuracyGame, 'player-two', { evasionStage: 6 });

    const missEvents = resolveAttackTurn(lowAccuracyGame, 'Fire Punch', 'Sludge Bomb');
    expect(
      missEvents.some(
        (event) =>
          event.type === 'attack.missed' && event.playerId === 'player-one',
      ),
    ).toBe(true);

    const highAccuracyGame = buildBattleWithRandomSequence([
      0.99, // Fire Punch hit check at +6 accuracy vs -6 evasion
      0.5, // Fire Punch crit check
      0, // Fire Punch damage random factor
      0.1, // Nidoking Sludge Bomb hit check
      0.5, // Nidoking crit check
      0, // Nidoking damage random factor
    ]);
    selectDefaultParties(highAccuracyGame);
    setActivePokemonStages(highAccuracyGame, 'player-one', { accuracyStage: 6 });
    setActivePokemonStages(highAccuracyGame, 'player-two', { evasionStage: -6 });

    const hitEvents = resolveAttackTurn(highAccuracyGame, 'Fire Punch', 'Sludge Bomb');
    expect(
      hitEvents.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      hitEvents.some(
        (event) =>
          event.type === 'attack.missed' && event.playerId === 'player-one',
      ),
    ).toBe(false);
  });

  it('clamps out-of-range stages to the [-6, +6] bounds', () => {
    const game = buildBattleWithRandomSequence([
      0.05, // Fire Punch hit check should land when stages are clamped
      0.5, // Fire Punch crit check
      0, // Fire Punch damage random factor
      0.1, // Nidoking Sludge Bomb hit check
      0.5, // Nidoking crit check
      0, // Nidoking damage random factor
    ]);
    selectDefaultParties(game);
    setActivePokemonStages(game, 'player-one', { accuracyStage: -99 });
    setActivePokemonStages(game, 'player-two', { evasionStage: 99 });

    const events = resolveAttackTurn(game, 'Fire Punch', 'Sludge Bomb');
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
          event.type === 'attack.missed' && event.playerId === 'player-one',
      ),
    ).toBe(false);
  });

  it('applies physical attack/defense stages to damage calculation', () => {
    const sequence = [
      0, // Charizard Strength hit check
      0.9, // Charizard crit check (fails)
      0, // Charizard damage random factor
      0.99, // Nidoking Sludge Bomb miss check
      0.5, // Nidoking crit check
      0, // Nidoking damage random factor
    ];

    const baselineGame = buildBattleWithRandomSequence(sequence);
    selectDefaultParties(baselineGame);
    const baselineDamage = getDamageAppliedEvent(
      resolveAttackTurn(baselineGame, 'Strength', 'Sludge Bomb'),
      'player-one',
    ).damage;

    const boostedAttackGame = buildBattleWithRandomSequence(sequence);
    selectDefaultParties(boostedAttackGame);
    setActivePokemonStages(boostedAttackGame, 'player-one', { attackStage: 2 });
    const boostedAttackDamage = getDamageAppliedEvent(
      resolveAttackTurn(boostedAttackGame, 'Strength', 'Sludge Bomb'),
      'player-one',
    ).damage;

    const boostedDefenseGame = buildBattleWithRandomSequence(sequence);
    selectDefaultParties(boostedDefenseGame);
    setActivePokemonStages(boostedDefenseGame, 'player-two', { defenseStage: 2 });
    const boostedDefenseDamage = getDamageAppliedEvent(
      resolveAttackTurn(boostedDefenseGame, 'Strength', 'Sludge Bomb'),
      'player-one',
    ).damage;

    expect(boostedAttackDamage).toBeGreaterThan(baselineDamage);
    expect(boostedDefenseDamage).toBeLessThan(baselineDamage);
  });

  it('applies special attack/special defense stages to damage calculation', () => {
    const sequence = [
      0, // Charizard Fire Punch hit check
      0.9, // Charizard crit check (fails)
      0, // Charizard damage random factor
      0.99, // Nidoking Sludge Bomb miss check
      0.5, // Nidoking crit check
      0, // Nidoking damage random factor
    ];

    const baselineGame = buildBattleWithRandomSequence(sequence);
    selectDefaultParties(baselineGame);
    const baselineDamage = getDamageAppliedEvent(
      resolveAttackTurn(baselineGame, 'Fire Punch', 'Sludge Bomb'),
      'player-one',
    ).damage;

    const boostedSpecialAttackGame = buildBattleWithRandomSequence(sequence);
    selectDefaultParties(boostedSpecialAttackGame);
    setActivePokemonStages(boostedSpecialAttackGame, 'player-one', {
      specialAttackStage: 2,
    });
    const boostedSpecialAttackDamage = getDamageAppliedEvent(
      resolveAttackTurn(boostedSpecialAttackGame, 'Fire Punch', 'Sludge Bomb'),
      'player-one',
    ).damage;

    const boostedSpecialDefenseGame = buildBattleWithRandomSequence(sequence);
    selectDefaultParties(boostedSpecialDefenseGame);
    setActivePokemonStages(boostedSpecialDefenseGame, 'player-two', {
      specialDefenseStage: 2,
    });
    const boostedSpecialDefenseDamage = getDamageAppliedEvent(
      resolveAttackTurn(boostedSpecialDefenseGame, 'Fire Punch', 'Sludge Bomb'),
      'player-one',
    ).damage;

    expect(boostedSpecialAttackDamage).toBeGreaterThan(baselineDamage);
    expect(boostedSpecialDefenseDamage).toBeLessThan(baselineDamage);
  });
});
