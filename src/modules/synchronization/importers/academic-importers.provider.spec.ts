import { describe, expect, it } from 'vitest';

import { SYNC_DOMAINS } from '../../../database/schema';

import { ACADEMIC_IMPORTER_CLASSES } from './academic-importers.provider';
import type { AcademicImporter } from './academic.importer';
import { LEARNING_IMPORTER_CLASSES } from './learning-importers.provider';
import type { LearningImporter } from './learning.importer';

const domainsOf = (classes: readonly unknown[]): string[] =>
  classes.map((Importer) => new (Importer as new () => { domain: string })().domain);

describe('academic importers', () => {
  it('registers every domain the SIS half reports on, in dependency order', () => {
    const learning = new Set(domainsOf(LEARNING_IMPORTER_CLASSES));

    // The order is the execution order: a domain may only reference rows an
    // earlier domain has already written.
    expect(domainsOf(ACADEMIC_IMPORTER_CLASSES)).toEqual(
      SYNC_DOMAINS.filter((domain) => !learning.has(domain)),
    );
  });

  it('names a distinct connector capability for each domain', () => {
    const capabilities = ACADEMIC_IMPORTER_CLASSES.map(
      (Importer) => new (Importer as unknown as new () => AcademicImporter)().capability,
    );

    expect(new Set(capabilities).size).toBe(capabilities.length);
  });
});

describe('learning importers', () => {
  it('imports learning spaces before the activities that reference them', () => {
    expect(domainsOf(LEARNING_IMPORTER_CLASSES)).toEqual([
      'learningSpaces',
      'learningActivities',
    ]);
  });

  it('names a distinct connector capability for each domain', () => {
    const capabilities = LEARNING_IMPORTER_CLASSES.map(
      (Importer) => new (Importer as unknown as new () => LearningImporter)().capability,
    );

    expect(new Set(capabilities).size).toBe(capabilities.length);
  });

  it('claims no domain the academic half already owns', () => {
    const academic = new Set(domainsOf(ACADEMIC_IMPORTER_CLASSES));

    for (const domain of domainsOf(LEARNING_IMPORTER_CLASSES)) {
      expect(academic.has(domain)).toBe(false);
    }
  });
});
