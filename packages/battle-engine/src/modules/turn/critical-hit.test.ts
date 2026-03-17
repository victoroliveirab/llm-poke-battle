import { describe, expect, it } from 'bun:test';
import {
  buildBattleWithRandomSequence,
  getDamageAppliedEvent,
  resolveAttackTurn,
  selectDefaultParties,
  setActivePokemonStages,
} from './test/turn-test-utils';

describe('turn critical hit resolution', () => {
  it('marks damage events with critical=false when crit check fails', () => {
    const game = buildBattleWithRandomSequence([
      0, // Charizard Strength hit check
      0.9, // Charizard crit check (fails at stage 0)
      0, // Charizard damage random factor
      0.99, // Nidoking Sludge Bomb miss check
    ]);
    selectDefaultParties(game);

    const events = resolveAttackTurn(game, 'Strength', 'Sludge Bomb');
    const damageEvent = getDamageAppliedEvent(events, 'player-one');
    expect(damageEvent.critical).toBe(false);
  });

  it('marks damage events with critical=true and increases damage when crit lands', () => {
    const nonCritGame = buildBattleWithRandomSequence([
      0, // Charizard Strength hit check
      0.9, // Charizard crit check (fails)
      0, // Charizard damage random factor
      0.99, // Nidoking Sludge Bomb miss check
    ]);
    selectDefaultParties(nonCritGame);
    const nonCritEvents = resolveAttackTurn(nonCritGame, 'Strength', 'Sludge Bomb');
    const nonCritDamage = getDamageAppliedEvent(nonCritEvents, 'player-one').damage;

    const critGame = buildBattleWithRandomSequence([
      0, // Charizard Strength hit check
      0, // Charizard crit check (lands)
      0, // Charizard damage random factor
      0.99, // Nidoking Sludge Bomb miss check
    ]);
    selectDefaultParties(critGame);
    const critEvents = resolveAttackTurn(critGame, 'Strength', 'Sludge Bomb');
    const critEvent = getDamageAppliedEvent(critEvents, 'player-one');

    expect(critEvent.critical).toBe(true);
    expect(critEvent.damage).toBeGreaterThan(nonCritDamage);
  });

  it('does not ignore stat stages on critical hits', () => {
    const unstagedNonCritGame = buildBattleWithRandomSequence([
      0, // Charizard Strength hit check
      0.9, // Charizard crit check (fails)
      0, // Charizard damage random factor
      0.99, // Nidoking Sludge Bomb miss check
    ]);
    selectDefaultParties(unstagedNonCritGame);
    const unstagedNonCritDamage = getDamageAppliedEvent(
      resolveAttackTurn(unstagedNonCritGame, 'Strength', 'Sludge Bomb'),
      'player-one',
    ).damage;

    const stagedNonCritGame = buildBattleWithRandomSequence([
      0,
      0.9,
      0,
      0.99, // Nidoking Sludge Bomb miss check
    ]);
    selectDefaultParties(stagedNonCritGame);
    setActivePokemonStages(stagedNonCritGame, 'player-one', { attackStage: -6 });
    setActivePokemonStages(stagedNonCritGame, 'player-two', { defenseStage: 6 });
    const stagedNonCritDamage = getDamageAppliedEvent(
      resolveAttackTurn(stagedNonCritGame, 'Strength', 'Sludge Bomb'),
      'player-one',
    ).damage;

    const stagedCritGame = buildBattleWithRandomSequence([
      0,
      0, // Charizard crit check (lands)
      0,
      0.99, // Nidoking Sludge Bomb miss check
    ]);
    selectDefaultParties(stagedCritGame);
    setActivePokemonStages(stagedCritGame, 'player-one', { attackStage: -6 });
    setActivePokemonStages(stagedCritGame, 'player-two', { defenseStage: 6 });
    const stagedCritDamageEvent = getDamageAppliedEvent(
      resolveAttackTurn(stagedCritGame, 'Strength', 'Sludge Bomb'),
      'player-one',
    );

    expect(stagedCritDamageEvent.critical).toBe(true);
    expect(stagedCritDamageEvent.damage).toBeGreaterThan(stagedNonCritDamage);
    expect(stagedCritDamageEvent.damage).toBeLessThan(unstagedNonCritDamage);
  });
});
