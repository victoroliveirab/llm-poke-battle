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
    evasionStage?: number;
  },
) {
  const partyModule = (game as unknown as {
    partyModule: {
      parties: Map<
        string,
        {
          active: () => {
            accuracyStage: number;
            evasionStage: number;
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
  if (typeof stages.evasionStage === 'number') {
    activePokemon.evasionStage = stages.evasionStage;
  }
}

describe('turn accuracy resolution', () => {
  it('exposes accuracyStage/evasionStage and removes accuracy from party state', () => {
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
    expect('defenseStage' in activePokemon).toBe(true);
    expect('evasionStage' in activePokemon).toBe(true);
    expect('specialAttackStage' in activePokemon).toBe(true);
    expect('specialDefenseStage' in activePokemon).toBe(true);
    expect('accuracy' in activePokemon).toBe(false);
    expect(activePokemon.attackStage).toBe(0);
    expect(activePokemon.defenseStage).toBe(0);
    expect(activePokemon.specialAttackStage).toBe(0);
    expect(activePokemon.specialDefenseStage).toBe(0);
  });

  it('consumes PP and emits attack.missed without applying damage on miss', () => {
    const game = buildBattleWithRandomSequence([
      0.95, // Charizard Rock Slide miss check (90% accuracy)
      0.1, // Nidoking Sludge Bomb hit check
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
      0, // Fire Punch damage random factor
      0.1, // Nidoking Sludge Bomb hit check
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
      0, // Fire Punch damage random factor
      0.1, // Nidoking Sludge Bomb hit check
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
});
