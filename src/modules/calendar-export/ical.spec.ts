import { describe, expect, it } from 'vitest';

import { renderIcal, type IcalEvent } from './ical';

const STAMP = new Date('2026-10-18T10:00:00.000Z');

const lecture: IcalEvent = {
  uid: 'timetable-1@studviro',
  startsAt: new Date('2026-10-20T08:00:00.000Z'),
  endsAt: new Date('2026-10-20T09:30:00.000Z'),
  summary: 'Algorithms – lecture',
};

const render = (events: IcalEvent[]) =>
  renderIcal({ name: 'StudViro – Ada', stamp: STAMP, events });

/** Undoes line folding, so assertions read logical lines. */
const unfold = (ics: string) => ics.replaceAll('\r\n ', '').split('\r\n');

describe('renderIcal', () => {
  it('wraps the events in one VCALENDAR that names its producer and version', () => {
    const lines = unfold(render([lecture]));

    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines.some((line) => line.startsWith('PRODID:'))).toBe(true);
    expect(lines).toContain('X-WR-CALNAME:StudViro – Ada');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
    expect(lines.at(-1)).toBe('');
  });

  it('ends every line with CRLF, as RFC 5545 requires', () => {
    const ics = render([lecture]);

    expect(ics.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
  });

  it('writes an event in UTC with a stable UID and a stamp', () => {
    const lines = unfold(render([lecture]));

    expect(lines).toEqual(
      expect.arrayContaining([
        'BEGIN:VEVENT',
        'UID:timetable-1@studviro',
        'DTSTAMP:20261018T100000Z',
        'DTSTART:20261020T080000Z',
        'DTEND:20261020T093000Z',
        'SUMMARY:Algorithms – lecture',
        'END:VEVENT',
      ]),
    );
  });

  it('leaves DTEND out of a deadline, which is a moment rather than a span', () => {
    const lines = unfold(render([{ ...lecture, endsAt: null }]));

    expect(lines.some((line) => line.startsWith('DTEND'))).toBe(false);
  });

  it('marks a cancelled event as cancelled instead of dropping it', () => {
    const lines = unfold(render([{ ...lecture, cancelled: true }]));

    expect(lines).toContain('STATUS:CANCELLED');
  });

  it('escapes the characters TEXT values reserve', () => {
    const lines = unfold(
      render([
        {
          ...lecture,
          summary: 'Seminar; group A, B',
          location: 'Room P1\\2',
          description: 'First line\nsecond line',
        },
      ]),
    );

    expect(lines).toContain('SUMMARY:Seminar\\; group A\\, B');
    expect(lines).toContain('LOCATION:Room P1\\\\2');
    expect(lines).toContain('DESCRIPTION:First line\\nsecond line');
  });

  it('folds a line longer than 75 octets, counting bytes rather than characters', () => {
    const ics = render([{ ...lecture, description: 'ľščťžýáíé'.repeat(20) }]);

    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(unfold(ics)).toContain(`DESCRIPTION:${'ľščťžýáíé'.repeat(20)}`);
  });

  it('never splits a character across a fold', () => {
    const ics = render([{ ...lecture, summary: '€'.repeat(60) }]);

    expect(ics).not.toContain('�');
    expect(unfold(ics)).toContain(`SUMMARY:${'€'.repeat(60)}`);
  });

  it('escapes a bare carriage return and drops other control characters', () => {
    const lines = unfold(render([{ ...lecture, summary: 'Bad\rtitle\u0007\u0000' }]));

    expect(lines).toContain('SUMMARY:Bad\\ntitle');
  });

  it('is a valid empty calendar when there is nothing to show', () => {
    const lines = unfold(render([]));

    expect(lines).not.toContain('BEGIN:VEVENT');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
  });
});
