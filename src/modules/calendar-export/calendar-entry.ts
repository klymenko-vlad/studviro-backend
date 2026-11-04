export const CALENDAR_ENTRY_KINDS = ['class', 'exam', 'deadline'] as const;
export type CalendarEntryKind = (typeof CALENDAR_ENTRY_KINDS)[number];

export interface CalendarEntryRef {
  kind: CalendarEntryKind;
  id: string;
}
