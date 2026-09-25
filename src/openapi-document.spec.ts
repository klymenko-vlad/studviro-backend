import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Checks on the published document itself, for mistakes no response in a test may
 * happen to exercise.
 */
describe('openapi.json', () => {
  const document: unknown = JSON.parse(
    readFileSync(join(__dirname, '../openapi.json'), 'utf8'),
  );

  it('lists null in every nullable enum, which is the only way the client admits it', () => {
    // OpenAPI 3.0.3: `nullable` does not add null to an `enum`, and the client's
    // generator reads it that way. `enum: [...VALUES, null]` is how a DTO says it.
    const offenders: string[] = [];

    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((child, index) => {
          walk(child, `${path}/${index}`);
        });
        return;
      }
      if (node === null || typeof node !== 'object') return;

      const schema = node as Record<string, unknown>;
      if (
        schema.nullable === true &&
        Array.isArray(schema.enum) &&
        !schema.enum.includes(null)
      ) {
        offenders.push(path);
      }

      for (const [key, child] of Object.entries(schema)) walk(child, `${path}/${key}`);
    };

    walk(document, '');

    expect(offenders).toEqual([]);
  });
});
