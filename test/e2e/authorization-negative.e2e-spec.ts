import { RequestMethod } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  institutions,
  programs,
  roleAssignments,
} from '../../src/database/schema';
import { PERMISSION_KEY } from '../../src/modules/authorization/decorators/require-permission.decorator';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

/**
 * The tests every other spec assumes somebody else wrote.
 *
 * Each feature spec proves its own happy path and usually one refusal. This
 * one asks the questions that cut across all of them: does an anonymous
 * caller get anywhere, does a signed-in caller with no role at an institution
 * see anything of it, can one institution reach another's rows, and does a
 * forged or expired token work. Those are the failures that matter most and
 * the ones least likely to be noticed by a spec written to demonstrate a
 * feature.
 */
describe('Authorization, negatively (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let otherInstitutionId: string;
  let offeringId: string;
  let programId: string;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    const [ours, theirs] = await harness.db
      .insert(institutions)
      .values([
        { code: 'upjs', name: 'UPJŠ' },
        { code: 'stu', name: 'STU' },
      ])
      .returning();
    institutionId = ours!.id;
    otherInstitutionId = theirs!.id;

    const [course] = await harness.db
      .insert(courses)
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms' })
      .returning();
    const [term] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId,
        code: '2026W',
        name: 'Winter 2026/2027',
        academicYear: '2026/2027',
        startsAt: new Date('2026-09-21T00:00:00.000Z'),
        endsAt: new Date('2027-02-14T00:00:00.000Z'),
      })
      .returning();
    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: course!.id, academicTermId: term!.id })
      .returning();
    offeringId = offering!.id;

    const [program] = await harness.db
      .insert(programs)
      .values({ institutionId, code: 'INF-BC', name: 'Informatics' })
      .returning();
    programId = program!.id;
  });

  /** Every institution-scoped route the app actually mounts, with its verb. */
  const institutionRoutes = (): { method: string; url: string }[] => {
    const modules = harness.app.get(ModulesContainer);

    return [...modules.values()]
      .flatMap((module) => [...module.controllers.values()])
      .flatMap((wrapper) => {
        const controller = wrapper.metatype;
        if (typeof controller !== 'function') return [];

        const prototype: object = controller.prototype;
        const controllerPath =
          (Reflect.getMetadata('path', controller) as string | undefined) ?? '';

        return Object.getOwnPropertyNames(prototype)
          .filter((name) => name !== 'constructor')
          .flatMap((name) => {
            const handler = (prototype as Record<string, unknown>)[name];
            if (typeof handler !== 'function') return [];

            const methodPath = Reflect.getMetadata('path', handler) as string | undefined;
            if (methodPath === undefined) return [];

            const requirement: unknown = Reflect.getMetadata(PERMISSION_KEY, handler);
            if (requirement === undefined) return [];

            const verb = Reflect.getMetadata('method', handler) as number;
            // A trailing slash is a different route to Fastify, and every
            // one of these would answer 404 instead of 401 — which would read
            // as a pass for the wrong reason.
            const path = `/${controllerPath}/${methodPath}`
              .replaceAll(/\/{2,}/gu, '/')
              .replace(/\/$/u, '');
            if (!path.includes(':institutionId')) return [];

            return [
              {
                method: RequestMethod[verb] ?? 'GET',
                url: `/api/v1${path}`
                  .replaceAll(':institutionId', institutionId)
                  .replaceAll(/:[A-Za-z]+/gu, '11111111-1111-4111-8111-111111111111'),
              },
            ];
          });
      });
  };

  it('turns every institution-scoped route away from an anonymous caller', async () => {
    const routes = institutionRoutes();
    expect(routes.length).toBeGreaterThan(30);

    const allowed: string[] = [];
    for (const route of routes) {
      const response = await harness.inject({
        method: route.method as 'GET',
        url: route.url,
        payload: route.method === 'GET' || route.method === 'DELETE' ? undefined : {},
      });

      if (response.statusCode !== 401) {
        allowed.push(`${route.method} ${route.url} -> ${response.statusCode}`);
      }
    }

    expect(allowed).toEqual([]);
  });

  it('turns every one of them away from a signed-in stranger to the institution', async () => {
    const stranger = await harness.actingAs({ email: 'stranger@example.com' });
    const routes = institutionRoutes();

    const leaked: string[] = [];
    for (const route of routes) {
      const response = await harness.inject({
        method: route.method as 'GET',
        url: route.url,
        headers: stranger.headers,
        payload: route.method === 'GET' || route.method === 'DELETE' ? undefined : {},
      });

      // 403 is the right answer; 400 and 404 are acceptable when the route
      // never reaches the guard's subject. Anything 2xx is a leak.
      if (response.statusCode < 400) {
        leaked.push(`${route.method} ${route.url} -> ${response.statusCode}`);
      }
    }

    expect(leaked).toEqual([]);
  });

  it('refuses a forged bearer token', async () => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/academic-terms`,
      headers: { authorization: 'Bearer not.a.real.token' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('refuses a token signed with the wrong secret', async () => {
    // A well-formed JWT whose signature was produced by somebody else.
    const forged = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ',
      'ZmFrZS1zaWduYXR1cmU',
    ].join('.');

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/academic-terms`,
      headers: { authorization: `Bearer ${forged}` },
    });

    expect(response.statusCode).toBe(401);
  });

  describe('one institution cannot reach another', () => {
    const grant = async (userId: string, where: string) => {
      await harness.db.insert(roleAssignments).values({
        institutionId: where,
        userId,
        role: 'institution_admin',
        scopeType: 'institution',
        scopeId: null,
      });
    };

    it('will not let an admin of one read the other’s catalogue', async () => {
      const admin = await harness.actingAs({ email: 'ouradmin@example.com' });
      await grant(admin.user.id, institutionId);

      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${otherInstitutionId}/academic-terms`,
        headers: admin.headers,
      });

      expect(response.statusCode).toBe(403);
    });

    it('will not let them address our resource through their institution’s path', async () => {
      const theirAdmin = await harness.actingAs({ email: 'theiradmin@example.com' });
      await grant(theirAdmin.user.id, otherInstitutionId);

      // The path says their institution — which they do administer — but the
      // offering id is ours. The scope check passes; the row lookup must not.
      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${otherInstitutionId}/course-offerings/${offeringId}/teaching`,
        headers: theirAdmin.headers,
      });

      expect(response.statusCode).toBe(404);
    });

    it('will not let them admit somebody to our programme the same way', async () => {
      const theirAdmin = await harness.actingAs({ email: 'theiradmin2@example.com' });
      await grant(theirAdmin.user.id, otherInstitutionId);

      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${otherInstitutionId}/programs/${programId}/members`,
        headers: theirAdmin.headers,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('a role is not a bigger role', () => {
    const as = async (role: 'student' | 'registrar' | 'teacher', email: string) => {
      const actor = await harness.actingAs({ email });
      if (role !== 'student' && role !== 'teacher') {
        await harness.db.insert(roleAssignments).values({
          institutionId,
          userId: actor.user.id,
          role,
          scopeType: 'institution',
          scopeId: null,
        });
      }

      return actor;
    };

    it('does not let a registrar administer the institution', async () => {
      const registrar = await as('registrar', 'reg@example.com');

      const response = await harness.inject({
        method: 'POST',
        url: `/api/v1/institutions/${institutionId}/academic-terms`,
        headers: registrar.headers,
        payload: {
          code: '2027W',
          name: 'Winter',
          academicYear: '2027/2028',
          startsAt: '2027-09-20T00:00:00.000Z',
          endsAt: '2028-02-13T00:00:00.000Z',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('does not let a registrar read the audit trail', async () => {
      const registrar = await as('registrar', 'reg2@example.com');

      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/audit-events`,
        headers: registrar.headers,
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
