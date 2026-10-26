import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  auditEvents,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  roleAssignments,
  teachingAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { StorageService } from '../../src/modules/storage/storage.service';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { putToStore } from '../setup/learning-fixture';

interface Actor {
  user: { id: string };
  headers: { authorization: string };
}

interface PostBody {
  id: string;
  body: string | null;
  state: 'visible' | 'hidden' | 'deleted';
  mine: boolean;
  editedAt: string | null;
  attachments: { id: string; filename: string; sizeBytes: number }[];
  author: { displayName: string; isTeacher: boolean };
  parentPostId: string | null;
  replyCount: number;
  quote: {
    postId: string;
    excerpt: string | null;
    state: string;
    author: { displayName: string };
  } | null;
}

interface Page<T> {
  items: T[];
  meta: { hasNextPage: boolean; nextCursor: string | null };
}

interface ThreadBody {
  id: string;
  title: string;
  postCount: number;
  hidden: boolean;
  canModerate: boolean;
}

describe('Course discussion (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;
  let otherOfferingId: string;
  let student: Actor;
  let classmate: Actor;
  let teacher: Actor;

  const actingAs = async (role: CanonicalRole): Promise<Actor> => {
    const actor = await harness.actingAs();
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId: actor.user.id,
      role,
      scopeType: 'institution',
      scopeId: null,
    });

    return actor;
  };

  const enrol = (userId: string, courseOfferingId = offeringId) =>
    harness.db
      .insert(enrollments)
      .values({ institutionId, userId, courseOfferingId, status: 'active' });

  const base = (offering = offeringId) =>
    `/api/v1/institutions/${institutionId}/course-offerings/${offering}/discussion/threads`;

  const call = (
    actor: Actor | null,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    payload?: object,
  ) =>
    harness.inject({
      method,
      url: path,
      ...(actor ? { headers: actor.headers } : {}),
      ...(payload ? { payload } : {}),
    });

  const postsOf = async (actor: Actor, threadId: string, query = '') => {
    const response = await call(actor, 'GET', `${base()}/${threadId}/posts${query}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<Page<PostBody>>();
  };

  const repliesTo = async (actor: Actor, threadId: string, postId: string, query = '') => {
    const response = await call(
      actor,
      'GET',
      `${base()}/${threadId}/posts/${postId}/replies${query}`,
    );
    expect(response.statusCode, response.body).toBe(200);
    return response.json<Page<PostBody>>();
  };

  const read = async (actor: Actor, threadId: string) => {
    const response = await call(actor, 'GET', `${base()}/${threadId}`);
    expect(response.statusCode, response.body).toBe(200);
    return { ...response.json<ThreadBody>(), posts: (await postsOf(actor, threadId)).items };
  };

  const answer = async (
    actor: Actor,
    threadId: string,
    body: string,
    replyToPostId?: string,
  ) => {
    const response = await call(actor, 'POST', `${base()}/${threadId}/posts`, {
      body,
      ...(replyToPostId ? { replyToPostId } : {}),
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<PostBody>();
  };

  const start = async (actor: Actor, title = 'Question 3', body = 'What does stable mean?') => {
    const response = await call(actor, 'POST', base(), { title, body });
    expect(response.statusCode, response.body).toBe(201);
    return read(actor, response.json<ThreadBody>().id);
  };

  const inbox = async (actor: Actor) =>
    (await call(actor, 'GET', `/api/v1/institutions/${institutionId}/me/notifications`)).json<
      { type: string; courseCode: string | null }[]
    >();

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    const [institution] = await harness.db
      .insert(institutions)
      .values({ code: 'ukf', name: 'UKF' })
      .returning();
    institutionId = institution!.id;

    const [term] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId,
        code: '2026W',
        name: 'Winter 2026',
        academicYear: '2026/2027',
        startsAt: new Date('2026-09-21T00:00:00.000Z'),
        endsAt: new Date('2027-02-08T00:00:00.000Z'),
      })
      .returning();

    const [algorithms, databases] = await harness.db
      .insert(courses)
      .values([
        { institutionId, code: 'INF/ALG', title: 'Algorithms' },
        { institutionId, code: 'INF/DB', title: 'Databases' },
      ])
      .returning();

    const offerings = await harness.db
      .insert(courseOfferings)
      .values(
        [algorithms!, databases!].map((course) => ({
          institutionId,
          courseId: course.id,
          academicTermId: term!.id,
          status: 'running' as const,
        })),
      )
      .returning();
    offeringId = offerings[0]!.id;
    otherOfferingId = offerings[1]!.id;

    student = await actingAs('student');
    classmate = await actingAs('student');
    teacher = await actingAs('teacher');
    await enrol(student.user.id);
    await enrol(classmate.user.id);
    await harness.db.insert(teachingAssignments).values({
      institutionId,
      userId: teacher.user.id,
      courseOfferingId: offeringId,
      role: 'lecturer',
    });
  });

  it('lets a student start a thread that classmates read and answer', async () => {
    const thread = await start(student);

    const reply = await call(classmate, 'POST', `${base()}/${thread.id}/posts`, {
      body: 'It keeps equal keys in their original order.',
    });
    expect(reply.statusCode).toBe(201);

    await call(teacher, 'POST', `${base()}/${thread.id}/posts`, { body: 'Yes, exactly.' });

    const seen = await read(student, thread.id);
    expect(seen.posts.map((post) => post.author.isTeacher)).toEqual([false, false, true]);
    expect(seen.posts.map((post) => post.body)).toEqual([
      'What does stable mean?',
      'It keeps equal keys in their original order.',
      'Yes, exactly.',
    ]);
    expect(seen.posts[0]!.mine).toBe(true);
    expect(seen.canModerate).toBe(false);

    const list = (await call(classmate, 'GET', base())).json<Page<ThreadBody>>();
    expect(list.items).toMatchObject([{ title: 'Question 3', postCount: 3 }]);
  });

  it('tells the teacher about a new thread and the people in it about a reply', async () => {
    const thread = await start(student);
    await call(classmate, 'POST', `${base()}/${thread.id}/posts`, { body: 'Same question.' });

    expect(await inbox(teacher)).toMatchObject([
      { type: 'discussion_thread_started', courseCode: 'INF/ALG' },
    ]);
    expect(await inbox(student)).toMatchObject([{ type: 'discussion_reply' }]);
    expect(await inbox(classmate)).toEqual([]);
  });

  it('keeps the discussion from anyone not taking or teaching the course', async () => {
    const outsider = await actingAs('student');
    await enrol(outsider.user.id, otherOfferingId);
    const thread = await start(student);

    for (const [method, path, payload] of [
      ['GET', base(), undefined],
      ['GET', `${base()}/${thread.id}`, undefined],
      ['GET', `${base()}/${thread.id}/posts`, undefined],
      ['GET', `${base()}/${thread.id}/posts/${thread.posts[0]!.id}/replies`, undefined],
      ['POST', base(), { title: 'x', body: 'y' }],
      ['POST', `${base()}/${thread.id}/posts`, { body: 'y' }],
    ] as const) {
      expect((await call(outsider, method, path, payload)).statusCode).toBe(403);
    }
    expect((await call(null, 'GET', base())).statusCode).toBe(401);
  });

  it('does not let a thread be read through another course’s address', async () => {
    await enrol(student.user.id, otherOfferingId);
    const thread = await start(student);

    expect(
      (await call(student, 'GET', `${base(otherOfferingId)}/${thread.id}`)).statusCode,
    ).toBe(404);
  });

  it('lets an author delete their own post and nobody else’s', async () => {
    const thread = await start(student);
    const opening = thread.posts[0]!;

    expect(
      (await call(classmate, 'DELETE', `${base()}/${thread.id}/posts/${opening.id}`))
        .statusCode,
    ).toBe(403);
    expect(
      (await call(student, 'DELETE', `${base()}/${thread.id}/posts/${opening.id}`)).statusCode,
    ).toBe(204);

    const seen = await read(teacher, thread.id);
    expect(seen.posts[0]).toMatchObject({ state: 'deleted', body: null });
  });

  it('lets an author correct their own post and thread title, marked as edited', async () => {
    const thread = await start(student);
    const opening = thread.posts[0]!;
    const post = `${base()}/${thread.id}/posts/${opening.id}`;
    expect(opening.editedAt).toBeNull();

    expect((await call(classmate, 'PATCH', post, { body: 'mine now' })).statusCode).toBe(403);
    expect((await call(teacher, 'PATCH', post, { body: 'mine now' })).statusCode).toBe(403);
    expect((await call(student, 'PATCH', post, { body: '  ' })).statusCode).toBe(400);

    const edited = await call(student, 'PATCH', post, { body: 'What does stable mean here?' });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json<PostBody>()).toMatchObject({
      body: 'What does stable mean here?',
      editedAt: expect.any(String),
    });

    expect(
      (await call(classmate, 'PATCH', `${base()}/${thread.id}`, { title: 'Hijacked' }))
        .statusCode,
    ).toBe(403);
    const renamed = await call(student, 'PATCH', `${base()}/${thread.id}`, {
      title: 'Question 3: stability',
    });
    expect(renamed.json<ThreadBody>().title).toBe('Question 3: stability');
  });

  it('refuses to edit what a teacher has hidden until it is restored', async () => {
    const thread = await start(student);
    const opening = thread.posts[0]!;
    const post = `${base()}/${thread.id}/posts/${opening.id}`;

    await call(teacher, 'PUT', `${post}/visibility`, { hidden: true });
    expect((await call(student, 'PATCH', post, { body: 'Nothing to see' })).statusCode).toBe(
      409,
    );

    await call(teacher, 'PUT', `${post}/visibility`, { hidden: false });
    expect((await call(student, 'PATCH', post, { body: 'Reworded' })).statusCode).toBe(200);

    await call(student, 'DELETE', post);
    expect((await call(student, 'PATCH', post, { body: 'Back again' })).statusCode).toBe(404);
  });

  describe('attachments', () => {
    const upload = async (actor: Actor, filename = 'graf.png', body = 'png bytes') => {
      const ticket = await call(actor, 'POST', `${base()}/attachment-tickets`, {
        filename,
        contentType: 'image/png',
      });
      expect(ticket.statusCode, ticket.body).toBe(201);
      expect(ticket.json<{ maxBytes: number }>().maxBytes).toBe(10 * 1024 * 1024);
      expect(await putToStore(ticket.json(), body)).toBe(200);

      return { storageKey: ticket.json<{ key: string }>().key, filename };
    };

    const download = async (actor: Actor, threadId: string, post: PostBody) =>
      call(
        actor,
        'GET',
        `${base()}/${threadId}/posts/${post.id}/attachments/${post.attachments[0]!.id}/download`,
      );

    it('carries a file on a post that the course can download', async () => {
      const file = await upload(student);
      const created = await call(student, 'POST', base(), {
        title: 'Graf k úlohe 3',
        body: 'Prečo mi vychádza takto?',
        attachments: [file],
      });
      expect(created.statusCode, created.body).toBe(201);
      const thread = await read(student, created.json<ThreadBody>().id);
      expect(thread.posts[0]!.attachments).toMatchObject([
        { filename: 'graf.png', sizeBytes: 9 },
      ]);

      const link = await download(classmate, thread.id, thread.posts[0]!);
      expect(link.statusCode, link.body).toBe(200);
      const bytes = await fetch(link.json<{ url: string }>().url);
      expect(await bytes.text()).toBe('png bytes');

      const reply = await call(student, 'POST', `${base()}/${thread.id}/posts`, {
        body: 'A ešte jeden',
        attachments: [await upload(student, 'druhy.png')],
      });
      expect(reply.json<PostBody>().attachments).toHaveLength(1);
    });

    it('accepts only keys issued for the discussion of this institution', async () => {
      const forged = `institutions/${institutionId}/submissions/${crypto.randomUUID()}/answer.pdf`;
      const elsewhere = `institutions/${crypto.randomUUID()}/discussion/${crypto.randomUUID()}/x.png`;

      for (const storageKey of [forged, elsewhere]) {
        const response = await call(student, 'POST', base(), {
          title: 'Hm',
          body: 'x',
          attachments: [{ storageKey, filename: 'x.png' }],
        });
        expect(response.statusCode).toBe(404);
      }

      const tooMany = await call(student, 'POST', base(), {
        title: 'Hm',
        body: 'x',
        attachments: Array.from({ length: 4 }, (_, index) => ({
          storageKey: `${forged}${index}`,
          filename: 'x.png',
        })),
      });
      expect(tooMany.statusCode).toBe(400);
    });

    it('withholds the file of a hidden post from students, and deletes it with the post', async () => {
      const file = await upload(student);
      const thread = await read(
        student,
        (
          await call(student, 'POST', base(), { title: 'T', body: 'B', attachments: [file] })
        ).json<ThreadBody>().id,
      );
      const post = thread.posts[0]!;

      await call(teacher, 'PUT', `${base()}/${thread.id}/posts/${post.id}/visibility`, {
        hidden: true,
      });
      const asClassmate = await read(classmate, thread.id);
      expect(asClassmate.posts[0]!.attachments).toEqual([]);
      expect((await download(classmate, thread.id, post)).statusCode).toBe(404);
      expect((await download(teacher, thread.id, post)).statusCode).toBe(200);

      await call(teacher, 'PUT', `${base()}/${thread.id}/posts/${post.id}/visibility`, {
        hidden: false,
      });
      expect(
        (await call(student, 'DELETE', `${base()}/${thread.id}/posts/${post.id}`)).statusCode,
      ).toBe(204);
      expect(await harness.app.get(StorageService).head(file.storageKey)).toBeUndefined();
    });

    it('keeps the discussion upload from anyone outside the course', async () => {
      const outsider = await actingAs('student');
      const ticket = await call(outsider, 'POST', `${base()}/attachment-tickets`, {
        filename: 'x.png',
        contentType: 'image/png',
      });

      expect(ticket.statusCode).toBe(403);
    });
  });

  it('lets the teacher hide a post, keeps it from students, and can restore it', async () => {
    const thread = await start(student);
    const opening = thread.posts[0]!;
    const visibility = `${base()}/${thread.id}/posts/${opening.id}/visibility`;

    expect((await call(classmate, 'PUT', visibility, { hidden: true })).statusCode).toBe(403);
    expect((await call(teacher, 'PUT', visibility, { hidden: true })).statusCode).toBe(204);

    const asStudent = await read(student, thread.id);
    expect(asStudent.posts[0]).toMatchObject({ state: 'hidden', body: null });
    const asTeacher = await read(teacher, thread.id);
    expect(asTeacher.posts[0]).toMatchObject({
      state: 'hidden',
      body: 'What does stable mean?',
    });

    await call(teacher, 'PUT', visibility, { hidden: false });
    const restored = await read(student, thread.id);
    expect(restored.posts[0]).toMatchObject({ state: 'visible' });

    const audited = await harness.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, opening.id));
    expect(audited.map((row) => row.action).sort()).toEqual([
      'discussion.hidden',
      'discussion.restored',
    ]);
  });

  it('takes a hidden thread away from students and stops replies to it', async () => {
    const thread = await start(student);
    await call(teacher, 'PUT', `${base()}/${thread.id}/visibility`, { hidden: true });

    expect((await call(classmate, 'GET', base())).json<Page<unknown>>().items).toEqual([]);
    expect((await call(classmate, 'GET', `${base()}/${thread.id}`)).statusCode).toBe(404);
    expect((await call(teacher, 'GET', base())).json<Page<ThreadBody>>().items).toMatchObject([
      { hidden: true },
    ]);
    expect(
      (await call(teacher, 'POST', `${base()}/${thread.id}/posts`, { body: 'x' })).statusCode,
    ).toBe(409);
  });

  describe('replies', () => {
    it('gathers an answer under the post it answers', async () => {
      const thread = await start(student);
      const opening = thread.posts[0]!;

      const reply = await answer(
        classmate,
        thread.id,
        'Equal keys keep their order.',
        opening.id,
      );

      expect(reply).toMatchObject({ parentPostId: opening.id, quote: null, replyCount: 0 });
      expect((await postsOf(student, thread.id)).items).toMatchObject([
        { id: opening.id, replyCount: 1, parentPostId: null },
      ]);
      expect((await repliesTo(student, thread.id, opening.id)).items).toMatchObject([
        { id: reply.id, body: 'Equal keys keep their order.' },
      ]);
    });

    it('keeps an answer to a reply in the same group and quotes it', async () => {
      const thread = await start(student);
      const opening = thread.posts[0]!;
      const reply = await answer(
        classmate,
        thread.id,
        'Equal keys keep their order.',
        opening.id,
      );

      const followUp = await answer(teacher, thread.id, 'Exactly, see week 3.', reply.id);

      expect(followUp).toMatchObject({
        parentPostId: opening.id,
        quote: { postId: reply.id, excerpt: 'Equal keys keep their order.', state: 'visible' },
      });
      expect((await postsOf(student, thread.id)).items[0]).toMatchObject({ replyCount: 2 });
      expect(
        (await repliesTo(student, thread.id, opening.id)).items.map((post) => post.id),
      ).toEqual([reply.id, followUp.id]);
    });

    it('withholds a quote’s words from a reader who may not see the quoted reply', async () => {
      const thread = await start(student);
      const opening = thread.posts[0]!;
      const reply = await answer(classmate, thread.id, 'Something off-topic.', opening.id);
      await answer(student, thread.id, 'Why?', reply.id);
      await call(teacher, 'PUT', `${base()}/${thread.id}/posts/${reply.id}/visibility`, {
        hidden: true,
      });

      const asStudent = (await repliesTo(student, thread.id, opening.id)).items;
      const asTeacher = (await repliesTo(teacher, thread.id, opening.id)).items;

      expect(asStudent[1]!.quote).toMatchObject({ state: 'hidden', excerpt: null });
      expect(asTeacher[1]!.quote).toMatchObject({
        state: 'hidden',
        excerpt: 'Something off-topic.',
      });
      expect((await postsOf(student, thread.id)).items[0]).toMatchObject({ replyCount: 1 });
      expect((await postsOf(teacher, thread.id)).items[0]).toMatchObject({ replyCount: 2 });
    });

    it('refuses to answer a post that is gone, hidden or in another thread', async () => {
      const thread = await start(student);
      const other = await start(student, 'Another');
      const reply = await answer(classmate, thread.id, 'To be removed.', thread.posts[0]!.id);
      const hidden = await answer(classmate, thread.id, 'To be hidden.', thread.posts[0]!.id);
      await call(classmate, 'DELETE', `${base()}/${thread.id}/posts/${reply.id}`);
      await call(teacher, 'PUT', `${base()}/${thread.id}/posts/${hidden.id}/visibility`, {
        hidden: true,
      });
      const post = (replyToPostId: string) =>
        call(student, 'POST', `${base()}/${thread.id}/posts`, { body: 'x', replyToPostId });

      expect((await post(reply.id)).statusCode).toBe(404);
      expect((await post(hidden.id)).statusCode).toBe(409);
      expect((await post(other.posts[0]!.id)).statusCode).toBe(404);
      expect((await post('not-a-uuid')).statusCode).toBe(400);
    });

    it('lists replies only under a top-level post of the thread', async () => {
      const thread = await start(student);
      const reply = await answer(classmate, thread.id, 'An answer.', thread.posts[0]!.id);

      expect(
        (await call(student, 'GET', `${base()}/${thread.id}/posts/${reply.id}/replies`))
          .statusCode,
      ).toBe(404);
    });
  });

  describe('pages', () => {
    it('pages through threads, most recently active first, and filters them by title', async () => {
      for (const title of ['Sorting', 'Graphs', 'Sorting again']) await start(student, title);

      const first = (await call(student, 'GET', `${base()}?limit=2`)).json<Page<ThreadBody>>();
      const second = (
        await call(student, 'GET', `${base()}?limit=2&cursor=${first.meta.nextCursor}`)
      ).json<Page<ThreadBody>>();
      const filtered = (await call(student, 'GET', `${base()}?q=sort`)).json<
        Page<ThreadBody>
      >();

      expect(first.items.map((thread) => thread.title)).toEqual(['Sorting again', 'Graphs']);
      expect(first.meta.hasNextPage).toBe(true);
      expect(second.items.map((thread) => thread.title)).toEqual(['Sorting']);
      expect(second.meta).toMatchObject({ hasNextPage: false, nextCursor: null });
      expect(filtered.items.map((thread) => thread.title)).toEqual([
        'Sorting again',
        'Sorting',
      ]);
    });

    it('pages through posts and through replies, oldest first', async () => {
      const thread = await start(student);
      const opening = thread.posts[0]!;
      const second = await answer(classmate, thread.id, 'Second.');
      const replies = [
        await answer(teacher, thread.id, 'First reply.', opening.id),
        await answer(classmate, thread.id, 'Second reply.', opening.id),
      ];

      const posts = await postsOf(student, thread.id, '?limit=1');
      const morePosts = await postsOf(
        student,
        thread.id,
        `?limit=1&cursor=${posts.meta.nextCursor}`,
      );
      const firstReplies = await repliesTo(student, thread.id, opening.id, '?limit=1');
      const moreReplies = await repliesTo(
        student,
        thread.id,
        opening.id,
        `?limit=1&cursor=${firstReplies.meta.nextCursor}`,
      );

      expect(posts.items.map((post) => post.id)).toEqual([opening.id]);
      expect(morePosts.items.map((post) => post.id)).toEqual([second.id]);
      expect(morePosts.meta.hasNextPage).toBe(false);
      expect([...firstReplies.items, ...moreReplies.items].map((post) => post.id)).toEqual(
        replies.map((reply) => reply.id),
      );
    });

    it('refuses a cursor it did not issue', async () => {
      const thread = await start(student);

      expect((await call(student, 'GET', `${base()}?cursor=nonsense`)).statusCode).toBe(400);
      expect(
        (await call(student, 'GET', `${base()}/${thread.id}/posts?cursor=nonsense`)).statusCode,
      ).toBe(400);
    });
  });

  it('refuses an empty or oversized message', async () => {
    expect((await call(student, 'POST', base(), { title: '   ', body: 'x' })).statusCode).toBe(
      400,
    );
    expect(
      (await call(student, 'POST', base(), { title: 'x', body: 'y'.repeat(10_001) }))
        .statusCode,
    ).toBe(400);
  });

  it('hands a person their posts in the data export, and erasure removes the words', async () => {
    const thread = await start(student, 'My own question', 'Personal words.');
    await call(classmate, 'POST', `${base()}/${thread.id}/posts`, { body: 'An answer.' });

    const exported = await call(
      student,
      'GET',
      `/api/v1/institutions/${institutionId}/me/personal-data`,
    );
    expect(exported.json<{ discussionPosts: { body: string }[] }>().discussionPosts).toEqual([
      expect.objectContaining({ body: 'Personal words.', threadTitle: 'My own question' }),
    ]);

    const admin = await actingAs('institution_admin');
    const erased = await call(
      admin,
      'DELETE',
      `/api/v1/institutions/${institutionId}/people/${student.user.id}/personal-data`,
    );
    expect(erased.statusCode, erased.body).toBe(200);
    expect(erased.json()).toMatchObject({ tally: { discussionPosts: 1 } });

    const seen = await read(classmate, thread.id);
    expect(seen.title).toBe('');
    expect(seen.posts.map((post) => post.state)).toEqual(['deleted', 'visible']);
    expect(JSON.stringify(seen)).not.toContain('Personal words');
  });
});
