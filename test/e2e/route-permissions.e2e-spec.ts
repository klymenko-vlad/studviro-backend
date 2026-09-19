import { RequestMethod } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PERMISSION_KEY } from '../../src/modules/authorization/decorators/require-permission.decorator';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

/**
 * `PermissionsGuard` is opt-in: a route that declares no requirement is let
 * through. That is the ordinary Nest pattern, and it is why
 * `backend/AGENTS.md` insists on `@RequirePermission` from day one — but an
 * insistence is a habit, and habits lapse.
 *
 * This turns the habit into a gate. Every route mounted under an institution
 * serves that institution's canonical data, so every one must declare a
 * permission scoped to the institution in its own path. A route added without
 * one fails here instead of in production.
 */
/**
 * The two routes that check their permission in the service instead, and why.
 * Granting and revoking a role are checked at *the scope being granted on* —
 * an org unit, a programme, an offering — not at the institution in the path
 * (ADR 0016, defect B13). A `@RequirePermission` here would check the wrong
 * scope and would be weaker than what the service already does.
 */
const CHECKED_IN_THE_SERVICE: readonly string[] = [
  'POST /institutions/:institutionId/role-assignments/',
  'DELETE /institutions/:institutionId/role-assignments/:id',
];

interface DescribedRoute {
  readonly method: string;
  readonly path: string;
  readonly requirement?: { permission: string; scopeType: string; param: string };
}

describe('Route permissions (e2e)', () => {
  let harness: TestHarness;
  let routes: DescribedRoute[];

  beforeAll(async () => {
    harness = await createTestHarness();
    routes = describeRoutes(harness.app.get(ModulesContainer));
  });

  afterAll(async () => {
    await harness.close();
  });

  const institutionRoutes = () =>
    routes.filter((route) => route.path.includes(':institutionId'));

  it('finds the institution-scoped routes at all', () => {
    expect(institutionRoutes().length).toBeGreaterThan(20);
  });

  it('gates every one of them on a permission', () => {
    const ungated = institutionRoutes()
      .filter((route) => !CHECKED_IN_THE_SERVICE.includes(`${route.method} ${route.path}`))
      .filter((route) => route.requirement === undefined)
      .map((route) => `${route.method} ${route.path}`);

    expect(ungated).toEqual([]);
  });

  it('scopes every one of them to the institution in its own path', () => {
    const misscoped = institutionRoutes()
      .filter((route) => route.requirement !== undefined)
      .filter(
        (route) =>
          route.requirement?.scopeType !== 'institution' ||
          route.requirement.param !== 'institutionId',
      )
      .map((route) => `${route.method} ${route.path}`);

    expect(misscoped).toEqual([]);
  });
});

/**
 * Read off Nest's controller metadata rather than Fastify's route table: the
 * decorator is the thing under assertion, and the router only knows paths.
 */
function describeRoutes(modules: ModulesContainer): DescribedRoute[] {
  return [...modules.values()]
    .flatMap((module) => [...module.controllers.values()])
    .flatMap((wrapper) => {
      const controller = wrapper.metatype;

      return typeof controller === 'function'
        ? routesOf(controller as new (...args: never[]) => object)
        : [];
    });
}

/** Nest stores the verb as a `RequestMethod` ordinal; a failure must name it. */
function methodName(value: unknown): string {
  if (typeof value === 'number') return RequestMethod[value] ?? `method ${value}`;

  return typeof value === 'string' ? value : 'unknown';
}

function routesOf(controller: new (...args: never[]) => object): DescribedRoute[] {
  const prototype: object = controller.prototype;
  const controllerPath = (Reflect.getMetadata('path', controller) as string | undefined) ?? '';

  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .flatMap((name): DescribedRoute[] => {
      const handler = (prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function') return [];

      const methodPath = Reflect.getMetadata('path', handler) as string | undefined;
      if (methodPath === undefined) return [];

      const requirement = (Reflect.getMetadata(PERMISSION_KEY, handler) ??
        Reflect.getMetadata(PERMISSION_KEY, controller)) as
        DescribedRoute['requirement'] | undefined;

      return [
        {
          method: methodName(Reflect.getMetadata('method', handler)),
          path: `/${controllerPath}/${methodPath}`.replaceAll(/\/{2,}/gu, '/'),
          requirement,
        },
      ];
    });
}
