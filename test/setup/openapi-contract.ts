import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Ajv, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Holds every successful e2e response to the schema `openapi.json` publishes for it.
 *
 * The client's API layer is generated from that document and validates what it
 * receives, so a response that drifts from its own schema is refused in the
 * browser — "could not be loaded" on a 200 — while every server test stays green.
 * Checking here puts the failure where the drift is.
 */

interface Operation {
  readonly method: string;
  readonly pattern: RegExp;
  /** Literal segments first, so `/me/deadlines` wins over `/{id}/deadlines`. */
  readonly params: number;
  readonly responses: Record<
    string,
    { content?: { 'application/json'?: { schema?: unknown } } }
  >;
  readonly id: string;
}

type Schema = Record<string, unknown>;

interface DocumentOperation {
  readonly operationId?: string;
  readonly responses?: Operation['responses'];
}

const document = JSON.parse(readFileSync(join(__dirname, '../../openapi.json'), 'utf8')) as {
  paths: Record<string, Record<string, DocumentOperation>>;
  components: Schema;
};

/**
 * OpenAPI 3.0's `nullable` sits beside `type`, and Ajv honours it only there — not
 * across an `allOf` of a `$ref`, which is how a nullable nested DTO is written.
 * Rewriting it as `anyOf: [null, …]` means the same thing to both.
 */
function normalise(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(normalise);
  if (schema === null || typeof schema !== 'object') return schema;

  const { nullable, ...rest } = schema as Schema;
  const walked = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [key, normalise(value)]),
  );

  return nullable === true ? { anyOf: [{ type: 'null' }, walked] } : walked;
}

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ components: normalise(document.components) }, 'openapi.json');

const operations: Operation[] = Object.entries(document.paths)
  .flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${path.replace(/\{[^}]+\}/g, '[^/]+')}$`),
      params: (path.match(/\{/g) ?? []).length,
      responses: operation.responses ?? {},
      id: operation.operationId ?? `${method} ${path}`,
    })),
  )
  .sort((a, b) => a.params - b.params);

const validators = new Map<string, ValidateFunction | null>();

function validatorFor(operation: Operation, status: number): ValidateFunction | null {
  const key = `${operation.id} ${status}`;
  if (validators.has(key)) return validators.get(key)!;

  const schema = (operation.responses[String(status)] ?? operation.responses.default)
    ?.content?.['application/json']?.schema;

  const validate =
    schema === undefined
      ? null
      : ajv.compile(
          JSON.parse(
            JSON.stringify(normalise(schema)).replaceAll(
              '"#/components/',
              '"openapi.json#/components/',
            ),
          ) as Schema,
        );

  validators.set(key, validate);

  return validate;
}

export function assertMatchesContract(
  method: string,
  url: string,
  response: { statusCode: number; headers: Record<string, unknown>; body: string },
): void {
  if (response.statusCode < 200 || response.statusCode >= 300) return;
  const contentType = response.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.includes('application/json')) return;
  // A compressed body is the transport's to test, not the contract's.
  if (response.headers['content-encoding'] !== undefined) return;

  const path = url.split('?')[0]!;
  const operation = operations.find(
    (candidate) => candidate.method === method.toUpperCase() && candidate.pattern.test(path),
  );
  if (!operation) return;

  const validate = validatorFor(operation, response.statusCode);
  if (!validate) return;

  const body: unknown = JSON.parse(response.body);
  if (validate(body)) return;

  throw new Error(
    `${method.toUpperCase()} ${path} (${operation.id}) answered ${response.statusCode} with a body ` +
      `its OpenAPI schema refuses — the generated client would reject it:\n` +
      ajv.errorsText(validate.errors, { separator: '\n' }),
  );
}
