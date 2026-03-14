import { Action } from '../types';

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
      type: 'damage.applied';
      playerId: string;
      pokemonName: string;
      damage: number;
      sourcePlayerId: string;
      moveName: string;
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
