import { PartyEntry } from '../../party/party';
import { PokemonSpecies, PokemonType } from '../../species';
import { StageStat, TurnAction } from '../types';
import { MajorStatusKind, VolatileStatusKind } from '../status-state';
import { MoveStatusContext, StatusHandlerRegistry } from '../statuses/types';

export type AppliedMoveStatus =
  | {
      kind: 'major-status';
      status: MajorStatusKind;
    }
  | {
      kind: 'volatile-status';
      status: VolatileStatusKind;
    };

export type MoveEffect =
  | {
      kind: 'damage';
    }
  | {
      kind: 'modify-stage';
      target: 'self' | 'opponent';
      stat: StageStat;
      stages: number;
      chance?: number;
    }
  | {
      kind: 'apply-status';
      target: 'self' | 'opponent';
      status: AppliedMoveStatus;
      chance: number;
    };

export type MoveDefinition = {
  accuracy: number;
  class: 'physical' | 'special';
  effects: MoveEffect[];
  name: string;
  power: number;
  type: PokemonType;
};

export type MoveExecutionContext = MoveStatusContext & {
  attackerAction: TurnAction;
  attackerSpecies: PokemonSpecies;
  defenderAction: TurnAction;
  defenderSpecies: PokemonSpecies;
  statusHandlerRegistry?: StatusHandlerRegistry;
};
