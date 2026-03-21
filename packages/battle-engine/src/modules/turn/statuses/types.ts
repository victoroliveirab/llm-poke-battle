import { DomainEvent } from '../../../engine/events';
import { PartyEntry } from '../../party/party';
import { MoveDefinition } from '../moves/types';
import { StatusKind } from '../status-state';

export type StatusContext = {
  simulatedParties: Map<string, PartyEntry[]>;
  playerId: string;
  opponentPlayerId: string;
  random: () => number;
  events: DomainEvent[];
};

export type MoveStatusContext = StatusContext & {
  attacker: PartyEntry;
  defender: PartyEntry;
  move: MoveDefinition;
};

export type DamageContext = MoveStatusContext & {
  damage: number;
};

export type BeforeMoveResult = {
  canAct: boolean;
};

export type ModifyDamageResult = {
  damage: number;
};

export type StatusHandler = {
  beforeMove?: (ctx: MoveStatusContext) => BeforeMoveResult;
  modifyDamage?: (ctx: DamageContext) => ModifyDamageResult;
  afterMove?: (ctx: MoveStatusContext) => void;
  endTurn?: (ctx: StatusContext) => void;
};

export type StatusHandlerRegistry = Readonly<
  Partial<Record<StatusKind, StatusHandler>>
>;
