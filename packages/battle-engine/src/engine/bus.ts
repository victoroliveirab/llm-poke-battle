import { GameContext } from './context';
import { DomainEvent } from './events';
import { EngineModule } from './module';

export class EventBus {
  private readonly modules: EngineModule[];
  private readonly context: GameContext;

  constructor(modules: EngineModule[], context: GameContext) {
    this.modules = modules;
    this.context = context;
  }

  dispatch(initialEvents: DomainEvent[]) {
    const queue = [...initialEvents];
    const emitted: DomainEvent[] = [];

    while (queue.length > 0) {
      const event = queue.shift();
      if (!event) {
        continue;
      }

      emitted.push(event);

      for (const module of this.modules) {
        const producedEvents = module.onEvent(event, this.context);
        if (producedEvents.length === 0) {
          continue;
        }
        queue.push(...producedEvents);
      }
    }

    return emitted;
  }
}
