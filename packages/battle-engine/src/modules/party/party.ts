import { PokemonSpecies } from '../species';

export type PartyMove = {
  accuracy: number;
  maxPP: number;
  name: string;
  power: number;
  remaining: number;
  type: string;
  used: number;
};

export type PartyStats = {
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  hp: number;
};

export type PartyEntry = {
  accuracyStage: number;
  attackStage: number;
  defenseStage: number;
  evasionStage: number;
  health: number;
  level: number;
  moves: PartyMove[];
  name: string;
  specialAttackStage: number;
  specialDefenseStage: number;
  stats: PartyStats;
  used: boolean;
};

type Params = {
  level: number;
  pokemon: PokemonSpecies[];
  owner: string;
};

export class Party {
  private readonly level: number;
  private readonly owner: string;
  private pokemon: PartyEntry[];

  constructor(params: Params) {
    this.level = params.level;
    this.owner = params.owner;
    this.pokemon = params.pokemon.map((entry, index) =>
      this.buildPokemonInitialState(entry, index),
    );
  }

  getOwner() {
    return this.owner;
  }

  all() {
    return this.pokemon.map((entry) => ({
      ...entry,
      moves: entry.moves.map((move) => ({ ...move })),
      stats: { ...entry.stats },
    }));
  }

  active() {
    const active = this.pokemon[0];
    if (!active) {
      throw new Error(`Party for ${this.owner} does not have an active Pokemon.`);
    }
    return active;
  }

  getPokemonByName(name: string) {
    return this.pokemon.find((entry) => entry.name === name);
  }

  putPokemonInFront(name: string) {
    const index = this.pokemon.findIndex((entry) => entry.name === name);
    if (index === -1) {
      throw new Error(`Pokemon ${name} not found in party.`);
    }

    const pokemon = this.pokemon[index];
    if (!pokemon) {
      throw new Error(`Pokemon ${name} not found in party.`);
    }

    pokemon.used = true;
    const before = this.pokemon.slice(0, index);
    const after = this.pokemon.slice(index + 1);
    this.pokemon = [pokemon, ...before, ...after];
  }

  consumeMove(pokemonName: string, moveName: string) {
    const pokemon = this.getPokemonByName(pokemonName);
    if (!pokemon) {
      throw new Error(`Pokemon ${pokemonName} not found in party.`);
    }

    const move = pokemon.moves.find((entry) => entry.name === moveName);
    if (!move) {
      throw new Error(`Move ${moveName} not found for Pokemon ${pokemonName}.`);
    }

    move.remaining = Math.max(0, move.remaining - 1);
    move.used += 1;
  }

  applyDamage(pokemonName: string, damage: number) {
    const pokemon = this.getPokemonByName(pokemonName);
    if (!pokemon) {
      throw new Error(`Pokemon ${pokemonName} not found in party.`);
    }

    pokemon.health = Math.max(0, pokemon.health - damage);
  }

  private calculateStats(pokemon: PokemonSpecies): PartyStats {
    const iv = 31;
    const ev = 252;
    const nature = 1.0;
    const level = this.level;
    const evComponent = Math.floor(ev / 4);

    const hp =
      Math.floor(((2 * pokemon.stats.hp + iv + evComponent) * level) / 100) +
      level +
      10;

    const attack =
      (Math.floor(
        ((2 * pokemon.stats.attack + iv + evComponent) * level) / 100,
      ) +
        5) *
      nature;
    const defense =
      (Math.floor(
        ((2 * pokemon.stats.defense + iv + evComponent) * level) / 100,
      ) +
        5) *
      nature;
    const specialAttack =
      (Math.floor(
        ((2 * pokemon.stats.specialAttack + iv + evComponent) * level) / 100,
      ) +
        5) *
      nature;
    const specialDefense =
      (Math.floor(
        ((2 * pokemon.stats.specialDefense + iv + evComponent) * level) / 100,
      ) +
        5) *
      nature;
    const speed =
      (Math.floor(
        ((2 * pokemon.stats.speed + iv + evComponent) * level) / 100,
      ) +
        5) *
      nature;

    return {
      attack,
      defense,
      specialAttack,
      specialDefense,
      speed,
      hp,
    };
  }

  private buildPokemonInitialState(
    pokemon: PokemonSpecies,
    index: number,
  ): PartyEntry {
    const stats = this.calculateStats(pokemon);

    return {
      accuracyStage: 0,
      attackStage: 0,
      defenseStage: 0,
      evasionStage: 0,
      health: stats.hp,
      level: this.level,
      moves: pokemon.moves.map((move) => ({
        accuracy: move.accuracy,
        maxPP: move.pp,
        name: move.name,
        power: move.power,
        remaining: move.pp,
        type: move.type,
        used: 0,
      })),
      name: pokemon.species,
      specialAttackStage: 0,
      specialDefenseStage: 0,
      stats,
      used: index === 0,
    };
  }
}
