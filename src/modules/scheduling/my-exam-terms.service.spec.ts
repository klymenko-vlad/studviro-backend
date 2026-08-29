import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';

import type { MyExamTermRow, MyExamTermsRepository } from './my-exam-terms.repository';
import { MyExamTermsService } from './my-exam-terms.service';

const row = (overrides: Partial<MyExamTermRow> = {}): MyExamTermRow => ({
  examTermId: 'exam-1',
  kind: 'regular',
  startsAt: new Date('2026-06-02T09:00:00.000Z'),
  endsAt: new Date('2026-06-02T12:00:00.000Z'),
  capacity: 30,
  registrationOpensAt: new Date('2026-05-12T09:00:00.000Z'),
  registrationClosesAt: new Date('2026-05-31T09:00:00.000Z'),
  cancelledAt: null,
  teaching: false,
  registeredCount: 12,
  roomId: 'room-1',
  roomCode: 'P1',
  roomName: 'Lecture hall',
  roomBuilding: 'Jesenná 5',
  examinerId: 'teacher-1',
  examinerDisplayName: 'Dr Novák',
  registrationId: null,
  registrationStatus: null,
  registeredAt: null,
  registrationCancelledAt: null,
  offeringId: 'offering-1',
  courseId: 'course-1',
  courseCode: 'INF/ALG/22',
  courseTitle: 'Algorithms',
  termId: 'term-1',
  termCode: '2026-SS',
  termName: 'Summer 2026',
  sourceSystem: 'sis',
  externalId: 'EXT-1',
  sourceUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
  lastSynchronizedAt: new Date('2026-05-02T00:00:00.000Z'),
  synchronizationStatus: 'in_sync',
  ...overrides,
});

const DURING_REGISTRATION = new Date('2026-05-20T09:00:00.000Z');

