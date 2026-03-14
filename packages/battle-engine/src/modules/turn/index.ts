import { DomainCommand } from '../../engine/commands';
import { GameContext } from '../../engine/context';
import { DomainEvent } from '../../engine/events';
import { EngineModule } from '../../engine/module';
import { InvalidMoveError } from '../../errors';
import { PartyEntry } from '../party/party';
import { PokemonType } from '../species';

type TurnAction = {
  playerId: string;
  action: SubmitActionCommand['action'];
};

type SubmitActionCommand = Extract<DomainCommand, { type: 'action.submit' }>;

const typeChart: Partial<Record<PokemonType, Partial<Record<PokemonType, number>>>> = {
  bug: {
    dark: 2,
    fairy: 0.5,
    fighting: 0.5,
    fire: 0.5,
    flying: 0.5,
    grass: 2,
    poison: 0.5,
    psychic: 2,
    rock: 1,
    steel: 0.5,
  },
  dark: {
    dark: 0.5,
    fairy: 0.5,
    fighting: 0.5,
    psychic: 2,
  },
  electric: {
    electric: 0.5,
    flying: 2,
    grass: 0.5,
    ground: 0,
    water: 2,
  },
  fairy: {
    dark: 2,
    fighting: 2,
    fire: 0.5,
    poison: 0.5,
    steel: 0.5,
  },
  fighting: {
    bug: 0.5,
    dark: 2,
    fairy: 0.5,
    flying: 0.5,
    ice: 2,
    normal: 2,
    poison: 0.5,
    psychic: 0.5,
    rock: 2,
    steel: 2,
  },
  fire: {
    bug: 2,
    fire: 0.5,
    grass: 2,
    ice: 2,
    rock: 0.5,
    steel: 2,
    water: 0.5,
  },
  flying: {
    bug: 2,
    electric: 0.5,
    fighting: 2,
    grass: 2,
    rock: 0.5,
    steel: 0.5,
  },
  grass: {
    bug: 0.5,
    fire: 0.5,
    flying: 0.5,
    grass: 0.5,
    ground: 2,
    poison: 0.5,
    rock: 2,
    steel: 0.5,
    water: 2,
  },
  ground: {
    bug: 0.5,
    electric: 2,
    fire: 2,
    flying: 0,
    grass: 0.5,
    poison: 2,
    rock: 2,
    steel: 2,
  },
  ice: {
    fire: 0.5,
    flying: 2,
    grass: 2,
    ground: 2,
    ice: 0.5,
    steel: 0.5,
    water: 0.5,
  },
  normal: {
    rock: 0.5,
    steel: 0.5,
  },
  poison: {
    fairy: 2,
    grass: 2,
    ground: 0.5,
    poison: 0.5,
    rock: 0.5,
    steel: 0,
  },
  psychic: {
    dark: 0,
    fighting: 2,
    poison: 2,
    psychic: 0.5,
    steel: 0.5,
  },
  rock: {
    bug: 2,
    fighting: 0.5,
    fire: 2,
    flying: 2,
    ground: 0.5,
    ice: 2,
    steel: 0.5,
  },
  steel: {
    electric: 0.5,
    fairy: 2,
    fire: 0.5,
    ice: 2,
    rock: 2,
    steel: 0.5,
    water: 0.5,
  },
  water: {
    fire: 2,
    grass: 0.5,
    ground: 2,
    rock: 2,
    water: 0.5,
  },
};

const MIN_ACCURACY_STAGE = -6;
const MAX_ACCURACY_STAGE = 6;

export class TurnModule implements EngineModule {
  private pendingActions = new Map<string, SubmitActionCommand['action']>();
  private pendingReplacementPlayers = new Set<string>();

  init(_context: GameContext) {
    this.pendingActions.clear();
    this.pendingReplacementPlayers.clear();
  }

  reset() {
    this.pendingActions.clear();
    this.pendingReplacementPlayers.clear();
  }

