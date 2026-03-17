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

function selectFearowParties(game: Battle) {
  game.selectParty(PLAYER_ONE_ID, ['Fearow', 'Raichu', 'Charizard']);
  game.selectParty(PLAYER_TWO_ID, ['Nidoking', 'Raichu', 'Charizard']);
}

function selectNidokingParties(game: Battle) {
  game.selectParty(PLAYER_ONE_ID, ['Nidoking', 'Charizard', 'Raichu']);
  game.selectParty(PLAYER_TWO_ID, ['Exeggutor', 'Charizard', 'Raichu']);
}

function selectCharizardParties(game: Battle) {
  game.selectParty(PLAYER_ONE_ID, ['Charizard', 'Nidoking', 'Raichu']);
  game.selectParty(PLAYER_TWO_ID, ['Nidoking', 'Exeggutor', 'Raichu']);
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

function setActivePokemonParalysis(
  game: Battle,
  playerId: string,
  isParalyzed: boolean,
) {
  const partyModule = (game as unknown as {
    partyModule: {
      parties: Map<
        string,
        {
          active: () => {
            isParalyzed: boolean;
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
  activePokemon.isParalyzed = isParalyzed;
}

function setActivePokemonHealth(game: Battle, playerId: string, health: number) {
  const partyModule = (game as unknown as {
    partyModule: {
      parties: Map<
        string,
        {
          active: () => {
            health: number;
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
  activePokemon.health = health;
}

function isActivePokemonParalyzed(game: Battle, playerId: string) {
  const partyModule = (game as unknown as {
    partyModule: {
      parties: Map<
        string,
        {
          active: () => {
            isParalyzed: boolean;
          };
        }
      >;
    };
  }).partyModule;

  const party = partyModule.parties.get(playerId);
  if (!party) {
    throw new Error(`Party for player '${playerId}' not found in test setup.`);
  }

  return party.active().isParalyzed;
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

  it('applies Sand Attack on hit and lowers opponent accuracy by one stage', () => {
    const game = buildBattleWithRandomSequence([
      0, // Fearow Sand Attack hit check
      0.99, // Nidoking Fire Blast miss check after accuracy drop
    ]);
    selectFearowParties(game);

    const events = resolveAttackTurn(game, 'Sand Attack', 'Fire Blast');
    expect(
      events.some(
        (event) =>
          event.type === 'battle.stat_stage_changed' &&
          event.playerId === PLAYER_TWO_ID &&
          event.sourcePlayerId === PLAYER_ONE_ID &&
          event.moveName === 'Sand Attack' &&
          event.stat === 'accuracy' &&
          event.delta === -1 &&
          event.resultingStage === -1,
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_ONE_ID &&
          event.moveName === 'Sand Attack',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.moveName === 'Sand Attack',
      ),
    ).toBe(false);

    const defenderState = game.getStateAsPlayer(PLAYER_TWO_ID) as {
      player: Array<{ name: string; accuracyStage: number }>;
    };
    expect(defenderState.player[0]?.name).toBe('Nidoking');
    expect(defenderState.player[0]?.accuracyStage).toBe(-1);
  });

  it('treats Sand Attack as miss when target accuracy stage is already at minimum', () => {
    const game = buildBattleWithRandomSequence([
      0, // Fearow Sand Attack hit check
      0.99, // Nidoking Fire Blast miss check
    ]);
    selectFearowParties(game);
    setActivePokemonStages(game, PLAYER_TWO_ID, { accuracyStage: -6 });

    const events = resolveAttackTurn(game, 'Sand Attack', 'Fire Blast');
    expect(
      events.some(
        (event) =>
          event.type === 'attack.missed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.moveName === 'Sand Attack',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'battle.stat_stage_changed' &&
          event.sourcePlayerId === PLAYER_ONE_ID &&
          event.moveName === 'Sand Attack',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_ONE_ID &&
          event.moveName === 'Sand Attack',
      ),
    ).toBe(false);

    const defenderState = game.getStateAsPlayer(PLAYER_TWO_ID) as {
      player: Array<{ name: string; accuracyStage: number }>;
    };
    expect(defenderState.player[0]?.name).toBe('Nidoking');
    expect(defenderState.player[0]?.accuracyStage).toBe(-6);
  });

  it('resets all battle stages to zero when a Pokemon switches to the bench', () => {
    const game = buildBattleWithRandomSequence([
      0.99, // Nidoking Fire Blast miss check against switched-in Raichu
    ]);
    selectDefaultParties(game);

    setActivePokemonStages(game, PLAYER_ONE_ID, {
      accuracyStage: -2,
      attackStage: 3,
      criticalStage: 2,
      defenseStage: -3,
      evasionStage: 4,
      specialAttackStage: -1,
      specialDefenseStage: 5,
    });

    game.selectAction({
      playerID: PLAYER_ONE_ID,
      type: 'switch',
      payload: {
        newPokemon: 'Raichu',
      },
    });
    game.selectAction({
      playerID: PLAYER_TWO_ID,
      type: 'attack',
      payload: {
        attackName: 'Fire Blast',
      },
    });

    const playerState = game.getStateAsPlayer(PLAYER_ONE_ID) as {
      player: Array<{
        name: string;
        accuracyStage: number;
        attackStage: number;
        criticalStage: number;
        defenseStage: number;
        evasionStage: number;
        specialAttackStage: number;
        specialDefenseStage: number;
      }>;
    };
    const benchedCharizard = playerState.player.find(
      (pokemon) => pokemon.name === 'Charizard',
    );
    if (!benchedCharizard) {
      throw new Error('Expected Charizard to be present in player party.');
    }

    expect(benchedCharizard.accuracyStage).toBe(0);
    expect(benchedCharizard.attackStage).toBe(0);
    expect(benchedCharizard.criticalStage).toBe(0);
    expect(benchedCharizard.defenseStage).toBe(0);
    expect(benchedCharizard.evasionStage).toBe(0);
    expect(benchedCharizard.specialAttackStage).toBe(0);
    expect(benchedCharizard.specialDefenseStage).toBe(0);
  });

  it('paralyzes the foe when Stun Spore lands', () => {
    const game = buildBattleWithRandomSequence([
      0.1, // Nidoking move lands
      0.1, // Exeggutor Stun Spore lands
      0.1, // Stun Spore status check succeeds
      0.99, // Exeggutor should miss if it runs at all
    ]);
    selectNidokingParties(game);

    const speciesModule = (game as unknown as {
      speciesModule: {
        bySpecies: Map<string, { moves: Array<{ name: string; accuracy: number }> }>;
      };
    }).speciesModule;
    const exeggutor = speciesModule.bySpecies.get('Exeggutor');
    const psychic = exeggutor?.moves.find((move) => move.name === 'Psychic');
    if (!psychic) {
      throw new Error('Expected Exeggutor Psychic move in species catalog.');
    }
    psychic.accuracy = 0;

    const events = resolveAttackTurn(game, 'Earthquake', 'Stun Spore');
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.status_changed' &&
          event.playerId === PLAYER_TWO_ID &&
          event.pokemonName === 'Exeggutor' &&
          event.status === 'paralysis' &&
          event.moveName === 'Stun Spore' &&
          event.active === true,
      ),
    ).toBe(true);
    expect(isActivePokemonParalyzed(game, PLAYER_TWO_ID)).toBe(true);
  });

  it('paralyzes the foe when Body Slam lands', () => {
    const game = buildBattleWithRandomSequence([
      0.1, // Body Slam lands
      0.2, // Body Slam paralysis check succeeds
      0.99, // Exeggutor Psychic misses if it runs at all
    ]);
    selectNidokingParties(game);

    const speciesModule = (game as unknown as {
      speciesModule: {
        bySpecies: Map<string, { moves: Array<{ name: string; accuracy: number }> }>;
      };
    }).speciesModule;
    const exeggutor = speciesModule.bySpecies.get('Exeggutor');
    const psychic = exeggutor?.moves.find((move) => move.name === 'Psychic');
    if (!psychic) {
      throw new Error('Expected Exeggutor Psychic move in species catalog.');
    }
    psychic.accuracy = 0;

    const events = resolveAttackTurn(game, 'Body Slam', 'Psychic');
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.status_changed' &&
          event.playerId === PLAYER_TWO_ID &&
          event.pokemonName === 'Exeggutor' &&
          event.status === 'paralysis' &&
          event.moveName === 'Body Slam' &&
          event.active === true,
      ),
    ).toBe(true);
  });

  it('does not reapply status when Stun Spore lands on an already-paralyzed target', () => {
    const game = buildBattleWithRandomSequence([
      0.1, // Nidoking Earthquake lands
      0.5, // Nidoking crit check
      0.9, // Nidoking damage random factor
      0.2, // Exeggutor Stun Spore lands
    ]);
    selectNidokingParties(game);
    setActivePokemonParalysis(game, PLAYER_ONE_ID, true);

    const events = resolveAttackTurn(game, 'Earthquake', 'Stun Spore');
    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === PLAYER_TWO_ID &&
          event.targetPokemonName === 'Nidoking' &&
          event.status === 'paralysis' &&
          event.moveName === 'Stun Spore',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.status_changed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.pokemonName === 'Nidoking',
      ),
    ).toBe(false);
  });

  it('still applies Body Slam damage when the target is already paralyzed and skips status roll', () => {
    const game = buildBattleWithRandomSequence([
      0.1, // Body Slam lands
      0.2, // Body Slam crit check
      0.9, // Body Slam damage random factor
      0.99, // Exeggutor Psychic misses if it runs at all
    ]);
    selectNidokingParties(game);
    setActivePokemonParalysis(game, PLAYER_TWO_ID, true);

    const speciesModule = (game as unknown as {
      speciesModule: {
        bySpecies: Map<string, { moves: Array<{ name: string; accuracy: number }> }>;
      };
    }).speciesModule;
    const exeggutor = speciesModule.bySpecies.get('Exeggutor');
    const psychic = exeggutor?.moves.find((move) => move.name === 'Psychic');
    if (!psychic) {
      throw new Error('Expected Exeggutor Psychic move in species catalog.');
    }
    psychic.accuracy = 0;

    const events = resolveAttackTurn(game, 'Body Slam', 'Psychic');
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === PLAYER_ONE_ID &&
          event.moveName === 'Body Slam',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.status_changed' &&
          event.playerId === PLAYER_TWO_ID &&
          event.pokemonName === 'Exeggutor' &&
          event.status === 'paralysis' &&
          event.moveName === 'Body Slam',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'attack.already_affected' &&
          event.playerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
  });

  it('does not execute a move from a paralyzed Pokemon when fully paralyzed', () => {
    const game = buildBattleWithRandomSequence([
      0.1, // Nidoking move misses due status check
      0.99, // Exeggutor should run and miss if it runs at all
    ]);
    selectNidokingParties(game);
    setActivePokemonParalysis(game, PLAYER_ONE_ID, true);

    const speciesModule = (game as unknown as {
      speciesModule: {
        bySpecies: Map<string, { moves: Array<{ name: string; accuracy: number }> }>;
      };
    }).speciesModule;
    const exeggutor = speciesModule.bySpecies.get('Exeggutor');
    const psychic = exeggutor?.moves.find((move) => move.name === 'Psychic');
    if (!psychic) {
      throw new Error('Expected Exeggutor Psychic move in species catalog.');
    }
    psychic.accuracy = 0;

    const events = resolveAttackTurn(game, 'Earthquake', 'Psychic');
    expect(
      events.some(
        (event) =>
          event.type === 'attack.paralyzed' &&
          event.playerId === PLAYER_ONE_ID &&
          event.moveName === 'Earthquake' &&
          event.targetPokemonName === 'Exeggutor',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'damage.applied' && event.sourcePlayerId === PLAYER_ONE_ID,
      ),
    ).toBe(false);
  });

  it('does not apply paralysis when the target faints', () => {
    const game = buildBattleWithRandomSequence([
      0.1, // Body Slam lands
      0.1, // Body Slam paralysis check would succeed
    ]);
    selectNidokingParties(game);
    setActivePokemonHealth(game, PLAYER_TWO_ID, 1);

    const events = resolveAttackTurn(game, 'Body Slam', 'Psychic');
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.fainted' &&
          event.playerId === PLAYER_TWO_ID &&
          event.pokemonName === 'Exeggutor',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.status_changed' &&
          event.playerId === PLAYER_TWO_ID &&
          event.pokemonName === 'Exeggutor',
      ),
    ).toBe(false);
  });

  it('uses reduced speed for paralyzed Pokemon when resolving turn order', () => {
    const game = buildBattleWithRandomSequence([
      0.1, // Nidoking hit check
      0.5, // Nidoking crit check
      0.9, // Nidoking damage variation
      0.1, // Charizard hit check
      0.5, // Charizard crit check
      0.9, // Charizard damage variation
    ]);
    selectCharizardParties(game);
    setActivePokemonParalysis(game, PLAYER_ONE_ID, true);

    const events = resolveAttackTurn(game, 'Fire Punch', 'Sludge Bomb');
    const nidokingActionIndex = events.findIndex(
      (event) => event.type === 'move.consumed' && event.playerId === PLAYER_TWO_ID,
    );
    const charizardActionIndex = events.findIndex(
      (event) => event.type === 'move.consumed' && event.playerId === PLAYER_ONE_ID,
    );

    expect(nidokingActionIndex).toBeGreaterThan(-1);
    expect(charizardActionIndex).toBeGreaterThan(-1);
    expect(nidokingActionIndex).toBeLessThan(charizardActionIndex);
  });
});
