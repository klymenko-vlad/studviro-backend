export interface IcalEvent {
  uid: string;
  startsAt: Date;
  endsAt: Date | null;
  summary: string;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  cancelled?: boolean;
}

export interface IcalCalendar {
  name: string;
  stamp: Date;
  events: readonly IcalEvent[];
}

const CRLF = '\r\n';
const MAX_LINE_OCTETS = 75;

export function renderIcal(calendar: IcalCalendar): string {
  const stamp = utc(calendar.stamp);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudViro//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(calendar.name)}`,
    ...calendar.events.flatMap((event) => eventLines(event, stamp)),
    'END:VCALENDAR',
  ];

  return lines.map(fold).join(CRLF) + CRLF;
}

function eventLines(event: IcalEvent, stamp: string): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${text(event.uid)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utc(event.startsAt)}`,
    ...(event.endsAt === null ? [] : [`DTEND:${utc(event.endsAt)}`]),
    `SUMMARY:${text(event.summary)}`,
    ...optional('LOCATION', event.location),
    ...optional('DESCRIPTION', event.description),
    ...(event.url ? [`URL:${event.url}`] : []),
    ...(event.cancelled ? ['STATUS:CANCELLED'] : []),
    'END:VEVENT',
  ];
}

function optional(name: string, value: string | null | undefined): string[] {
  return value ? [`${name}:${text(value)}`] : [];
}

function utc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function text(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('')
    .filter(isPrintable)
    .join('')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function isPrintable(character: string): boolean {
  const code = character.charCodeAt(0);

  return character === '\n' || (code > 0x1f && code !== 0x7f);
}

function fold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= MAX_LINE_OCTETS) return line;

  const parts: string[] = [];
  let current = '';
  let octets = 0;
  // Continuation lines start with a space, which counts against their 75 octets.
  let limit = MAX_LINE_OCTETS;

  for (const character of line) {
    const size = Buffer.byteLength(character, 'utf8');
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += character;
    octets += size;
  }
  parts.push(current);

  return parts.join(`${CRLF} `);
}
