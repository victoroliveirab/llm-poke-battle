import { describe, expect, it } from 'bun:test';
import { GameContext } from '../../engine/context';
import { Party } from '../party/party';
import { PartyModule } from '../party';
import { createBattleFixture } from './test/builders/battle-fixture';

describe('turn battle integration', () => {
  it('exposes battle stages and removes accuracy from public party state', () => {
    const fixture = createBattleFixture();
    fixture.selectParties(
      ['Charizard', 'Raichu', 'Nidoking'],
      ['Nidoking', 'Raichu', 'Charizard'],
    );

    const state = fixture.game.getStateAsPlayer('player-one') as {
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
  });

  it('resolves a full turn through the public Battle API', () => {
    const fixture = createBattleFixture({
      randomSequence: [
        0.95, // Charizard Rock Slide miss check (90% accuracy)
        0.1, // Nidoking Sludge Bomb hit check
        0.5, // Nidoking crit check
        0, // Nidoking damage random factor
      ],
    });
    fixture.selectParties(
      ['Charizard', 'Raichu', 'Nidoking'],
      ['Nidoking', 'Raichu', 'Charizard'],
    );

    const events = fixture.resolveAttackTurn('Rock Slide', 'Sludge Bomb');

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

    const state = fixture.game.getStateAsPlayer('player-one') as {
      player: Array<{ moves: Array<{ name: string; remaining: number }> }>;
    };
    const rockSlide = state.player[0]?.moves.find((move) => move.name === 'Rock Slide');
    expect(rockSlide?.remaining).toBe(9);
  });

  it('supports custom species definitions through the public Battle API', () => {
    const fixture = createBattleFixture({
      partySize: 1,
      availablePokemon: [
        {
          species: 'Nidoking',
          stats: {
            attack: 70,
            defense: 80,
            specialAttack: 95,
            specialDefense: 90,
            speed: 100,
            hp: 90,
          },
          type1: 'poison',
          type2: null,
          moves: ['toxic', 'growl'],
        },
        {
          species: 'Snorlax',
          stats: {
            attack: 88,
            defense: 82,
            specialAttack: 75,
            specialDefense: 78,
            speed: 70,
            hp: 95,
          },
          type1: 'normal',
          type2: null,
          moves: ['growl', 'strength'],
        },
      ],
      randomSequence: [
        0, // Toxic accuracy
        0, // Toxic status chance
        0, // Growl accuracy
      ],
    });
    fixture.selectParties(['Nidoking'], ['Snorlax']);

    const events = fixture.resolveAttackTurn('Toxic', 'Growl');

    expect(
      events.some(
        (event) =>
          event.type === 'pokemon.major_status_changed' &&
          event.playerId === 'player-two' &&
          event.status.kind === 'badly-poisoned' &&
          event.status.turnsElapsed === 1 &&
          event.moveName === 'Toxic',
      ),
    ).toBe(true);

    const state = fixture.game.getStateAsPlayer('player-two') as {
      player: Array<Record<string, unknown>>;
    };
    const activePokemon = state.player[0];
    if (!activePokemon) {
      throw new Error('Expected an active Pokemon in player state.');
    }

    expect(activePokemon.name).toBe('Snorlax');
    expect(activePokemon.majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 2,
    });
  });

  it('exposes gender to the owner and only for revealed opponent Pokemon', () => {
    const fixture = createBattleFixture({
      partyCreationRandomSequence: [
        0.9, // player one Charizard -> female
        0.2, // player one Raichu -> male
        0.4, // player one Nidoking -> male
        0.3, // player two Nidoking -> male
        0.8, // player two Raichu -> female
        0.1, // player two Charizard -> male
      ],
    });
    fixture.selectParties(
      ['Charizard', 'Raichu', 'Nidoking'],
      ['Nidoking', 'Raichu', 'Charizard'],
    );

    const playerState = fixture.game.getStateAsPlayer('player-one') as {
      player: Array<Record<string, unknown>>;
      opponent: Array<Record<string, unknown>>;
    };
    const playerActivePokemon = playerState.player[0];
    const opponentActivePokemon = playerState.opponent[0];
    const opponentBenchPokemon = playerState.opponent[1];
    if (!playerActivePokemon || !opponentActivePokemon || !opponentBenchPokemon) {
      throw new Error('Expected player and opponent party state.');
    }

    expect(playerActivePokemon.gender).toBe('female');
    expect(playerState.player[1]?.gender).toBe('male');
    expect(opponentActivePokemon.gender).toBe('male');
    expect(opponentBenchPokemon.gender).toBeNull();
  });

  it('exposes genderless for visible Magnezone', () => {
    const fixture = createBattleFixture();
    fixture.selectParties(
      ['Magnezone', 'Raichu', 'Nidoking'],
      ['Magnezone', 'Raichu', 'Charizard'],
    );

    const playerState = fixture.game.getStateAsPlayer('player-one') as {
      player: Array<Record<string, unknown>>;
      opponent: Array<Record<string, unknown>>;
    };
    const playerActivePokemon = playerState.player[0];
    const opponentActivePokemon = playerState.opponent[0];
    const opponentBenchPokemon = playerState.opponent[1];
    if (!playerActivePokemon || !opponentActivePokemon || !opponentBenchPokemon) {
      throw new Error('Expected player and opponent party state.');
    }

    expect(playerActivePokemon.gender).toBe('genderless');
    expect(opponentActivePokemon.gender).toBe('genderless');
    expect(opponentBenchPokemon.gender).toBeNull();
  });

  it('exposes major and volatile statuses through public player state', () => {
    const fixture = createBattleFixture();
    fixture.selectParties(
      ['Charizard', 'Raichu', 'Nidoking'],
      ['Nidoking', 'Raichu', 'Charizard'],
    );

    const internals = fixture.game as unknown as {
      context: GameContext;
      partyModule: PartyModule;
    };

    internals.partyModule.onEvent(
      {
        type: 'pokemon.major_status_changed',
        playerId: 'player-one',
        pokemonName: 'Charizard',
        status: {
          kind: 'paralysis',
        },
        active: true,
        sourcePlayerId: 'player-two',
        moveName: 'Stun Spore',
      },
      internals.context,
    );
    internals.partyModule.onEvent(
      {
        type: 'pokemon.volatile_status_changed',
        playerId: 'player-one',
        pokemonName: 'Charizard',
        status: {
          kind: 'confusion',
          turnsRemaining: 2,
        },
        active: true,
        sourcePlayerId: 'player-two',
        moveName: 'Supersonic',
      },
      internals.context,
    );

    const state = fixture.game.getStateAsPlayer('player-one') as {
      player: Array<Record<string, unknown>>;
    };
    const activePokemon = state.player[0];
    if (!activePokemon) {
      throw new Error('Expected an active Pokemon in player state.');
    }

    expect(activePokemon.majorStatus).toEqual({ kind: 'paralysis' });
    expect(activePokemon.volatileStatuses).toEqual([
      { kind: 'confusion' },
    ]);
  });

  it('exposes poison through public player state', () => {
    const fixture = createBattleFixture({
      randomSequence: [
        0, // Player 1 accuracy check
        0.9, // Player 1 crit check
        0.5, // Player 1 damage random factor
        0.05, // Player 1 poison chance
        0.99, // Player 2 Sleep Powder miss check
      ],
    });
    fixture.selectParties(
      ['Nidoking', 'Fearow', 'Charizard'],
      ['Exeggutor', 'Fearow', 'Charizard'],
    );

    fixture.resolveAttackTurn('Sludge Bomb', 'Sleep Powder');

    const state = fixture.game.getStateAsPlayer('player-two') as {
      player: Array<Record<string, unknown>>;
    };
    const activePokemon = state.player[0];
    if (!activePokemon) {
      throw new Error('Expected an active Pokemon in player state.');
    }

    expect(activePokemon.majorStatus).toEqual({ kind: 'poison' });
  });

  it('exposes badly poisoned through public player state', () => {
    const fixture = createBattleFixture();
    fixture.selectParties(
      ['Charizard', 'Raichu', 'Nidoking'],
      ['Nidoking', 'Raichu', 'Charizard'],
    );

    const internals = fixture.game as unknown as {
      context: GameContext;
      partyModule: PartyModule;
    };

    internals.partyModule.onEvent(
      {
        type: 'pokemon.major_status_changed',
        playerId: 'player-one',
        pokemonName: 'Charizard',
        status: {
          kind: 'badly-poisoned',
          turnsElapsed: 1,
        },
        active: true,
        sourcePlayerId: 'player-two',
        moveName: 'Toxic',
      },
      internals.context,
    );

    const state = fixture.game.getStateAsPlayer('player-one') as {
      player: Array<Record<string, unknown>>;
    };
    const activePokemon = state.player[0];
    if (!activePokemon) {
      throw new Error('Expected an active Pokemon in player state.');
    }

    expect(activePokemon.majorStatus).toEqual({
      kind: 'badly-poisoned',
      turnsElapsed: 1,
    });
  });

  it('keeps confusion duration in sync through the public Battle API after a turn resolves', () => {
    const fixture = createBattleFixture({
      randomSequence: [
        0.34, // Player 1 confusion self-hit fails
        0, // Player 1 accuracy check
        0.9, // Player 1 crit check
        0.5, // Player 1 damage random factor
        0.5, // Player 2 accuracy check
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.selectParties(
      ['Charizard', 'Raichu', 'Nidoking'],
      ['Exeggutor', 'Fearow', 'Charizard'],
    );

    const internals = fixture.game as unknown as {
      context: GameContext;
      partyModule: PartyModule;
    };

    internals.partyModule.onEvent(
      {
        type: 'pokemon.volatile_status_changed',
        playerId: 'player-one',
        pokemonName: 'Charizard',
        status: {
          kind: 'confusion',
          turnsRemaining: 2,
        },
        active: true,
        sourcePlayerId: 'player-two',
        moveName: 'Confuse Ray',
      },
      internals.context,
    );

    fixture.resolveAttackTurn('Strength', 'Sludge Bomb');

    const state = fixture.game.getStateAsPlayer('player-one') as {
      player: Array<Record<string, unknown>>;
    };
    const activePokemon = state.player[0];
    if (!activePokemon) {
      throw new Error('Expected an active Pokemon in player state.');
    }

    expect(activePokemon.volatileStatuses).toEqual([
      { kind: 'confusion' },
    ]);
  });

  it('resumes an interrupted turn after a replacement switch and targets the replacement', () => {
    const fixture = createBattleFixture({
      randomSequence: [
        0.2, // Player 1 confusion self-hit succeeds
        0, // Player 1 confusion damage random factor
        0.5, // Player 2 accuracy check after replacement
        0.9, // Player 2 crit check
        0, // Player 2 damage random factor
      ],
    });
    fixture.selectParties(
      ['Charizard', 'Raichu', 'Nidoking'],
      ['Exeggutor', 'Fearow', 'Charizard'],
    );

    const internals = fixture.game as unknown as {
      context: GameContext;
      partyModule: unknown;
    };
    const partyModuleInternals = internals.partyModule as {
      parties: Map<string, Party>;
    };
    const playerOneParty = partyModuleInternals.parties.get('player-one');
    const playerOneCharizard = playerOneParty?.getPokemonByName('Charizard');
    if (!playerOneParty || !playerOneCharizard) {
      throw new Error('Expected direct access to player one party internals.');
    }
    playerOneCharizard.health = 1;
    playerOneCharizard.volatileStatuses = [
      { kind: 'confusion', turnsRemaining: 2 },
    ];

    fixture.game.selectAction({
      playerID: 'player-one',
      type: 'attack',
      payload: {
        attackName: 'Strength',
      },
    });
    const interruptedEvents = fixture.game.selectAction({
      playerID: 'player-two',
      type: 'attack',
      payload: {
        attackName: 'Sludge Bomb',
      },
    });

    expect(
      interruptedEvents.some(
        (event) => event.type === 'pokemon.fainted' && event.playerId === 'player-one',
      ),
    ).toBe(true);
    expect(
      interruptedEvents.some((event) => event.type === 'turn.resolved'),
    ).toBe(false);
    expect(fixture.game.getStateAsPlayer('player-one').turn).toBe(1);

    const resumedEvents = fixture.game.selectAction({
      playerID: 'player-one',
      type: 'switch',
      payload: {
        newPokemon: 'Raichu',
      },
    });

    expect(
      resumedEvents.some(
        (event) =>
          event.type === 'pokemon.switched' &&
          event.playerId === 'player-one' &&
          event.pokemonName === 'Raichu',
      ),
    ).toBe(true);
    expect(
      resumedEvents.some(
        (event) =>
          event.type === 'damage.applied' &&
          event.sourcePlayerId === 'player-two' &&
          event.pokemonName === 'Raichu',
      ),
    ).toBe(true);
    expect(
      resumedEvents.some((event) => event.type === 'turn.resolved'),
    ).toBe(true);
    expect(fixture.game.getStateAsPlayer('player-one').turn).toBe(2);
  });
});
