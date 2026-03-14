import { DomainCommand } from '../../engine/commands';
import { GameContext } from '../../engine/context';
import { DomainEvent } from '../../engine/events';
import { EngineModule } from '../../engine/module';

export type GamePhase = 'party_selection' | 'game_loop' | 'game_over';

export class PhaseModule implements EngineModule {
  private phase: GamePhase = 'party_selection';
  private turn = 0;
  private winner: string | null = null;

  init(_context: GameContext) {
    this.phase = 'party_selection';
    this.turn = 0;
    this.winner = null;
  }

  reset() {
    this.phase = 'party_selection';
    this.turn = 0;
    this.winner = null;
  }

  handleCommand(_command: DomainCommand, _context: GameContext): DomainEvent[] {
    return [];
  }

  onEvent(event: DomainEvent, _context: GameContext): DomainEvent[] {
    if (event.type === 'party.selection.completed') {
      this.phase = 'game_loop';
      this.turn = 1;
      this.winner = null;
      return [{ type: 'game.started' }];
    }

    if (event.type === 'turn.resolved' && this.phase === 'game_loop') {
      this.turn += 1;
    }

    if (event.type === 'game.over') {
      this.phase = 'game_over';
      this.winner = event.winner;
    }

    return [];
  }

  getPhase() {
    return this.phase;
  }

  getTurn() {
    return this.turn;
  }

  getWinner() {
    return this.winner;
  }
}
