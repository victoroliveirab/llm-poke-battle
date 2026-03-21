import { PartyEntry } from '../../party/party';
import { PokemonSpecies, PokemonType } from '../../species';
import { StageStat, TurnAction } from '../types';
import { StatusKind } from '../status-state';
import { MoveStatusContext, StatusHandlerRegistry } from '../statuses/types';

export type MoveEffect =
  | {
      kind: 'damage';
    }
  | {
      kind: 'modify-stage';
      target: 'self' | 'opponent';
      stat: StageStat;
      stages: number;
    }
  | {
      kind: 'apply-status';
      target: 'self' | 'opponent';
      status: StatusKind;
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
