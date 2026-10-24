export interface DateShift {
  readonly milliseconds: number;
  readonly days: number;
  readonly sourceStartsAt: Date | null;
  readonly targetStartsAt: Date | null;
  readonly applied: boolean;
}

const DAY_MS = 86_400_000;

export function dateShiftBetween(
  sourceStartsAt: Date | null,
  targetStartsAt: Date | null,
): DateShift {
  if (sourceStartsAt === null || targetStartsAt === null) {
    return { milliseconds: 0, days: 0, sourceStartsAt, targetStartsAt, applied: false };
  }

  const milliseconds = targetStartsAt.getTime() - sourceStartsAt.getTime();

  return {
    milliseconds,
    days: Math.round((milliseconds / DAY_MS) * 100) / 100,
    sourceStartsAt,
    targetStartsAt,
    applied: true,
  };
}

export function shiftDate(date: Date | null, milliseconds: number): Date | null {
  return date === null ? null : new Date(date.getTime() + milliseconds);
}
