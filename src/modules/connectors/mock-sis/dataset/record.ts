import type { ConnectorRecord } from '../../connector.types';
import { addDays, addHours } from '../calendar';

const PHASE_OFFSET_DAYS = {
  structure: -210,
  delivery: -60,
  schedule: -20,
} as const;

export type StampPhase = keyof typeof PHASE_OFFSET_DAYS;

const SPREAD_HOURS = 240;

export function stamp(anchor: Date, phase: StampPhase, index: number): Date {
  return addHours(addDays(anchor, PHASE_OFFSET_DAYS[phase]), index % SPREAD_HOURS);
}

export function record<TData>(
  externalId: string,
  sourceUpdatedAt: Date,
  data: TData,
): ConnectorRecord<TData> {
  return {
    externalId,
    sourceVersion: sourceUpdatedAt.toISOString(),
    sourceUpdatedAt,
    deleted: false,
    data,
  };
}
