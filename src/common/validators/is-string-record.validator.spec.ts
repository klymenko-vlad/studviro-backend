import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { IsStringRecord } from './is-string-record.validator';

class Subject {
  @IsStringRecord()
  values?: unknown;
}

const errorsFor = (value: unknown): string[] => {
  const subject = Object.assign(new Subject(), { values: value });

  return validateSync(subject).map((error) => error.property);
};

describe('IsStringRecord', () => {
  it('accepts a non-empty object of string values', () => {
    expect(errorsFor({ apiToken: 'secret' })).toEqual([]);
  });

  it('rejects an empty object', () => {
    expect(errorsFor({})).toContain('values');
  });

  it('rejects a non-string value', () => {
    expect(errorsFor({ apiToken: 1 })).toContain('values');
  });

  it('rejects an array', () => {
    expect(errorsFor(['apiToken'])).toContain('values');
  });

  it('rejects null', () => {
    expect(errorsFor(null)).toContain('values');
  });
});
