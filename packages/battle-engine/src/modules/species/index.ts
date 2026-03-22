import { z } from 'zod';
import { DomainCommand } from '../../engine/commands';
import { GameContext } from '../../engine/context';
import { DomainEvent } from '../../engine/events';
import { EngineModule } from '../../engine/module';
import { pokemonTypeEnum } from '../../shared/schemas';

const majorStatusValues = ['paralysis', 'burn', 'freeze', 'sleep', 'poison'] as const;
const volatileStatusValues = ['confusion'] as const;
const statusTargetSchema = z.enum(['self', 'opponent']);
const statusChanceSchema = z.number();
const majorStatusEffectSchema = z.object({
  target: statusTargetSchema,
  kind: z.literal('major-status'),
  status: z.enum(majorStatusValues),
  chance: statusChanceSchema,
});
const volatileStatusEffectSchema = z.object({
  target: statusTargetSchema,
  kind: z.literal('volatile-status'),
  status: z.enum(volatileStatusValues),
  chance: statusChanceSchema,
});
const catalogStatusEffectSchema = z.union([
  majorStatusEffectSchema,
  volatileStatusEffectSchema,
]);

const catalogOptionMoveSchema = z.object({
  name: z.string(),
  power: z.number(),
  accuracy: z.number(),
  pp: z.number(),
  type: pokemonTypeEnum,
  class: z.enum(['physical', 'special']),
  statusEffects: z.array(catalogStatusEffectSchema).optional(),
  statChanges: z
    .array(
      z.object({
        target: z.enum(['self', 'opponent']),
        stat: z.enum([
          'accuracy',
          'attack',
          'critical',
          'defense',
          'evasion',
          'specialAttack',
          'specialDefense',
        ]),
        stages: z.number(),
      }),
    )
    .optional(),
});

const catalogStats = z.object({
  attack: z.number(),
  defense: z.number(),
  specialAttack: z.number(),
  specialDefense: z.number(),
  speed: z.number(),
  hp: z.number(),
});

const catalogOptionSchema = z.object({
  species: z.string(),
  stats: catalogStats,
  type1: pokemonTypeEnum,
  type2: pokemonTypeEnum.nullable(),
  moves: z.array(catalogOptionMoveSchema),
});

export const catalogSchema = z.object({
  options: z.array(catalogOptionSchema),
});

export type PokemonCatalog = z.infer<typeof catalogSchema>['options'];
export type PokemonMove = z.infer<typeof catalogOptionMoveSchema>;
export type PokemonStatusEffect = z.infer<typeof catalogStatusEffectSchema>;
export type PokemonSpecies = z.infer<typeof catalogOptionSchema>;
export type PokemonType = z.infer<typeof pokemonTypeEnum>;

export interface SpeciesLoader {
  load: () => PokemonCatalog;
}

export class SpeciesModule implements EngineModule {
  private readonly loader: SpeciesLoader;
  private catalog: PokemonCatalog = [];
  private bySpecies = new Map<string, PokemonSpecies>();

  constructor(loader: SpeciesLoader) {
    this.loader = loader;
  }

  init(_context: GameContext) {
    this.loadCatalog();
  }

  reset() {
    this.loadCatalog();
  }

  private loadCatalog() {
    this.catalog = this.loader.load();
    this.bySpecies = new Map(this.catalog.map((entry) => [entry.species, entry]));
  }

  handleCommand(_command: DomainCommand, _context: GameContext): DomainEvent[] {
    return [];
  }

  onEvent(_event: DomainEvent, _context: GameContext): DomainEvent[] {
    return [];
  }

  getCatalog() {
    return this.catalog;
  }

  getAvailablePokemon() {
    return this.catalog.map((entry) => entry.species);
  }

  getSpecies(speciesName: string) {
    const species = this.bySpecies.get(speciesName);
    if (!species) {
      throw new Error(`Pokemon ${speciesName} not found in catalog.`);
    }
    return species;
  }

  hasSpecies(speciesName: string) {
    return this.bySpecies.has(speciesName);
  }
}
