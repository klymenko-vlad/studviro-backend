import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { IsKeyedRecord } from './is-keyed-record.validator';

class Subject {
  @IsKeyedRecord(['faculty', 'course'], 'nullableString')
  labels?: unknown;

  @IsKeyedRecord(['fees'], 'boolean')
  flags?: unknown;
}

const errorsFor = (values: Partial<Subject>): string[] => {
  const subject = Object.assign(new Subject(), values);

  return validateSync(subject).map((error) => error.property);
};

describe('IsKeyedRecord', () => {
  it('accepts a record whose keys are all in the catalogue', () => {
    expect(errorsFor({ labels: { faculty: 'School' }, flags: { fees: true } })).toEqual([]);
  });

  it('accepts null as a way of clearing a string entry', () => {
    expect(errorsFor({ labels: { faculty: null }, flags: {} })).toEqual([]);
  });

  it('rejects a key outside the catalogue', () => {
    expect(errorsFor({ labels: { mascot: 'Ada' }, flags: {} })).toContain('labels');
  });

  it('rejects a value of the wrong type', () => {
    expect(errorsFor({ labels: {}, flags: { fees: 'yes' } })).toContain('flags');
  });

  it('rejects an over-long string', () => {
    expect(errorsFor({ labels: { faculty: 'x'.repeat(65) }, flags: {} })).toContain('labels');
  });

  it('rejects anything that is not a plain object', () => {
    expect(errorsFor({ labels: ['faculty'], flags: {} })).toContain('labels');
  });
});
