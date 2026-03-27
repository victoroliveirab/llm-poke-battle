import { z } from 'zod';
import { DomainCommand } from '../../engine/commands';
import { GameContext } from '../../engine/context';
import { DomainEvent } from '../../engine/events';
import { EngineModule } from '../../engine/module';
import { pokemonTypeEnum } from '../../shared/schemas';

const majorStatusValues = [
  'paralysis',
  'burn',
  'freeze',
  'sleep',
  'poison',
  'badly-poisoned',
] as const;
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

const attackDefinitionSchema = z.object({
  id: z.string().min(1),
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

const speciesMoveIdSchema = z.string().min(1);

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
  genderMalePercentage: z.number().min(0).max(1),
  stats: catalogStats,
  type1: pokemonTypeEnum,
  type2: pokemonTypeEnum.nullable(),
  moves: z.array(speciesMoveIdSchema),
});

export const speciesCatalogSchema = z.object({
  options: z.array(catalogOptionSchema),
});

export const attackCatalogSchema = z.object({
  options: z.array(attackDefinitionSchema),
});

export type PokemonCatalog = z.infer<typeof speciesCatalogSchema>['options'];
export type AttackCatalog = z.infer<typeof attackCatalogSchema>['options'];
export type AttackDefinition = z.infer<typeof attackDefinitionSchema>;
export type AttackStatusEffect = z.infer<typeof catalogStatusEffectSchema>;
export type AttackStatChange = NonNullable<AttackDefinition['statChanges']>[number];
export type PokemonSpecies = z.infer<typeof catalogOptionSchema>;
export type PokemonType = z.infer<typeof pokemonTypeEnum>;
export type SpeciesData = {
  attacks: AttackCatalog;
  species: PokemonCatalog;
};

export interface SpeciesLoader {
  load: () => SpeciesData;
}

export class SpeciesModule implements EngineModule {
  private readonly loader: SpeciesLoader;
  private catalog: PokemonCatalog = [];
  private attacks: AttackCatalog = [];
  private byAttackId = new Map<string, AttackDefinition>();
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
    const loaded = this.loader.load();
    const attacks = z.array(attackDefinitionSchema).parse(loaded.attacks);
    const species = z.array(catalogOptionSchema).parse(loaded.species);
    const byAttackId = new Map<string, AttackDefinition>();
    const bySpecies = new Map<string, PokemonSpecies>();

    for (const attack of attacks) {
      if (byAttackId.has(attack.id)) {
        throw new Error(`Attack ${attack.id} is duplicated in the attack catalog.`);
      }

      byAttackId.set(attack.id, attack);
    }

    for (const entry of species) {
      if (bySpecies.has(entry.species)) {
        throw new Error(`Pokemon ${entry.species} is duplicated in the species catalog.`);
      }

      for (const attackId of entry.moves) {
        if (!byAttackId.has(attackId)) {
          throw new Error(
            `Pokemon ${entry.species} references unknown attack ${attackId}.`,
          );
        }
      }

      bySpecies.set(entry.species, entry);
    }

    this.attacks = attacks;
    this.catalog = species;
    this.byAttackId = byAttackId;
    this.bySpecies = bySpecies;
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

  getAttackCatalog() {
    return this.attacks;
  }

  getAvailablePokemon() {
    return this.catalog.map((entry) => entry.species);
  }

  getAttack(attackId: string) {
    const attack = this.byAttackId.get(attackId);
    if (!attack) {
      throw new Error(`Attack ${attackId} not found in catalog.`);
    }
    return attack;
  }

  hasAttack(attackId: string) {
    return this.byAttackId.has(attackId);
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
