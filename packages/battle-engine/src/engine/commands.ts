import { Action } from '../types';

export type DomainCommand =
  | {
      type: 'party.select';
      playerId: string;
      choices: string[];
    }
  | {
      type: 'action.submit';
      action: Action;
    };
