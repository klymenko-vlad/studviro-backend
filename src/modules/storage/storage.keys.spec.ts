import { describe, expect, it } from 'vitest';

import { StorageKeys } from './storage.keys';

const INSTITUTION = '11111111-1111-4111-8111-111111111111';

const keyFor = (filename: string, purpose = 'materials') =>
  StorageKeys.for({
    institutionId: INSTITUTION,
    purpose,
    filename,
    contentType: 'application/pdf',
  });

describe('StorageKeys', () => {
  it('puts the institution first, so a listing is never cross-tenant', () => {
    expect(keyFor('notes.pdf')).toMatch(
      new RegExp(`^institutions/${INSTITUTION}/materials/`, 'u'),
    );
  });

  it('never lets the uploaded name decide the key', () => {
    const first = keyFor('assignment.pdf');
    const second = keyFor('assignment.pdf');

    expect(first).not.toBe(second);
  });

  it('keeps the original name only as a readable trailing label', () => {
    expect(keyFor('Lecture Notes.pdf').endsWith('/lecture-notes.pdf')).toBe(true);
  });

  it('refuses to let a traversal attempt out of its prefix', () => {
    const key = keyFor('../../../etc/passwd');

    expect(key).not.toContain('..');
    expect(key.startsWith(`institutions/${INSTITUTION}/`)).toBe(true);
  });

  it('survives a name that is nothing but punctuation', () => {
    expect(keyFor('///').endsWith('/file')).toBe(true);
  });

  it('strips a newline rather than writing it into a key', () => {
    expect(keyFor('a\nb.pdf')).not.toContain('\n');
  });

  it('flattens diacritics so a key is ASCII', () => {
    expect(keyFor('Súbor Žilka.pdf').endsWith('/subor-zilka.pdf')).toBe(true);
  });

  it('truncates a very long name', () => {
    const key = keyFor(`${'a'.repeat(400)}.pdf`);
    const label = key.split('/').pop() ?? '';

    expect(label.length).toBeLessThanOrEqual(120);
  });

  it('reads the institution back out of a key', () => {
    expect(StorageKeys.institutionOf(keyFor('a.pdf'))).toBe(INSTITUTION);
    expect(StorageKeys.belongsTo(keyFor('a.pdf'), INSTITUTION)).toBe(true);
    expect(StorageKeys.belongsTo(keyFor('a.pdf'), 'someone-else')).toBe(false);
  });

  it('does not mistake a forged key for one of ours', () => {
    expect(StorageKeys.belongsTo('institutions/../secrets/x', INSTITUTION)).toBe(false);
    expect(StorageKeys.belongsTo('', INSTITUTION)).toBe(false);
  });

  it('defaults a blank purpose rather than making a double slash', () => {
    expect(keyFor('a.pdf', '!!!')).toContain('/files/');
  });
});
