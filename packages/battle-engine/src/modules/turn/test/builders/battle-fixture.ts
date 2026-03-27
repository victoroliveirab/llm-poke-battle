import { Battle } from '../../../../index';
import {
  createTestSpeciesLoader,
  createTestSpeciesLookup,
  getSpecies,
  PLAYER_ONE_ID,
  PLAYER_TWO_ID,
  TestPokemonInput,
} from './shared';

type BattleFixtureParams = {
  partySize?: number;
  partyCreationRandomSequence?: number[];
  randomSequence?: number[];
  availablePokemon?: TestPokemonInput[];
};

export function createBattleFixture(params: BattleFixtureParams = {}) {
  const sequence = [...(params.randomSequence ?? [])];
  const speciesLookup = params.availablePokemon
    ? createTestSpeciesLookup(params.availablePokemon)
    : null;
  const random = (() => {
    let randomIndex = 0;

    return () => {
      const value = sequence[randomIndex];
      randomIndex += 1;
      return typeof value === 'number' ? value : 0;
    };
  })();

  const game = new Battle({
    partySize: params.partySize ?? 3,
    players: [
      { id: PLAYER_ONE_ID, name: 'Player 1' },
      { id: PLAYER_TWO_ID, name: 'Player 2' },
    ],
    random,
    speciesLoader: params.availablePokemon
      ? createTestSpeciesLoader(params.availablePokemon)
      : undefined,
  });

  return {
    game,
    selectParties(playerOneParty: string[], playerTwoParty: string[]) {
      const countGenderRolls = (party: string[]) =>
        party.reduce((count, speciesName) => {
          const species = speciesLookup
            ? speciesLookup.getSpecies(speciesName)
            : getSpecies(speciesName);
          return species.genderMalePercentage === -1 ? count : count + 1;
        }, 0);
      const partyCreationSequence =
        params.partyCreationRandomSequence ??
        new Array(
          countGenderRolls(playerOneParty) + countGenderRolls(playerTwoParty),
        ).fill(0);
      sequence.unshift(...partyCreationSequence);

      game.selectParty(PLAYER_ONE_ID, playerOneParty);
      game.selectParty(PLAYER_TWO_ID, playerTwoParty);
    },
    resolveAttackTurn(playerOneMove: string, playerTwoMove: string) {
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
    },
  };
}
