import { DomainCommand } from './commands';
import { GameContext } from './context';
import { DomainEvent } from './events';

export interface EngineModule {
  init(context: GameContext): void;
  reset(): void;
  handleCommand(command: DomainCommand, context: GameContext): DomainEvent[];
  onEvent(event: DomainEvent, context: GameContext): DomainEvent[];
}
