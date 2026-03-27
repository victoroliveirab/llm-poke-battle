import { DomainCommand } from '../../engine/commands';
import { GameContext } from '../../engine/context';
import { DomainEvent } from '../../engine/events';
import { EngineModule } from '../../engine/module';
import { InvalidMoveError } from '../../errors';
import {
  resolveTurn,
  resumeTurnAfterReplacement,
  SuspendedTurn,
} from './resolve-turn';
import { SubmitActionCommand } from './types';

export class TurnModule implements EngineModule {
  private pendingActions = new Map<string, SubmitActionCommand['action']>();
  private pendingReplacementPlayers = new Set<string>();
  private suspendedTurn: SuspendedTurn | null = null;

  init(_context: GameContext) {
    this.pendingActions.clear();
    this.pendingReplacementPlayers.clear();
    this.suspendedTurn = null;
  }

  reset() {
    this.pendingActions.clear();
    this.pendingReplacementPlayers.clear();
    this.suspendedTurn = null;
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
      if (this.suspendedTurn?.waitingForPlayerId === playerID) {
        return this.resumeTurn(context, {
          playerId: playerID,
          action: command.action,
        });
      }

      const switchEvent: DomainEvent = {
        type: 'pokemon.switched',
        playerId: playerID,
        pokemonName: command.action.payload.newPokemon,
      };
      return [switchEvent];
    }

    if (this.pendingReplacementPlayers.size > 0) {
      throw new Error(
        'Waiting for replacement switch before the next turn can start.',
      );
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
      throw new Error(
        'Both players must submit an action before turn resolution.',
      );
    }

    const simulatedParties = new Map([
      [playerA.id, context.party.getParty(playerA.id)],
      [playerB.id, context.party.getParty(playerB.id)],
    ]);
    const result = resolveTurn({
      playerIds: [playerA.id, playerB.id],
      actions: [
        {
          playerId: playerA.id,
          action: actionA,
        },
        {
          playerId: playerB.id,
          action: actionB,
        },
      ],
      simulatedParties,
      getSpecies: (speciesName) => context.species.getSpecies(speciesName),
      random: () => context.random(),
    });

    this.pendingReplacementPlayers.clear();
    this.suspendedTurn = result.suspendedTurn;
    if (!result.winner) {
      for (const playerId of result.pendingReplacementPlayers) {
        this.pendingReplacementPlayers.add(playerId);
      }
    }

    this.pendingActions.clear();

    return result.events;
  }

  private resumeTurn(
    context: GameContext,
    replacementAction: {
      playerId: string;
      action: Extract<SubmitActionCommand['action'], { type: 'switch' }>;
    },
  ) {
    if (!this.suspendedTurn) {
      const switchEvent: DomainEvent = {
        type: 'pokemon.switched',
        playerId: replacementAction.playerId,
        pokemonName: replacementAction.action.payload.newPokemon,
      };
      return [switchEvent];
    }

    const players = context.players.getPlayers();
    const playerA = players[0];
    const playerB = players[1];

    if (!playerA || !playerB) {
      throw new Error('Exactly two players are required to resolve turns.');
    }

    const simulatedParties = new Map([
      [playerA.id, context.party.getParty(playerA.id)],
      [playerB.id, context.party.getParty(playerB.id)],
    ]);
    const result = resumeTurnAfterReplacement({
      playerIds: [playerA.id, playerB.id],
      replacementAction,
      remainingAction: this.suspendedTurn.remainingAction,
      simulatedParties,
      getSpecies: (speciesName) => context.species.getSpecies(speciesName),
      random: () => context.random(),
    });

    this.pendingReplacementPlayers.clear();
    this.suspendedTurn = result.suspendedTurn;
    if (!result.winner) {
      for (const playerId of result.pendingReplacementPlayers) {
        this.pendingReplacementPlayers.add(playerId);
      }
    }

    return result.events;
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
      const move = activePokemon.moves.find(
        (entry) => entry.name === attackName,
      );

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
}
