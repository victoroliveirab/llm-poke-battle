import { getActivePokemon } from '../../party-state';
import { resolveTurn } from '../../resolve-turn';
import { StageStat, TurnAction } from '../../types';
import { StatusHandlerRegistry } from '../../statuses/types';
import {
  buildAttackAction,
  buildPartyEntries,
  buildRandomSequence,
  buildSwitchAction,
  getSpecies,
  PLAYER_ONE_ID,
  PLAYER_TWO_ID,
} from './shared';

type TurnStateFixtureParams = {
  playerOneParty?: string[];
  playerTwoParty?: string[];
  randomSequence?: number[];
  statusHandlerRegistry?: StatusHandlerRegistry;
};

type StageOverrides = Partial<Record<StageStat, number>>;

export function createTurnStateFixture(params: TurnStateFixtureParams = {}) {
  const simulatedParties = new Map<string, ReturnType<typeof buildPartyEntries>>([
    [
      PLAYER_ONE_ID,
      buildPartyEntries(
        PLAYER_ONE_ID,
        params.playerOneParty ?? ['Charizard', 'Raichu', 'Nidoking'],
      ),
    ],
    [
      PLAYER_TWO_ID,
      buildPartyEntries(
        PLAYER_TWO_ID,
        params.playerTwoParty ?? ['Nidoking', 'Raichu', 'Charizard'],
      ),
    ],
  ]);
  const random = buildRandomSequence(params.randomSequence ?? []);

  function setActivePokemonStages(playerId: string, stages: StageOverrides) {
    const activePokemon = getActivePokemon(simulatedParties, playerId);

    if (typeof stages.accuracy === 'number') {
      activePokemon.accuracyStage = stages.accuracy;
    }
    if (typeof stages.attack === 'number') {
      activePokemon.attackStage = stages.attack;
    }
    if (typeof stages.critical === 'number') {
      activePokemon.criticalStage = stages.critical;
    }
    if (typeof stages.defense === 'number') {
      activePokemon.defenseStage = stages.defense;
    }
    if (typeof stages.evasion === 'number') {
      activePokemon.evasionStage = stages.evasion;
    }
    if (typeof stages.specialAttack === 'number') {
      activePokemon.specialAttackStage = stages.specialAttack;
    }
    if (typeof stages.specialDefense === 'number') {
      activePokemon.specialDefenseStage = stages.specialDefense;
    }
  }

  function setActivePokemonParalysis(playerId: string, isParalyzed: boolean) {
    getActivePokemon(simulatedParties, playerId).majorStatus = isParalyzed
      ? 'paralysis'
      : null;
  }

  function setActivePokemonHealth(playerId: string, health: number) {
    getActivePokemon(simulatedParties, playerId).health = health;
  }

  function attack(playerId: string, attackName: string): TurnAction {
    return buildAttackAction(playerId, attackName);
  }

  function switchPokemon(playerId: string, pokemonName: string): TurnAction {
    return buildSwitchAction(playerId, pokemonName);
  }

  function resolveActions(
    playerOneAction: TurnAction,
    playerTwoAction: TurnAction,
  ) {
    return resolveTurn({
      playerIds: [PLAYER_ONE_ID, PLAYER_TWO_ID],
      actions: [playerOneAction, playerTwoAction],
      simulatedParties,
      getSpecies,
      random,
      statusHandlerRegistry: params.statusHandlerRegistry,
    });
  }

  return {
    attack,
    getSpecies,
    getActivePokemon(playerId: string) {
      return getActivePokemon(simulatedParties, playerId);
    },
    random,
    resolveActions,
    resolveAttackTurn(playerOneMove: string, playerTwoMove: string) {
      return resolveActions(
        attack(PLAYER_ONE_ID, playerOneMove),
        attack(PLAYER_TWO_ID, playerTwoMove),
      );
    },
    setActivePokemonHealth,
    setActivePokemonParalysis,
    setActivePokemonStages,
    simulatedParties,
    switchPokemon,
  };
}
