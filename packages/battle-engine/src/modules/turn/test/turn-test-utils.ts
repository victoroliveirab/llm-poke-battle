import { Battle } from '../../../index';

export const PLAYER_ONE_ID = 'player-one';
export const PLAYER_TWO_ID = 'player-two';

export function buildBattleWithRandomSequence(sequence: number[]) {
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

export function selectDefaultParties(game: Battle) {
  game.selectParty(PLAYER_ONE_ID, ['Charizard', 'Raichu', 'Nidoking']);
  game.selectParty(PLAYER_TWO_ID, ['Nidoking', 'Raichu', 'Charizard']);
}

export function selectFearowParties(game: Battle) {
  game.selectParty(PLAYER_ONE_ID, ['Fearow', 'Raichu', 'Charizard']);
  game.selectParty(PLAYER_TWO_ID, ['Nidoking', 'Raichu', 'Charizard']);
}

export function selectNidokingParties(game: Battle) {
  game.selectParty(PLAYER_ONE_ID, ['Nidoking', 'Charizard', 'Raichu']);
  game.selectParty(PLAYER_TWO_ID, ['Exeggutor', 'Charizard', 'Raichu']);
}

export function selectCharizardParties(game: Battle) {
  game.selectParty(PLAYER_ONE_ID, ['Charizard', 'Nidoking', 'Raichu']);
  game.selectParty(PLAYER_TWO_ID, ['Nidoking', 'Exeggutor', 'Raichu']);
}

export function resolveAttackTurn(game: Battle, playerOneMove: string, playerTwoMove: string) {
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

export function setActivePokemonStages(
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

export function setActivePokemonParalysis(
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

export function setActivePokemonHealth(game: Battle, playerId: string, health: number) {
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

export function isActivePokemonParalyzed(game: Battle, playerId: string) {
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

export function getDamageAppliedEvent(
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

