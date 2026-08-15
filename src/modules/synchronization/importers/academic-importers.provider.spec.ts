import { describe, expect, it } from 'vitest';

import { SYNC_DOMAINS } from '../../../database/schema';

import { ACADEMIC_IMPORTER_CLASSES } from './academic-importers.provider';
import type { AcademicImporter } from './academic.importer';

describe('academic importers', () => {
  it('registers every domain a run reports on, in dependency order', () => {
    const registered = ACADEMIC_IMPORTER_CLASSES.map(
      (Importer) => new (Importer as unknown as new () => AcademicImporter)().domain,
    );

    // The order is the execution order: a domain may only reference rows an
    // earlier domain has already written.
    expect(registered).toEqual([...SYNC_DOMAINS]);
  });

  it('names a distinct connector capability for each domain', () => {
    const capabilities = ACADEMIC_IMPORTER_CLASSES.map(
      (Importer) => new (Importer as unknown as new () => AcademicImporter)().capability,
    );

    expect(new Set(capabilities).size).toBe(capabilities.length);
  });
});