  handleCommand(command: DomainCommand, context: GameContext): DomainEvent[] {
    if (command.type !== 'action.submit') {
      return [];
    }

    const playerID = command.action.playerID;

    if (context.phase.getPhase() !== 'game_loop') {
      throw new Error('Game not running');
    }

    if (!context.players.hasPlayer(playerID)) {
      throw new Error(`Player ${playerID} is not part of this game.`);
    }

    if (!context.party.hasParty(playerID)) {
      throw new Error(`Party not found for player ${playerID}.`);
    }

    if (this.pendingReplacementPlayers.has(playerID)) {
      if (command.action.type !== 'switch') {
        const activePokemon = context.party.getActivePokemon(playerID);
        throw new Error(
          `Active Pokemon ${activePokemon.name} has fainted. You must switch Pokemon.`,
        );
      }

      this.validateAction(playerID, command.action, context);
      this.pendingReplacementPlayers.delete(playerID);
      return [
        {
          type: 'pokemon.switched',
          playerId: playerID,
          pokemonName: command.action.payload.newPokemon,
        },
      ];
    }

    if (this.pendingReplacementPlayers.size > 0) {
      throw new Error('Waiting for replacement switch before the next turn can start.');
    }

    if (this.pendingActions.has(playerID)) {
      throw new Error('Action already taken');
    }

    this.validateAction(playerID, command.action, context);

    this.pendingActions.set(playerID, command.action);

    const events: DomainEvent[] = [
      {
        type: 'action.submitted',
        playerId: playerID,
        action: command.action,
      },
    ];

    if (this.pendingActions.size !== context.players.count()) {
      return events;
    }

    events.push(...this.resolveTurn(context));
    return events;
  }

  onEvent(_event: DomainEvent, _context: GameContext): DomainEvent[] {
    return [];
  }

  private resolveTurn(context: GameContext): DomainEvent[] {
    const players = context.players.getPlayers();
    const playerA = players[0];
    const playerB = players[1];

    if (!playerA || !playerB) {
      throw new Error('Exactly two players are required to resolve turns.');
    }

    const actionA = this.pendingActions.get(playerA.id);
    const actionB = this.pendingActions.get(playerB.id);

    if (!actionA || !actionB) {
      throw new Error('Both players must submit an action before turn resolution.');
    }

    const simulatedParties = new Map<string, PartyEntry[]>([
      [playerA.id, context.party.getParty(playerA.id)],
      [playerB.id, context.party.getParty(playerB.id)],
    ]);

    const events: DomainEvent[] = [];

    if (actionA.type === 'switch') {
      this.applySwitch(simulatedParties, playerA.id, actionA.payload.newPokemon);
      events.push({
        type: 'pokemon.switched',
        playerId: playerA.id,
        pokemonName: actionA.payload.newPokemon,
      });
    }

    if (actionB.type === 'switch') {
      this.applySwitch(simulatedParties, playerB.id, actionB.payload.newPokemon);
      events.push({
        type: 'pokemon.switched',
        playerId: playerB.id,
        pokemonName: actionB.payload.newPokemon,
      });
    }

    const actions: [TurnAction, TurnAction] = this.getActionsInSpeedOrder(
      {
        playerId: playerA.id,
        action: actionA,
      },
      {
        playerId: playerB.id,
        action: actionB,
      },
      simulatedParties,
      context,
    );

    const defenderFaintedAfterFirstAttack = this.performAttackIfPossible(
      actions[0],
      actions[1],
      simulatedParties,
      context,
      events,
    );

    if (!defenderFaintedAfterFirstAttack) {
      this.performAttackIfPossible(
        actions[1],
        actions[0],
        simulatedParties,
        context,
        events,
      );
    }

    const winner = this.getWinner(simulatedParties, playerA.id, playerB.id);
    if (winner) {
      this.pendingReplacementPlayers.clear();
      events.push({ type: 'game.over', winner });
    } else {
      this.syncPendingReplacements(simulatedParties, [playerA.id, playerB.id]);
    }

    events.push({ type: 'turn.resolved' });
    this.pendingActions.clear();

    return events;
  }

  private getWinner(
    simulatedParties: Map<string, PartyEntry[]>,
    playerA: string,
    playerB: string,
  ) {
    const hasHealthyA = this.hasHealthyPokemon(simulatedParties, playerA);
    const hasHealthyB = this.hasHealthyPokemon(simulatedParties, playerB);

    if (!hasHealthyA && !hasHealthyB) {
      return null;
    }

    if (!hasHealthyA) {
      return playerB;
    }

    if (!hasHealthyB) {
      return playerA;
    }

    return null;
  }

  private applySwitch(
    simulatedParties: Map<string, PartyEntry[]>,
    playerId: string,
    pokemonName: string,
  ) {
    const party = simulatedParties.get(playerId);
    if (!party) {
      throw new Error(`Party not found for player ${playerId}.`);
    }

    const index = party.findIndex((entry) => entry.name === pokemonName);
    if (index === -1) {
      throw new Error(`Pokemon ${pokemonName} not in your party.`);
    }

    const pokemon = party[index];
    if (!pokemon) {
      throw new Error(`Pokemon ${pokemonName} not in your party.`);
    }

    if (pokemon.health <= 0) {
      throw new Error(`Pokemon ${pokemonName} already fainted.`);
    }

    pokemon.used = true;
    const before = party.slice(0, index);
    const after = party.slice(index + 1);
    simulatedParties.set(playerId, [pokemon, ...before, ...after]);
  }

