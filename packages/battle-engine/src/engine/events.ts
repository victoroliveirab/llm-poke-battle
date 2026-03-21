import { Action } from '../types';
import {
  MajorStatusKind,
  StatusKind,
  VolatileStatus,
} from '../modules/turn/status-state';

export type DomainEvent =
  | {
      type: 'party.selected';
      playerId: string;
    }
  | {
      type: 'party.selection.completed';
    }
  | {
      type: 'game.started';
    }
  | {
      type: 'action.submitted';
      playerId: string;
      action: Action;
    }
  | {
      type: 'pokemon.switched';
      playerId: string;
      pokemonName: string;
    }
  | {
      type: 'move.consumed';
      playerId: string;
      pokemonName: string;
      moveName: string;
    }
  | {
      type: 'attack.missed';
      playerId: string;
      targetPlayerId: string;
      pokemonName: string;
      targetPokemonName: string;
      moveName: string;
  }
  | {
      type: 'attack.already_affected';
      playerId: string;
      targetPlayerId: string;
      pokemonName: string;
      targetPokemonName: string;
      status: StatusKind;
      moveName: string;
    }
  | {
      type: 'attack.paralyzed';
      playerId: string;
      targetPlayerId: string;
      pokemonName: string;
      targetPokemonName: string;
      moveName: string;
    }
  | {
      type: 'pokemon.major_status_changed';
      playerId: string;
      pokemonName: string;
      status: MajorStatusKind;
      active: boolean;
      sourcePlayerId: string;
      moveName: string;
    }
  | {
      type: 'pokemon.volatile_status_changed';
      playerId: string;
      pokemonName: string;
      status: VolatileStatus;
      active: boolean;
      sourcePlayerId: string;
      moveName: string;
    }
  | {
      type: 'damage.applied';
      playerId: string;
      pokemonName: string;
      damage: number;
      sourcePlayerId: string;
      moveName: string;
      critical: boolean;
    }
  | {
      type: 'battle.stat_stage_changed';
      playerId: string;
      pokemonName: string;
      sourcePlayerId: string;
      moveName: string;
      stat:
        | 'accuracy'
        | 'attack'
        | 'critical'
        | 'defense'
        | 'evasion'
        | 'specialAttack'
        | 'specialDefense';
      delta: number;
      resultingStage: number;
    }
  | {
      type: 'pokemon.fainted';
      playerId: string;
      pokemonName: string;
    }
  | {
      type: 'turn.resolved';
    }
  | {
      type: 'game.over';
      winner: string;
    };
