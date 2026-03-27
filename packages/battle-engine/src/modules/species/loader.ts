import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { attackCatalogSchema, speciesCatalogSchema, SpeciesLoader } from '.';

export class DefaultLoader implements SpeciesLoader {
  load() {
    const speciesFilePath = fileURLToPath(
      new URL('./catalog/v1.json', import.meta.url),
    );
    const attacksFilePath = fileURLToPath(
      new URL('./catalog/attacks.v1.json', import.meta.url),
    );
    const rawSpecies = JSON.parse(readFileSync(speciesFilePath, 'utf8'));
    const rawAttacks = JSON.parse(readFileSync(attacksFilePath, 'utf8'));
    const species = speciesCatalogSchema.parse(rawSpecies);
    const attacks = attackCatalogSchema.parse(rawAttacks);
    return {
      attacks: attacks.options,
      species: species.options,
    };
  }
}
