import { describe, expect, it } from 'bun:test';
import { Battle } from '../../index';

const PLAYER_ONE_ID = 'player-one';
const PLAYER_TWO_ID = 'player-two';

function buildBattleWithRandomSequence(sequence: number[]) {
  let randomIndex = 0;
  return new Battle({
    partySize: 3,
    players: [
      { id: PLAYER_ONE_ID, name: 'Player 1' },
      { id: PLAYER_TWO_ID, name: 'Player 2' },
    ],
    random: () => {
      const value = sequence[randomIndex];
      randomIndex += 1;
      return typeof value === 'number' ? value : 0;
    },
  });
}

function selectDefaultParties(game: Battle) {
  game.selectParty(PLAYER_ONE_ID, ['Charizard', 'Raichu', 'Nidoking']);
  game.selectParty(PLAYER_TWO_ID, ['Nidoking', 'Raichu', 'Charizard']);
}

function resolveAttackTurn(game: Battle, playerOneMove: string, playerTwoMove: string) {
  game.selectAction({
    playerID: PLAYER_ONE_ID,
    type: 'attack',
    payload: {
      attackName: playerOneMove,
    },
  });

  return game.selectAction({
    playerID: PLAYER_TWO_ID,
    type: 'attack',
    payload: {
      attackName: playerTwoMove,
    },
  });
}

function setActivePokemonStages(
  game: Battle,
  playerId: string,
  stages: {
    accuracyStage?: number;
    attackStage?: number;
    criticalStage?: number;
    defenseStage?: number;
    evasionStage?: number;
    specialAttackStage?: number;
    specialDefenseStage?: number;
  },
) {
  const partyModule = (game as unknown as {
    partyModule: {
      parties: Map<
        string,
        {
          active: () => {
            accuracyStage: number;
            attackStage: number;
            criticalStage: number;
            defenseStage: number;
            evasionStage: number;
            specialAttackStage: number;
            specialDefenseStage: number;
          };
        }
      >;
    };
  }).partyModule;

  const party = partyModule.parties.get(playerId);
  if (!party) {
    throw new Error(`Party for player '${playerId}' not found in test setup.`);
  }

  const activePokemon = party.active();
  if (typeof stages.accuracyStage === 'number') {
    activePokemon.accuracyStage = stages.accuracyStage;
  }
  if (typeof stages.attackStage === 'number') {
    activePokemon.attackStage = stages.attackStage;
  }
  if (typeof stages.criticalStage === 'number') {
    activePokemon.criticalStage = stages.criticalStage;
  }
  if (typeof stages.defenseStage === 'number') {
    activePokemon.defenseStage = stages.defenseStage;
  }
  if (typeof stages.evasionStage === 'number') {
    activePokemon.evasionStage = stages.evasionStage;
  }
  if (typeof stages.specialAttackStage === 'number') {
    activePokemon.specialAttackStage = stages.specialAttackStage;
  }
  if (typeof stages.specialDefenseStage === 'number') {
    activePokemon.specialDefenseStage = stages.specialDefenseStage;
  }
}

function getDamageAppliedEvent(
  events: ReturnType<Battle['selectAction']>,
  sourcePlayerId: string,
) {
  const damageEvent = events.find(
    (event) =>
      event.type === 'damage.applied' && event.sourcePlayerId === sourcePlayerId,
  );
  if (!damageEvent || damageEvent.type !== 'damage.applied') {
    throw new Error(
      `Expected a damage.applied event from source '${sourcePlayerId}'.`,
    );
  }

  return damageEvent;
}