  private getActionsInSpeedOrder(
    actionA: TurnAction,
    actionB: TurnAction,
    simulatedParties: Map<string, PartyEntry[]>,
    context: GameContext,
  ): [TurnAction, TurnAction] {
    const activePokemonA = this.getActivePokemon(simulatedParties, actionA.playerId);
    const activePokemonB = this.getActivePokemon(simulatedParties, actionB.playerId);

    if (activePokemonA.stats.speed > activePokemonB.stats.speed) {
      return [actionA, actionB];
    }

    if (activePokemonB.stats.speed > activePokemonA.stats.speed) {
      return [actionB, actionA];
    }

    return context.random() < 0.5 ? [actionA, actionB] : [actionB, actionA];
  }

  private performAttackIfPossible(
    attackerAction: TurnAction,
    defenderAction: TurnAction,
    simulatedParties: Map<string, PartyEntry[]>,
    context: GameContext,
    events: DomainEvent[],
  ) {
    if (attackerAction.action.type !== 'attack') {
      return false;
    }

    const attacker = this.getActivePokemon(simulatedParties, attackerAction.playerId);
    const defender = this.getActivePokemon(simulatedParties, defenderAction.playerId);

    if (attacker.health <= 0) {
      return false;
    }

    const moveName = attackerAction.action.payload.attackName;
    const moveState = attacker.moves.find((move) => move.name === moveName);
    if (!moveState) {
      throw new InvalidMoveError(
        `Pokemon ${attacker.name} does not contain attack ${moveName}.`,
      );
    }

    if (moveState.remaining <= 0) {
      return false;
    }

    const attackerSpecies = context.species.getSpecies(attacker.name);
    const defenderSpecies = context.species.getSpecies(defender.name);
    const move = attackerSpecies.moves.find((entry) => entry.name === moveName);
    if (!move) {
      throw new InvalidMoveError(
        `Move ${moveName} not found for Pokemon ${attacker.name}.`,
      );
    }

    moveState.used += 1;
    moveState.remaining = Math.max(0, moveState.remaining - 1);
    events.push({
      type: 'move.consumed',
      playerId: attackerAction.playerId,
      pokemonName: attacker.name,
      moveName,
    });

    const attackLanded = this.didAttackLand(
      move.accuracy,
      attacker.accuracyStage,
      defender.evasionStage,
      context,
    );
    if (!attackLanded) {
      events.push({
        type: 'attack.missed',
        playerId: attackerAction.playerId,
        targetPlayerId: defenderAction.playerId,
        pokemonName: attacker.name,
        targetPokemonName: defender.name,
        moveName,
      });
      return false;
    }

    const attackStat =
      move.class === 'physical' ? attacker.stats.attack : attacker.stats.specialAttack;
    const defenseStat =
      move.class === 'physical' ? defender.stats.defense : defender.stats.specialDefense;
    const stab =
      move.type === attackerSpecies.type1 || move.type === attackerSpecies.type2 ? 1.5 : 1.0;
    const typeEffectiveness = this.getTypeEffectiveness(
      move.type,
      defenderSpecies.type1,
      defenderSpecies.type2,
    );

    const damage = this.calculateDamage(
      attacker.level,
      move.power,
      attackStat,
      defenseStat,
      stab,
      typeEffectiveness,
      context,
    );

    defender.health = Math.max(0, defender.health - damage);

    events.push({
      type: 'damage.applied',
      playerId: defenderAction.playerId,
      pokemonName: defender.name,
      damage,
      sourcePlayerId: attackerAction.playerId,
      moveName,
    });

    if (defender.health <= 0) {
      events.push({
        type: 'pokemon.fainted',
        playerId: defenderAction.playerId,
        pokemonName: defender.name,
      });
      return true;
    }

    return false;
  }

