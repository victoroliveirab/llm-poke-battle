import { AttackDefinition, PokemonSpecies } from '../species';
import {
  clearVolatileStatuses,
  cloneMajorStatus,
  cloneVolatileStatus,
  MajorStatus,
  MajorStatusKind,
  StatusKind,
  StatusState,
  VolatileStatus,
} from '../turn/status-state';

export type PartyMove = Omit<AttackDefinition, 'pp'> & {
  maxPP: number;
  remaining: number;
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

export type PokemonGender = 'male' | 'female';

export type PartyEntry = StatusState & {
  accuracyStage: number;
  attackStage: number;
  criticalStage: number;
  defenseStage: number;
  evasionStage: number;
  gender: PokemonGender;
  health: number;
  level: number;
  moves: PartyMove[];
  name: string;
  specialAttackStage: number;
  specialDefenseStage: number;
  stats: PartyStats;
  used: boolean;
};

type StageStat =
  | 'accuracy'
  | 'attack'
  | 'critical'
  | 'defense'
  | 'evasion'
  | 'specialAttack'
  | 'specialDefense';

type Params = {
  getAttack: (attackId: string) => AttackDefinition;
  level: number;
  pokemon: PokemonSpecies[];
  owner: string;
  random: () => number;
};

export class Party {
  private readonly getAttackDefinition: Params['getAttack'];
  private readonly level: number;
  private readonly owner: string;
  private readonly random: Params['random'];
  private pokemon: PartyEntry[];

  constructor(params: Params) {
    this.getAttackDefinition = params.getAttack;
    this.level = params.level;
    this.owner = params.owner;
    this.random = params.random;
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
      majorStatus: cloneMajorStatus(entry.majorStatus),
      moves: entry.moves.map(clonePartyMove),
      stats: { ...entry.stats },
      volatileStatuses: entry.volatileStatuses.map(cloneVolatileStatus),
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

    const activePokemon = this.pokemon[0];
    if (activePokemon && activePokemon.name !== name) {
      this.resetBattleStages(activePokemon.name);
      clearVolatileStatuses(activePokemon);
      if (activePokemon.majorStatus?.kind === 'badly-poisoned') {
        activePokemon.majorStatus = {
          kind: 'badly-poisoned',
          turnsElapsed: 1,
        };
      }
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

  applyStatStageDelta(pokemonName: string, stat: StageStat, delta: number) {
    const pokemon = this.getPokemonByName(pokemonName);
    if (!pokemon) {
      throw new Error(`Pokemon ${pokemonName} not found in party.`);
    }

    const currentStage = this.getStageValue(pokemon, stat);
    const nextStage = this.clampStage(currentStage + Math.trunc(delta), stat);
    this.setStageValue(pokemon, stat, nextStage);
    return nextStage;
  }

  applyMajorStatus(pokemonName: string, status: Exclude<MajorStatus, null>) {
    const pokemon = this.getPokemonByName(pokemonName);
    if (!pokemon) {
      throw new Error(`Pokemon ${pokemonName} not found in party.`);
    }

    if (pokemon.majorStatus !== null) {
      return false;
    }

    pokemon.majorStatus = cloneMajorStatus(status);
    return true;
  }

  setMajorStatus(pokemonName: string, status: Exclude<MajorStatus, null>) {
    const pokemon = this.getPokemonByName(pokemonName);
    if (!pokemon) {
      throw new Error(`Pokemon ${pokemonName} not found in party.`);
    }

    pokemon.majorStatus = cloneMajorStatus(status);
    return true;
  }

  applyVolatileStatus(pokemonName: string, status: VolatileStatus) {
    const pokemon = this.getPokemonByName(pokemonName);
    if (!pokemon) {
      throw new Error(`Pokemon ${pokemonName} not found in party.`);
    }

    if (pokemon.volatileStatuses.some((entry) => entry.kind === status.kind)) {
      return false;
    }

    pokemon.volatileStatuses.push(cloneVolatileStatus(status));
    return true;
  }

  setVolatileStatus(pokemonName: string, status: VolatileStatus) {
    const pokemon = this.getPokemonByName(pokemonName);
    if (!pokemon) {
      throw new Error(`Pokemon ${pokemonName} not found in party.`);
    }

    const nextStatus = cloneVolatileStatus(status);
    const index = pokemon.volatileStatuses.findIndex(
      (entry) => entry.kind === status.kind,
    );

    if (index === -1) {
      pokemon.volatileStatuses.push(nextStatus);
      return true;
    }

    pokemon.volatileStatuses[index] = nextStatus;
    return true;
  }

  clearStatus(pokemonName: string, status: StatusKind) {
    const pokemon = this.getPokemonByName(pokemonName);
    if (!pokemon) {
      throw new Error(`Pokemon ${pokemonName} not found in party.`);
    }

    if (pokemon.majorStatus?.kind === status) {
      pokemon.majorStatus = null;
      return true;
    }

    const before = pokemon.volatileStatuses.length;
    pokemon.volatileStatuses = pokemon.volatileStatuses.filter(
      (entry) => entry.kind !== status,
    );
    return before !== pokemon.volatileStatuses.length;
  }

  resetBattleStages(pokemonName: string) {
    const pokemon = this.getPokemonByName(pokemonName);
    if (!pokemon) {
      throw new Error(`Pokemon ${pokemonName} not found in party.`);
    }

    pokemon.accuracyStage = 0;
    pokemon.attackStage = 0;
    pokemon.criticalStage = 0;
    pokemon.defenseStage = 0;
    pokemon.evasionStage = 0;
    pokemon.specialAttackStage = 0;
    pokemon.specialDefenseStage = 0;
  }

  private getStageValue(pokemon: PartyEntry, stat: StageStat) {
    if (stat === 'accuracy') {
      return pokemon.accuracyStage;
    }
    if (stat === 'attack') {
      return pokemon.attackStage;
    }
    if (stat === 'critical') {
      return pokemon.criticalStage;
    }
    if (stat === 'defense') {
      return pokemon.defenseStage;
    }
    if (stat === 'evasion') {
      return pokemon.evasionStage;
    }
    if (stat === 'specialAttack') {
      return pokemon.specialAttackStage;
    }
    return pokemon.specialDefenseStage;
  }

  private setStageValue(pokemon: PartyEntry, stat: StageStat, value: number) {
    if (stat === 'accuracy') {
      pokemon.accuracyStage = value;
      return;
    }
    if (stat === 'attack') {
      pokemon.attackStage = value;
      return;
    }
    if (stat === 'critical') {
      pokemon.criticalStage = value;
      return;
    }
    if (stat === 'defense') {
      pokemon.defenseStage = value;
      return;
    }
    if (stat === 'evasion') {
      pokemon.evasionStage = value;
      return;
    }
    if (stat === 'specialAttack') {
      pokemon.specialAttackStage = value;
      return;
    }
    pokemon.specialDefenseStage = value;
  }

  private clampStage(stage: number, stat: StageStat) {
    const normalizedStage = Math.trunc(stage);
    if (stat === 'critical') {
      return Math.max(0, normalizedStage);
    }
    return Math.max(-6, Math.min(6, normalizedStage));
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
      criticalStage: 0,
      defenseStage: 0,
      evasionStage: 0,
      gender: this.determineGender(pokemon),
      health: stats.hp,
      level: this.level,
      majorStatus: null,
      moves: pokemon.moves.map((attackId) => {
        const attack = this.getAttackDefinition(attackId);
        const { pp, ...attackWithoutPP } = attack;
        return clonePartyMove({
          ...attackWithoutPP,
          maxPP: pp,
          remaining: pp,
          used: 0,
        });
      }),
      name: pokemon.species,
      specialAttackStage: 0,
      specialDefenseStage: 0,
      stats,
      used: index === 0,
      volatileStatuses: [],
    };
  }

  private determineGender(pokemon: PokemonSpecies): PokemonGender {
    return this.random() < pokemon.genderMalePercentage ? 'male' : 'female';
  }
}

function clonePartyMove(move: PartyMove): PartyMove {
  const clonedMove: PartyMove = { ...move };

  if (move.statChanges) {
    clonedMove.statChanges = move.statChanges.map((change) => ({ ...change }));
  }

  if (move.statusEffects) {
    clonedMove.statusEffects = move.statusEffects.map((effect) => ({ ...effect }));
  }

  return clonedMove;
}
