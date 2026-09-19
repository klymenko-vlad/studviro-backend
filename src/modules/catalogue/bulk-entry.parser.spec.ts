import { describe, expect, it } from 'vitest';

import { BulkParseError, parseDelimited } from './bulk-entry.parser';

describe('parseDelimited', () => {
  it('reads a comma-separated block', () => {
    const parsed = parseDelimited('courseCode,termCode\nINF/ALG/22,2026W');

    expect(parsed.headers).toEqual(['coursecode', 'termcode']);
    expect(parsed.rows).toEqual([
      { line: 2, values: { coursecode: 'INF/ALG/22', termcode: '2026W' } },
    ]);
  });

  it('reads what a spreadsheet actually pastes, which is tabs', () => {
    const parsed = parseDelimited('courseCode\ttermCode\nINF/ALG/22\t2026W');

    expect(parsed.rows[0]?.values).toEqual({ coursecode: 'INF/ALG/22', termcode: '2026W' });
  });

  it('reads semicolons, which is what a Slovak or German Excel writes', () => {
    const parsed = parseDelimited('courseCode;termCode\nINF/ALG/22;2026W');

    expect(parsed.rows[0]?.values.termcode).toBe('2026W');
  });

  it('does not mistake a comma inside a code for a delimiter when it is quoted', () => {
    const parsed = parseDelimited('courseCode,name\n"INF,ALG",Algorithms');

    expect(parsed.rows[0]?.values.coursecode).toBe('INF,ALG');
  });

  it('unescapes a doubled quote', () => {
    const parsed = parseDelimited('name\n"She said ""go"""');

    expect(parsed.rows[0]?.values.name).toBe('She said "go"');
  });

  it('numbers rows the way the spreadsheet does, with the header as line 1', () => {
    const parsed = parseDelimited('a\nx\ny');

    expect(parsed.rows.map((row) => row.line)).toEqual([2, 3]);
  });

  it('survives a BOM, CRLF line endings and blank lines', () => {
    const parsed = parseDelimited('﻿courseCode\r\nINF\r\n\r\nALG\r\n');

    expect(parsed.headers).toEqual(['coursecode']);
    expect(parsed.rows.map((row) => row.values.coursecode)).toEqual(['INF', 'ALG']);
  });

  it('normalises header spelling, so Course Code and course_code are one column', () => {
    expect(parseDelimited('Course Code\nx').headers).toEqual(['coursecode']);
    expect(parseDelimited('course_code\nx').headers).toEqual(['coursecode']);
  });

  it('fills a short row rather than losing alignment', () => {
    const parsed = parseDelimited('a,b,c\n1,2');

    expect(parsed.rows[0]?.values).toEqual({ a: '1', b: '2', c: '' });
  });

  it('refuses two columns with the same name rather than silently keeping one', () => {
    expect(() => parseDelimited('code,code\n1,2')).toThrow(BulkParseError);
  });

  it('refuses an empty paste', () => {
    expect(() => parseDelimited('   \n  ')).toThrow(BulkParseError);
  });
});
