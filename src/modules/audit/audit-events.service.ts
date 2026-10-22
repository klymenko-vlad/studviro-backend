import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';

import { CursorPageDto, CursorPageMetaDto } from '../../common/dto/pagination.dto';
import { decodeCursor, encodeCursor } from '../../database/repository/cursor';
import { auditEvents, type AuditEvent } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { ListAuditEventsQueryDto } from './dto/list-audit-events.query.dto';

@Injectable()
export class AuditEventsService {
  constructor(private readonly txHost: TransactionHost) {}

  async list(
    institutionId: string,
    query: ListAuditEventsQueryDto,
  ): Promise<CursorPageDto<AuditEvent>> {
    const direction = query.order === 'asc' ? asc : desc;
    const filters = [
      eq(auditEvents.institutionId, institutionId),
      ...this.narrowings(query),
      ...(query.cursor ? [this.keyset(query.cursor, query.order === 'asc')] : []),
    ];

    const rows = (await this.txHost
      .reader()
      .select()
      .from(auditEvents)
      .where(and(...filters))
      .orderBy(direction(auditEvents.occurredAt), direction(auditEvents.id))
      .limit(query.limit + 1)) as AuditEvent[];

    const hasNextPage = rows.length > query.limit;
    const items = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = items.at(-1);

    return new CursorPageDto(
      items,
      new CursorPageMetaDto(
        query.limit,
        hasNextPage,
        hasNextPage && last ? encodeCursor({ value: last.occurredAt, id: last.id }) : null,
      ),
    );
  }

  private narrowings(query: ListAuditEventsQueryDto): SQL[] {
    return [
      query.action ? eq(auditEvents.action, query.action) : undefined,
      query.subjectType ? eq(auditEvents.subjectType, query.subjectType) : undefined,
      query.subjectId ? eq(auditEvents.subjectId, query.subjectId) : undefined,
      query.actorUserId ? eq(auditEvents.actorUserId, query.actorUserId) : undefined,
    ].filter((filter): filter is SQL => filter !== undefined);
  }

  private keyset(cursor: string, ascending: boolean): SQL {
    const { value, id } = decodeCursor(cursor);
    const at = sql`${value instanceof Date ? value.toISOString() : value}::timestamptz`;
    const tiebreak = sql`${id}::uuid`;

    return ascending
      ? sql`(${auditEvents.occurredAt}, ${auditEvents.id}) > (${at}, ${tiebreak})`
      : sql`(${auditEvents.occurredAt}, ${auditEvents.id}) < (${at}, ${tiebreak})`;
  }
}
