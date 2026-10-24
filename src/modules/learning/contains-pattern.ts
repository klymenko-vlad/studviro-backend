import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

export function containsText(
  columns: readonly AnyColumn[],
  q: string | undefined,
): SQL | undefined {
  const search = q?.trim();
  if (!search) return undefined;

  const pattern = `%${search.replaceAll(/[\\%_]/gu, (match) => `\\${match}`)}%`;

  return sql`(${sql.join(
    columns.map((column) => sql`${column} ilike ${pattern}`),
    sql` or `,
  )})`;
}