  private validateAction(
    playerId: string,
    action: SubmitActionCommand['action'],
    context: GameContext,
  ) {
    const activePokemon = context.party.getActivePokemon(playerId);

    if (action.type === 'attack') {
      if (activePokemon.health <= 0) {
        throw new Error(
          `Active Pokemon ${activePokemon.name} has fainted. You must switch Pokemon.`,
        );
      }

      const attackName = action.payload.attackName;
      const move = activePokemon.moves.find((entry) => entry.name === attackName);

      if (!move) {
        throw new InvalidMoveError(
          `Pokemon ${activePokemon.name} does not contain attack ${attackName}.`,
        );
      }

      if (move.remaining === 0) {
        throw new Error(
          `Pokemon ${activePokemon.name} cannot use ${attackName} anymore.`,
        );
      }

      return;
    }

    const newPokemonName = action.payload.newPokemon;
    const party = context.party.getParty(playerId);

    if (newPokemonName === activePokemon.name) {
      throw new Error(`Pokemon ${newPokemonName} is already active.`);
    }

    const newPokemon = party.find((entry) => entry.name === newPokemonName);
    if (!newPokemon) {
      throw new Error(`Pokemon ${newPokemonName} not in your party.`);
    }

    if (newPokemon.health <= 0) {
      throw new Error(`Pokemon ${newPokemonName} already fainted.`);
    }
  }

  private getActivePokemon(simulatedParties: Map<string, PartyEntry[]>, playerId: string) {
    const party = simulatedParties.get(playerId);
    if (!party || party.length === 0) {
      throw new Error(`No party available for player ${playerId}.`);
    }

    const active = party[0];
    if (!active) {
      throw new Error(`No active Pokemon for player ${playerId}.`);
    }

    return active;
  }

  private hasHealthyPokemon(simulatedParties: Map<string, PartyEntry[]>, playerId: string) {
    const party = simulatedParties.get(playerId);
    if (!party || party.length === 0) {
      throw new Error(`No party available for player ${playerId}.`);
    }

    return party.some((pokemon) => pokemon.health > 0);
  }

  private syncPendingReplacements(
    simulatedParties: Map<string, PartyEntry[]>,
    playerIds: string[],
  ) {
    this.pendingReplacementPlayers.clear();

    for (const playerId of playerIds) {
      if (this.needsReplacement(simulatedParties, playerId)) {
        this.pendingReplacementPlayers.add(playerId);
      }
    }
  }

  private needsReplacement(
    simulatedParties: Map<string, PartyEntry[]>,
    playerId: string,
  ) {
    const party = simulatedParties.get(playerId);
    if (!party || party.length === 0) {
      throw new Error(`No party available for player ${playerId}.`);
    }

    const active = party[0];
    if (!active) {
      throw new Error(`No active Pokemon for player ${playerId}.`);
    }

    return active.health <= 0 && party.some((pokemon) => pokemon.health > 0);
  }

  private getTypeEffectiveness(
    attackType: PokemonType,
    defenderType1: PokemonType,
    defenderType2: PokemonType | null,
  ) {
    const againstType1 = typeChart[attackType]?.[defenderType1] ?? 1;
    if (!defenderType2) {
      return againstType1;
    }

    const againstType2 = typeChart[attackType]?.[defenderType2] ?? 1;
    return againstType1 * againstType2;
  }

  private didAttackLand(
    moveAccuracy: number,
    attackerAccuracyStage: number,
    defenderEvasionStage: number,
    context: GameContext,
  ) {
    const effectiveAccuracy = this.calculateEffectiveAccuracy(
      moveAccuracy,
      attackerAccuracyStage,
      defenderEvasionStage,
    );
    return context.random() < effectiveAccuracy;
  }

  private calculateEffectiveAccuracy(
    moveAccuracy: number,
    attackerAccuracyStage: number,
    defenderEvasionStage: number,
  ) {
    const attackerModifier = this.getStageModifier(attackerAccuracyStage);
    const defenderModifier = this.getStageModifier(defenderEvasionStage);
    const rawChance = (moveAccuracy / 100) * (attackerModifier / defenderModifier);
    return Math.max(0, Math.min(1, rawChance));
  }

  private getStageModifier(stage: number) {
    const clampedStage = this.clampStage(stage);
    if (clampedStage >= 0) {
      return (3 + clampedStage) / 3;
    }
    return 3 / (3 + Math.abs(clampedStage));
  }

  private clampStage(stage: number) {
    const normalizedStage = Math.trunc(stage);
    return Math.max(MIN_ACCURACY_STAGE, Math.min(MAX_ACCURACY_STAGE, normalizedStage));
  }

  private calculateDamage(
    level: number,
    power: number,
    attack: number,
    defense: number,
    stab: number,
    typeEffectiveness: number,
    context: GameContext,
  ) {
    const baseDamage = (((2 * level) / 5 + 2) * power * (attack / defense)) / 50 + 2;
    const randomFactor = context.random() * (1.0 - 0.85) + 0.85;
    const modifiers = stab * typeEffectiveness * randomFactor;

    return Math.floor(baseDamage * modifiers);
  }
}