describe('turn accuracy resolution', () => {
  it('exposes battle stages and removes accuracy from party state', () => {
    const game = buildBattleWithRandomSequence([]);
    selectDefaultParties(game);

    const state = game.getStateAsPlayer(PLAYER_ONE_ID) as {
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
          event.playerId === PLAYER_ONE_ID &&
          event.moveName === 'Rock Slide',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.moveName === 'Rock Slide',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.fainted' && event.playerId === PLAYER_TWO_ID,
      ),
    ).toBe(false);

    const state = game.getStateAsPlayer(PLAYER_ONE_ID) as {
      player: Array<{
        moves: Array<{ name: string; remaining: number }>;
      }>;
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
    setActivePokemonStages(lowAccuracyGame, PLAYER_ONE_ID, { accuracyStage: -6 });
    setActivePokemonStages(lowAccuracyGame, PLAYER_TWO_ID, { evasionStage: 6 });

    const missEvents = resolveAttackTurn(lowAccuracyGame, 'Fire Punch', 'Sludge Bomb');
    expect(
      missEvents.some(
        (event) =>
          event.type === 'attack.missed' && event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);

    const highAccuracyGame = buildBattleWithRandomSequence([
      0.99, // Fire Punch hit check at +6 accuracy vs -6 evasion (clamped to 100%)
      0.5, // Fire Punch crit check
      0, // Fire Punch damage random factor
      0.1, // Nidoking Sludge Bomb hit check
      0.5, // Nidoking crit check
      0, // Nidoking damage random factor
    ]);
    selectDefaultParties(highAccuracyGame);
    setActivePokemonStages(highAccuracyGame, PLAYER_ONE_ID, { accuracyStage: 6 });
    setActivePokemonStages(highAccuracyGame, PLAYER_TWO_ID, { evasionStage: -6 });

    const hitEvents = resolveAttackTurn(highAccuracyGame, 'Fire Punch', 'Sludge Bomb');
    expect(
      hitEvents.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(true);
    expect(
      hitEvents.some(
        (event) =>
          event.type === 'attack.missed' && event.playerId === PLAYER_ONE_ID,
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
    setActivePokemonStages(game, PLAYER_ONE_ID, { accuracyStage: -99 });
    setActivePokemonStages(game, PLAYER_TWO_ID, { evasionStage: 99 });

    const events = resolveAttackTurn(game, 'Fire Punch', 'Sludge Bomb');
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
          event.type === 'attack.missed' && event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
  });

  it('marks damage events with critical=false when crit check fails', () => {
    const game = buildBattleWithRandomSequence([
      0, // Charizard Strength hit check
      0.9, // Charizard crit check (fails at stage 0)
      0, // Charizard damage random factor
      0.99, // Nidoking Fire Blast miss check
    ]);
    selectDefaultParties(game);

    const events = resolveAttackTurn(game, 'Strength', 'Fire Blast');
    const damageEvent = getDamageAppliedEvent(events, PLAYER_ONE_ID);
    expect(damageEvent.critical).toBe(false);
  });

  it('marks damage events with critical=true and increases damage when crit lands', () => {
    const nonCritGame = buildBattleWithRandomSequence([
      0, // Charizard Strength hit check
      0.9, // Charizard crit check (fails)
      0, // Charizard damage random factor
      0.99, // Nidoking Fire Blast miss check
    ]);
    selectDefaultParties(nonCritGame);
    const nonCritEvents = resolveAttackTurn(nonCritGame, 'Strength', 'Fire Blast');
    const nonCritDamage = getDamageAppliedEvent(nonCritEvents, PLAYER_ONE_ID).damage;

    const critGame = buildBattleWithRandomSequence([
      0, // Charizard Strength hit check
      0, // Charizard crit check (lands)
      0, // Charizard damage random factor
      0.99, // Nidoking Fire Blast miss check
    ]);
    selectDefaultParties(critGame);
    const critEvents = resolveAttackTurn(critGame, 'Strength', 'Fire Blast');
    const critEvent = getDamageAppliedEvent(critEvents, PLAYER_ONE_ID);

    expect(critEvent.critical).toBe(true);
    expect(critEvent.damage).toBeGreaterThan(nonCritDamage);
  });

  it('applies physical attack/defense stages to damage calculation', () => {
    const baselineGame = buildBattleWithRandomSequence([
      0, // Charizard Strength hit check
      0.9, // Charizard crit check (fails)
      0, // Charizard damage random factor
      0.99, // Nidoking Fire Blast miss check
    ]);
    selectDefaultParties(baselineGame);
    const baselineDamage = getDamageAppliedEvent(
      resolveAttackTurn(baselineGame, 'Strength', 'Fire Blast'),
      PLAYER_ONE_ID,
    ).damage;

    const boostedAttackGame = buildBattleWithRandomSequence([
      0,
      0.9,
      0,
      0.99,
    ]);
    selectDefaultParties(boostedAttackGame);
    setActivePokemonStages(boostedAttackGame, PLAYER_ONE_ID, { attackStage: 2 });
    const boostedAttackDamage = getDamageAppliedEvent(
      resolveAttackTurn(boostedAttackGame, 'Strength', 'Fire Blast'),
      PLAYER_ONE_ID,
    ).damage;

    const boostedDefenseGame = buildBattleWithRandomSequence([
      0,
      0.9,
      0,
      0.99,
    ]);
    selectDefaultParties(boostedDefenseGame);
    setActivePokemonStages(boostedDefenseGame, PLAYER_TWO_ID, { defenseStage: 2 });
    const boostedDefenseDamage = getDamageAppliedEvent(
      resolveAttackTurn(boostedDefenseGame, 'Strength', 'Fire Blast'),
      PLAYER_ONE_ID,
    ).damage;

    expect(boostedAttackDamage).toBeGreaterThan(baselineDamage);
    expect(boostedDefenseDamage).toBeLessThan(baselineDamage);
  });

  it('applies special attack/special defense stages to damage calculation', () => {
    const baselineGame = buildBattleWithRandomSequence([
      0, // Charizard Fire Punch hit check
      0.9, // Charizard crit check (fails)
      0, // Charizard damage random factor
      0.99, // Nidoking Fire Blast miss check
    ]);
    selectDefaultParties(baselineGame);
    const baselineDamage = getDamageAppliedEvent(
      resolveAttackTurn(baselineGame, 'Fire Punch', 'Fire Blast'),
      PLAYER_ONE_ID,
    ).damage;

    const boostedSpecialAttackGame = buildBattleWithRandomSequence([
      0,
      0.9,
      0,
      0.99,
    ]);
    selectDefaultParties(boostedSpecialAttackGame);
    setActivePokemonStages(boostedSpecialAttackGame, PLAYER_ONE_ID, {
      specialAttackStage: 2,
    });
    const boostedSpecialAttackDamage = getDamageAppliedEvent(
      resolveAttackTurn(boostedSpecialAttackGame, 'Fire Punch', 'Fire Blast'),
      PLAYER_ONE_ID,
    ).damage;

    const boostedSpecialDefenseGame = buildBattleWithRandomSequence([
      0,
      0.9,
      0,
      0.99,
    ]);
    selectDefaultParties(boostedSpecialDefenseGame);
    setActivePokemonStages(boostedSpecialDefenseGame, PLAYER_TWO_ID, {
      specialDefenseStage: 2,
    });
    const boostedSpecialDefenseDamage = getDamageAppliedEvent(
      resolveAttackTurn(boostedSpecialDefenseGame, 'Fire Punch', 'Fire Blast'),
      PLAYER_ONE_ID,
    ).damage;

    expect(boostedSpecialAttackDamage).toBeGreaterThan(baselineDamage);
    expect(boostedSpecialDefenseDamage).toBeLessThan(baselineDamage);
  });

  it('does not ignore stat stages on critical hits', () => {
    const unstagedNonCritGame = buildBattleWithRandomSequence([
      0, // Charizard Strength hit check
      0.9, // Charizard crit check (fails)
      0, // Charizard damage random factor
      0.99, // Nidoking Fire Blast miss check
    ]);
    selectDefaultParties(unstagedNonCritGame);
    const unstagedNonCritDamage = getDamageAppliedEvent(
      resolveAttackTurn(unstagedNonCritGame, 'Strength', 'Fire Blast'),
      PLAYER_ONE_ID,
    ).damage;

    const stagedNonCritGame = buildBattleWithRandomSequence([
      0,
      0.9,
      0,
      0.99,
    ]);
    selectDefaultParties(stagedNonCritGame);
    setActivePokemonStages(stagedNonCritGame, PLAYER_ONE_ID, { attackStage: -6 });
    setActivePokemonStages(stagedNonCritGame, PLAYER_TWO_ID, { defenseStage: 6 });
    const stagedNonCritDamage = getDamageAppliedEvent(
      resolveAttackTurn(stagedNonCritGame, 'Strength', 'Fire Blast'),
      PLAYER_ONE_ID,
    ).damage;

    const stagedCritGame = buildBattleWithRandomSequence([
      0,
      0, // Charizard crit check (lands)
      0,
      0.99,
    ]);
    selectDefaultParties(stagedCritGame);
    setActivePokemonStages(stagedCritGame, PLAYER_ONE_ID, { attackStage: -6 });
    setActivePokemonStages(stagedCritGame, PLAYER_TWO_ID, { defenseStage: 6 });
    const stagedCritDamageEvent = getDamageAppliedEvent(
      resolveAttackTurn(stagedCritGame, 'Strength', 'Fire Blast'),
      PLAYER_ONE_ID,
    );

    expect(stagedCritDamageEvent.critical).toBe(true);
    expect(stagedCritDamageEvent.damage).toBeGreaterThan(stagedNonCritDamage);
    expect(stagedCritDamageEvent.damage).toBeLessThan(unstagedNonCritDamage);
  });
});
