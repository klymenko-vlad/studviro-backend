/**
 * A deliberately small delimited-text reader.
 *
 * An institution's bulk data arrives pasted out of a spreadsheet, which means
 * tab-separated as often as comma-separated, sometimes with quoted fields and
 * a BOM on the front. It does not arrive as a CSV dialect anybody agreed on,
 * so this reads the common shape and reports what it cannot rather than
 * pulling in a parser and its configuration surface.
 */
export interface ParsedRows {
  readonly headers: string[];
  readonly rows: { readonly line: number; readonly values: Record<string, string> }[];
}

export class BulkParseError extends Error {}

export function parseDelimited(text: string): ParsedRows {
  // The escape rather than the literal character: a BOM in source is
  // invisible, and the linter is right to refuse it.
  const cleaned = text
    .replaceAll('\r\n', '\n')
    .replace(/^\uFEFF/u, '')
    .trim();
  if (cleaned === '') throw new BulkParseError('There is nothing to import');

  const lines = cleaned.split('\n').filter((line) => line.trim() !== '');
  const first = lines[0];
  if (first === undefined) throw new BulkParseError('There is nothing to import');

  const delimiter = chooseDelimiter(first);
  const headers = splitLine(first, delimiter).map((header) =>
    header
      .trim()
      .toLowerCase()
      .replaceAll(/[\s_-]+/gu, ''),
  );

  if (new Set(headers).size !== headers.length) {
    throw new BulkParseError('Two columns have the same name');
  }

  const rows = lines.slice(1).map((line, index) => {
    const values = splitLine(line, delimiter);

    return {
      // Line 1 is the header, so the first data row is line 2 — which is what
      // the person staring at their spreadsheet sees.
      line: index + 2,
      values: Object.fromEntries(
        headers.map((header, column) => [header, (values[column] ?? '').trim()]),
      ),
    };
  });

  return { headers, rows };
}

/** Whichever of tab, semicolon or comma appears most in the header. */
function chooseDelimiter(header: string): string {
  const counts = ['\t', ';', ','].map(
    (candidate) => [candidate, header.split(candidate).length - 1] as const,
  );
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));

  return best[1] === 0 ? ',' : best[0];
}

function splitLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === delimiter && !quoted) {
      values.push(current);
      current = '';
      continue;
    }

    current += character ?? '';
  }

  values.push(current);

  return values;
}
