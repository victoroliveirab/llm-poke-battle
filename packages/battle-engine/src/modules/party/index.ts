import { DomainCommand } from '../../engine/commands';
import { GameContext } from '../../engine/context';
import { DomainEvent } from '../../engine/events';
import { EngineModule } from '../../engine/module';
import { Party, PartyEntry } from './party';

export class PartyModule implements EngineModule {
  private readonly partySize: number;
  private readonly parties = new Map<string, Party>();

  constructor(partySize: number) {
    this.partySize = partySize;
  }

  init(_context: GameContext) {
    this.parties.clear();
  }

  reset() {
    this.parties.clear();
  }

  handleCommand(command: DomainCommand, context: GameContext): DomainEvent[] {
    if (command.type !== 'party.select') {
      return [];
    }

    if (context.phase.getPhase() !== 'party_selection') {
      throw new Error(
        'Party selection is closed. The game is already in progress.',
      );
    }

    if (!context.players.hasPlayer(command.playerId)) {
      throw new Error(`Player ${command.playerId} is not part of this game.`);
    }

    if (this.parties.has(command.playerId)) {
      throw new Error('You already selected a party.');
    }

    const pokemon = this.parsePokemonChoices(command.choices, context);

    this.parties.set(
      command.playerId,
      new Party({
        getAttack: (attackId) => context.species.getAttack(attackId),
        level: 50,
        pokemon,
        owner: command.playerId,
        random: () => context.random(),
      }),
    );

    const events: DomainEvent[] = [
      {
        type: 'party.selected',
        playerId: command.playerId,
      },
    ];

    if (this.parties.size === context.players.count()) {
      events.push({ type: 'party.selection.completed' });
    }

    return events;
  }

  onEvent(event: DomainEvent, _context: GameContext): DomainEvent[] {
    if (event.type === 'pokemon.switched') {
      const party = this.getPartyObject(event.playerId);
      party.putPokemonInFront(event.pokemonName);
      return [];
    }

    if (event.type === 'move.consumed') {
      const party = this.getPartyObject(event.playerId);
      party.consumeMove(event.pokemonName, event.moveName);
      return [];
    }

    if (event.type === 'damage.applied') {
      const party = this.getPartyObject(event.playerId);
      party.applyDamage(event.pokemonName, event.damage);
      return [];
    }

    if (event.type === 'battle.stat_stage_changed') {
      const party = this.getPartyObject(event.playerId);
      party.applyStatStageDelta(event.pokemonName, event.stat, event.delta);
      return [];
    }

    if (event.type === 'pokemon.major_status_changed') {
      const party = this.getPartyObject(event.playerId);
      if (event.active) {
        party.applyMajorStatus(event.pokemonName, event.status);
        return [];
      }

      party.clearStatus(event.pokemonName, event.status.kind);
      return [];
    }

    if (event.type === 'pokemon.major_status_updated') {
      const party = this.getPartyObject(event.playerId);
      party.setMajorStatus(event.pokemonName, event.status);
      return [];
    }

    if (event.type === 'pokemon.hurt_by_status') {
      const party = this.getPartyObject(event.playerId);
      party.applyDamage(event.pokemonName, event.damage);
      return [];
    }

    if (event.type === 'pokemon.volatile_status_changed') {
      const party = this.getPartyObject(event.playerId);
      if (event.active) {
        party.applyVolatileStatus(event.pokemonName, event.status);
        return [];
      }

      party.clearStatus(event.pokemonName, event.status.kind);
      return [];
    }

    if (event.type === 'pokemon.volatile_status_updated') {
      const party = this.getPartyObject(event.playerId);
      party.setVolatileStatus(event.pokemonName, event.status);
      return [];
    }

    if (event.type === 'attack.confused') {
      const party = this.getPartyObject(event.playerId);
      party.applyDamage(event.pokemonName, event.damage);
      return [];
    }

    return [];
  }

  getRequiredPartySize() {
    return this.partySize;
  }

  hasParty(playerId: string) {
    return this.parties.has(playerId);
  }

  getParty(playerId: string): PartyEntry[] {
    return this.getPartyObject(playerId).all();
  }

  getActivePokemon(playerId: string): PartyEntry {
    const active = this.getPartyObject(playerId).all()[0];
    if (!active) {
      throw new Error(`No active Pokemon for player ${playerId}.`);
    }
    return active;
  }

  private getPartyObject(playerId: string) {
    const party = this.parties.get(playerId);
    if (!party) {
      throw new Error(`Party not found for player ${playerId}.`);
    }
    return party;
  }

  private parsePokemonChoices(choices: string[], context: GameContext) {
    if (choices.length !== this.partySize) {
      throw new Error(`Party must contain exactly ${this.partySize} Pokemon.`);
    }

    const selected = [];
    const seen = new Set<string>();

    for (const choice of choices) {
      const trimmed = choice.trim();
      if (!trimmed) {
        throw new Error('Pokemon names must be non-empty strings.');
      }

      if (!context.species.hasSpecies(trimmed)) {
        throw new Error(`Pokemon '${trimmed}' is not available.`);
      }

      if (seen.has(trimmed)) {
        throw new Error('Party must not contain repeated Pokemon.');
      }

      selected.push(context.species.getSpecies(trimmed));
      seen.add(trimmed);
    }

    return selected;
  }
}
