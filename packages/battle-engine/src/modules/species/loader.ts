import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogSchema, SpeciesLoader } from '.';

export class DefaultLoader implements SpeciesLoader {
  load() {
    const filePath = fileURLToPath(new URL('./catalog/v1.json', import.meta.url));
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    const species = catalogSchema.parse(raw);
    return species.options;
  }
}
