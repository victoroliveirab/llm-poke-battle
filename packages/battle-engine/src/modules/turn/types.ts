import { DomainCommand } from '../../engine/commands';

export type SubmitActionCommand = Extract<DomainCommand, { type: 'action.submit' }>;

export type TurnAction = {
  playerId: string;
  action: SubmitActionCommand['action'];
};

export type StageStat =
  | 'accuracy'
  | 'attack'
  | 'critical'
  | 'defense'
  | 'evasion'
  | 'specialAttack'
  | 'specialDefense';

export type StageChange = {
  target: 'self' | 'opponent';
  stat: StageStat;
  stages: number;
};
