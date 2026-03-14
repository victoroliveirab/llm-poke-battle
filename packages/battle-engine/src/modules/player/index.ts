import { DomainCommand } from '../../engine/commands';
import { GameContext } from '../../engine/context';
import { DomainEvent } from '../../engine/events';
import { EngineModule } from '../../engine/module';

export type Player = {
  id: string;
  name: string;
};

export class PlayerModule implements EngineModule {
  private readonly players: Player[];

  constructor(players: Player[]) {
    if (players.length !== 2) {
      throw new Error('Battle engine currently supports exactly 2 players.');
    }

    const ids = new Set(players.map((player) => player.id));
    if (ids.size !== players.length) {
      throw new Error('Player IDs must be unique.');
    }

    this.players = [...players];
  }

  init(_context: GameContext) {}

  reset() {}

  handleCommand(_command: DomainCommand, _context: GameContext): DomainEvent[] {
    return [];
  }

  onEvent(_event: DomainEvent, _context: GameContext): DomainEvent[] {
    return [];
  }

  hasPlayer(playerId: string) {
    return this.players.some((player) => player.id === playerId);
  }

  count() {
    return this.players.length;
  }

  getPlayers() {
    return [...this.players];
  }

  getOpponentId(playerId: string) {
    const opponent = this.players.find((player) => player.id !== playerId);
    return opponent?.id ?? null;
  }

  getPlayerName(playerId: string) {
    const player = this.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new Error(`Player ${playerId} is not part of this game.`);
    }
    return player.name;
  }
}
