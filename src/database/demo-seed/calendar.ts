const MILLISECONDS_PER_DAY = 86_400_000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MILLISECONDS_PER_DAY);
}

export function addWeeks(from: Date, weeks: number): Date {
  return addDays(from, weeks * 7);
}

export function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 3_600_000);
}

export function atUtcHour(day: Date, hour: number): Date {
  const at = new Date(day.getTime());
  at.setUTCHours(hour, 0, 0, 0);

  return at;
}

export function startOfAcademicYear(anchor: Date, yearOffset: number): Date {
  const start = new Date(Date.UTC(anchor.getUTCFullYear() + yearOffset, 8, 21));

  return atUtcHour(start, 0);
}
