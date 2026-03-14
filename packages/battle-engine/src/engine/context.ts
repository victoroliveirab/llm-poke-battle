import type { PartyModule } from '../modules/party';
import type { PhaseModule } from '../modules/phase';
import type { PlayerModule } from '../modules/player';
import type { SpeciesModule } from '../modules/species';
import type { TurnModule } from '../modules/turn';

export type ModuleRegistry = {
  species: SpeciesModule;
  players: PlayerModule;
  party: PartyModule;
  phase: PhaseModule;
  turn: TurnModule;
};

export class GameContext {
  private readonly modules: ModuleRegistry;
  private readonly randomFn: () => number;

  constructor(modules: ModuleRegistry, randomFn?: () => number) {
    this.modules = modules;
    this.randomFn = randomFn ?? Math.random;
  }

  get species() {
    return this.modules.species;
  }

  get players() {
    return this.modules.players;
  }

  get party() {
    return this.modules.party;
  }

  get phase() {
    return this.modules.phase;
  }

  get turn() {
    return this.modules.turn;
  }

  random() {
    return this.randomFn();
  }
}