describe(MyExamTermsService.name, () => {
  const findMyExamTerms = vi.fn();
  const repository = { findMyExamTerms } as unknown as MyExamTermsRepository;
  let service: MyExamTermsService;

  const listMine = (filter = {}, now = DURING_REGISTRATION) =>
    service.listMine('institution-1', 'student-1', filter, now);

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MyExamTermsService(repository);
  });

  it('composes the room, examiner and course of an exam term', async () => {
    findMyExamTerms.mockResolvedValue([row()]);

    const [term] = await listMine();

    expect(term!.room).toEqual({
      id: 'room-1',
      code: 'P1',
      name: 'Lecture hall',
      building: 'Jesenná 5',
    });
    expect(term!.examiner).toEqual({ id: 'teacher-1', displayName: 'Dr Novák' });
    expect(term!.course).toEqual({
      id: 'course-1',
      code: 'INF/ALG/22',
      title: 'Algorithms',
    });
  });

  it('reports no room and no examiner when the import carried neither', async () => {
    findMyExamTerms.mockResolvedValue([
      row({
        roomId: null,
        roomCode: null,
        roomName: null,
        roomBuilding: null,
        examinerId: null,
        examinerDisplayName: null,
      }),
    ]);

    const [term] = await listMine();

    expect(term!.room).toBeNull();
    expect(term!.examiner).toBeNull();
  });

  it('counts the seats still free against the capacity', async () => {
    findMyExamTerms.mockResolvedValue([row({ capacity: 30, registeredCount: 12 })]);

    const [term] = await listMine();

    expect(term!.registeredCount).toBe(12);
    expect(term!.seatsRemaining).toBe(18);
  });

  it('leaves the free seats unknown when no capacity was imported', async () => {
    findMyExamTerms.mockResolvedValue([row({ capacity: null })]);

    const [term] = await listMine();

    expect(term!.seatsRemaining).toBeNull();
  });

  it('never reports fewer than no seats when a term is over-subscribed', async () => {
    findMyExamTerms.mockResolvedValue([row({ capacity: 10, registeredCount: 12 })]);

    const [term] = await listMine();

    expect(term!.seatsRemaining).toBe(0);
    expect(term!.isFull).toBe(true);
  });

  it('opens registration inside the imported window', async () => {
    findMyExamTerms.mockResolvedValue([row()]);

    const [term] = await listMine();

    expect(term!.registrationState).toBe('open');
  });

  it('has registration open from the instant the window opens', async () => {
    findMyExamTerms.mockResolvedValue([row()]);

    const [term] = await listMine({}, new Date('2026-05-12T09:00:00.000Z'));

    expect(term!.registrationState).toBe('open');
  });

  it('closes registration at the instant the window closes', async () => {
    findMyExamTerms.mockResolvedValue([row()]);

    const [term] = await listMine({}, new Date('2026-05-31T09:00:00.000Z'));

    expect(term!.registrationState).toBe('closed');
  });

  it('says registration has not opened yet before the window', async () => {
    findMyExamTerms.mockResolvedValue([row()]);

    const [term] = await listMine({}, new Date('2026-05-01T09:00:00.000Z'));

    expect(term!.registrationState).toBe('not_open');
  });

  it('treats an unbounded window as open', async () => {
    findMyExamTerms.mockResolvedValue([
      row({ registrationOpensAt: null, registrationClosesAt: null }),
    ]);

    const [term] = await listMine();

    expect(term!.registrationState).toBe('open');
  });

  it('refuses to call a cancelled exam’s registration open', async () => {
    findMyExamTerms.mockResolvedValue([
      row({ cancelledAt: new Date('2026-05-15T00:00:00.000Z') }),
    ]);

    const [term] = await listMine();

    expect(term!.isCancelled).toBe(true);
    expect(term!.registrationState).toBe('closed');
  });

  it('carries the reader’s own registration when they have one', async () => {
    findMyExamTerms.mockResolvedValue([
      row({
        registrationId: 'registration-1',
        registrationStatus: 'registered',
        registeredAt: new Date('2026-05-14T08:00:00.000Z'),
      }),
    ]);

    const [term] = await listMine();

    expect(term!.myRegistration).toEqual({
      id: 'registration-1',
      status: 'registered',
      registeredAt: new Date('2026-05-14T08:00:00.000Z'),
      cancelledAt: null,
    });
  });

  it('reports no registration for a term the reader has not signed up to', async () => {
    findMyExamTerms.mockResolvedValue([row()]);

    const [term] = await listMine();

    expect(term!.myRegistration).toBeNull();
  });

  it('tells an exam the reader examines apart from one they sit', async () => {
    findMyExamTerms.mockResolvedValue([row(), row({ examTermId: 'exam-2', teaching: true })]);

    const terms = await listMine();

    expect(terms.map((term) => term.attendance)).toEqual(['enrolled', 'teaching']);
  });

  it('carries the provenance of the imported term', async () => {
    findMyExamTerms.mockResolvedValue([row()]);

    const [term] = await listMine();

    expect(term!.provenance).toEqual({
      sourceSystem: 'sis',
      externalId: 'EXT-1',
      sourceUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
      lastSynchronizedAt: new Date('2026-05-02T00:00:00.000Z'),
      synchronizationStatus: 'in_sync',
    });
  });

  it('passes the caller’s filter through to the repository', async () => {
    findMyExamTerms.mockResolvedValue([]);

    await listMine({ kind: 'first_retake', offeringId: 'offering-1' });

    expect(findMyExamTerms).toHaveBeenCalledWith('institution-1', 'student-1', {
      kind: 'first_retake',
      offeringId: 'offering-1',
    });
  });

  it('refuses a range that ends before it starts', async () => {
    await expect(
      listMine({
        from: new Date('2026-06-01T00:00:00.000Z'),
        to: new Date('2026-05-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    expect(findMyExamTerms).not.toHaveBeenCalled();
  });

  it('accepts a half-open range with only one end given', async () => {
    findMyExamTerms.mockResolvedValue([]);

    await listMine({ from: new Date('2026-06-01T00:00:00.000Z') });

    expect(findMyExamTerms).toHaveBeenCalledOnce();
  });
});
