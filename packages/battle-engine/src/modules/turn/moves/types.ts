import { PartyEntry } from '../../party/party';
import { PokemonSpecies, PokemonType } from '../../species';
import { DomainEvent } from '../../../engine/events';
import { StageStat, TurnAction } from '../types';

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
      status: 'paralysis';
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

export type MoveExecutionContext = {
  attacker: PartyEntry;
  attackerAction: TurnAction;
  attackerSpecies: PokemonSpecies;
  defender: PartyEntry;
  defenderAction: TurnAction;
  defenderSpecies: PokemonSpecies;
  events: DomainEvent[];
  move: MoveDefinition;
  random: () => number;
};
