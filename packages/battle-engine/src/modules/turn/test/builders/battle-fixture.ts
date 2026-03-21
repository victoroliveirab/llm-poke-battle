import { Battle } from '../../../../index';
import { PLAYER_ONE_ID, PLAYER_TWO_ID } from './shared';

type BattleFixtureParams = {
  randomSequence?: number[];
};

export function createBattleFixture(params: BattleFixtureParams = {}) {
  const random = (() => {
    let randomIndex = 0;
    const sequence = params.randomSequence ?? [];

    return () => {
      const value = sequence[randomIndex];
      randomIndex += 1;
      return typeof value === 'number' ? value : 0;
    };
  })();

  const game = new Battle({
    partySize: 3,
    players: [
      { id: PLAYER_ONE_ID, name: 'Player 1' },
      { id: PLAYER_TWO_ID, name: 'Player 2' },
    ],
    random,
  });

  return {
    game,
    selectParties(playerOneParty: string[], playerTwoParty: string[]) {
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
