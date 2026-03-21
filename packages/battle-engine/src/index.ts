import { DomainCommand } from './engine/commands';
import { EventBus } from './engine/bus';
import { GameContext } from './engine/context';
import { DomainEvent } from './engine/events';
import { EngineModule } from './engine/module';
import { InvalidMoveError } from './errors';
import { PartyModule } from './modules/party';
import { PhaseModule, GamePhase } from './modules/phase';
import { Player, PlayerModule } from './modules/player';
import { DefaultLoader } from './modules/species/loader';
import { SpeciesLoader, SpeciesModule } from './modules/species';
import { cloneVolatileStatus } from './modules/turn/status-state';
import { TurnModule } from './modules/turn';
import { parseAction } from './types';

export type FighterState = {
  name: string;
  hp: number;
  maxHp: number;
};

export type PlayerSlot = 'player_one' | 'player_two';

export type PlayerState = {
  name: string;
  party: string[];
  partySelected: boolean;
  activePokemon: FighterState | null;
  revealedMoves: string[];
};

export type GameState = {
  phase: GamePhase;
  turn: number;
  requiredPartySize: number;
  availablePokemon: string[];
  playerOne: PlayerState;
  playerTwo: PlayerState;
  gameOver: boolean;
  winner: string | null;
};

type GameParams = {
  partySize: number;
  players: Player[];
  speciesLoader?: SpeciesLoader;
  random?: () => number;
};

export class Battle {
  private readonly speciesModule: SpeciesModule;
  private readonly playerModule: PlayerModule;
  private readonly partyModule: PartyModule;
  private readonly phaseModule: PhaseModule;
  private readonly turnModule: TurnModule;

  private readonly modules: EngineModule[];
  private readonly context: GameContext;
  private readonly bus: EventBus;

  constructor(params: GameParams) {
    this.speciesModule = new SpeciesModule(params.speciesLoader ?? new DefaultLoader());
    this.playerModule = new PlayerModule(params.players);
    this.partyModule = new PartyModule(params.partySize);
    this.phaseModule = new PhaseModule();
    this.turnModule = new TurnModule();

    this.context = new GameContext(
      {
        species: this.speciesModule,
        players: this.playerModule,
        party: this.partyModule,
        phase: this.phaseModule,
        turn: this.turnModule,
      },
      params.random,
    );

    this.modules = [
      this.speciesModule,
      this.playerModule,
      this.partyModule,
      this.phaseModule,
      this.turnModule,
    ];

    this.bus = new EventBus(this.modules, this.context);

    for (const module of this.modules) {
      module.init(this.context);
    }
  }

  reset() {
    for (const module of this.modules) {
      module.reset();
    }
  }

  getStateAsPlayer(playerID: string) {
    if (!this.playerModule.hasPlayer(playerID)) {
      throw new Error('Not part of game');
    }

    const opponentID = this.playerModule.getOpponentId(playerID);
    const playerParty = this.partyModule.hasParty(playerID)
      ? this.getParty(playerID, playerID)
      : null;
    const opponentParty =
      opponentID !== null && this.partyModule.hasParty(opponentID)
        ? this.getParty(opponentID, playerID)
        : null;

    return {
      opponent: opponentParty,
      player: playerParty,
      phase: this.phaseModule.getPhase(),
      turn: this.phaseModule.getTurn(),
      winner: this.phaseModule.getWinner(),
      availablePokemon: this.speciesModule.getAvailablePokemon(),
      requiredPartySize: this.partyModule.getRequiredPartySize(),
    };
  }

  getAvailablePokemon() {
    return this.speciesModule.getAvailablePokemon();
  }

  getPhase() {
    return this.phaseModule.getPhase();
  }

  selectParty(playerID: string, rawChoices: string[]) {
    this.dispatchCommand({
      type: 'party.select',
      playerId: playerID,
      choices: rawChoices,
    });
  }

  selectAction(rawAction: unknown) {
    const action = parseAction(rawAction);
    return this.dispatchCommand({
      type: 'action.submit',
      action,
    });
  }

  getParty(playerID: string, viewer: string) {
    const party = this.partyModule.getParty(playerID);

    if (playerID === viewer) {
      return party;
    }

    const isPartySelectionPhase = this.phaseModule.getPhase() === 'party_selection';

    return party.map((entry, index) => {
      const isRevealedPokemon =
        !isPartySelectionPhase && (entry.used || index === 0);

      return {
        accuracyStage: entry.accuracyStage,
        attackStage: entry.attackStage,
        criticalStage: entry.criticalStage,
        defenseStage: entry.defenseStage,
        evasionStage: entry.evasionStage,
        health: isRevealedPokemon ? entry.health : null,
        isActive: index === 0,
        majorStatus: isRevealedPokemon ? entry.majorStatus : null,
        name: isRevealedPokemon ? entry.name : '???',
        specialAttackStage: entry.specialAttackStage,
        specialDefenseStage: entry.specialDefenseStage,
        used: entry.used,
        volatileStatuses: isRevealedPokemon
          ? entry.volatileStatuses.map(cloneVolatileStatus)
          : [],
        moves: entry.moves.map((move) =>
          move.used
            ? move
            : {
                accuracy: null,
                name: '???',
                maxPP: null,
                power: null,
                type: null,
                used: false,
              },
        ),
      };
    });
  }

  private dispatchCommand(command: DomainCommand): DomainEvent[] {
    const initialEvents: DomainEvent[] = [];

    for (const module of this.modules) {
      const emitted = module.handleCommand(command, this.context);
      if (emitted.length > 0) {
        initialEvents.push(...emitted);
      }
    }

    if (initialEvents.length === 0) {
      throw new Error(`No module handled command '${command.type}'.`);
    }

    return this.bus.dispatch(initialEvents);
  }
}

export { Battle as Game };

export { InvalidMoveError };
export { parseAction };
export type { Action, ActionEnvelope } from './types';
export type { Player } from './modules/player';
export type { SpeciesLoader, PokemonCatalog, PokemonSpecies } from './modules/species';
export type {
  AppliedStatus,
  MajorStatus,
  MajorStatusKind,
  StatusKind,
  VolatileStatus,
  VolatileStatusKind,
} from './modules/turn/status-state';
