import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import type { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';
import type { InstitutionsRepository } from '../institutions/institutions.repository';
import type { MyDeadlinesService } from '../learning/my-deadlines.service';
import type { MyExamTermsService } from '../scheduling/my-exam-terms.service';
import type { MyTimetableEventsService } from '../scheduling/my-timetable-events.service';
import type { UsersRepository } from '../users/users.repository';

import { CalendarEntryExportService } from './calendar-entry-export.service';
import type { CalendarEntryMomentsRepository } from './calendar-entry-moments.repository';

const NOW = new Date('2026-10-18T10:00:00.000Z');
const AT = new Date('2027-03-01T08:00:00.000Z');
const COURSE = { id: 'course-1', code: 'INF/ALG', title: 'Algorithms' };
const TERM = { id: 'term-1', code: 'S27', name: 'Summer 2027' };

const lecture = (id: string) => ({
  id,
  type: 'lecture',
  title: null,
  startsAt: AT,
  endsAt: new Date(AT.getTime() + 90 * 60_000),
  isCancelled: false,
  room: null,
  course: COURSE,
  term: TERM,
});

const examTerm = (id: string, registered: boolean) => ({
  id,
  kind: 'regular',
  startsAt: AT,
  endsAt: null,
  isCancelled: false,
  attendance: 'enrolled',
  myRegistration: registered ? { status: 'registered' } : null,
  room: null,
  course: COURSE,
  term: TERM,
});

const deadline = (id: string) => ({ id, name: 'Essay', dueAt: AT, course: COURSE, term: TERM });

describe('CalendarEntryExportService', () => {
  const moments = { find: vi.fn() };
  const timetable = { listMine: vi.fn() };
  const exams = { listMine: vi.fn() };
  const deadlines = { listMine: vi.fn() };
  const configuration = { isEnabled: vi.fn() };
  const institutions = { findByIdOrFail: vi.fn() };
  const users = { findByIdOrFail: vi.fn() };
  let service: CalendarEntryExportService;

  const render = (kind: 'class' | 'exam' | 'deadline', id: string) =>
    service.render('institution-1', 'user-1', { kind, id }, NOW);

  beforeEach(() => {
    vi.clearAllMocks();
    moments.find.mockResolvedValue(AT);
    timetable.listMine.mockResolvedValue([]);
    exams.listMine.mockResolvedValue([]);
    deadlines.listMine.mockResolvedValue([]);
    configuration.isEnabled.mockResolvedValue(true);
    institutions.findByIdOrFail.mockResolvedValue({ name: 'UKF' });
    users.findByIdOrFail.mockResolvedValue({ locale: 'en' });

    service = new CalendarEntryExportService(
      moments as unknown as CalendarEntryMomentsRepository,
      timetable as unknown as MyTimetableEventsService,
      exams as unknown as MyExamTermsService,
      deadlines as unknown as MyDeadlinesService,
      configuration as unknown as InstitutionConfigurationService,
      institutions as unknown as InstitutionsRepository,
      users as unknown as UsersRepository,
    );
  });

  it('writes one class as a calendar holding that class alone', async () => {
    timetable.listMine.mockResolvedValue([lecture('other'), lecture('event-1')]);

    const ics = await render('class', 'event-1');

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('UID:timetable-event-1@studviro');
    expect(ics).toContain('SUMMARY:Algorithms – Lecture');
  });

  it('reads the caller’s own classes at the moment the class starts, so its date is never out of range', async () => {
    timetable.listMine.mockResolvedValue([lecture('event-1')]);

    await render('class', 'event-1');

    expect(moments.find).toHaveBeenCalledWith('institution-1', {
      kind: 'class',
      id: 'event-1',
    });
    const [institutionId, userId, range] = timetable.listMine.mock.calls[0] as [
      string,
      string,
      { from: Date; to: Date },
    ];
    expect([institutionId, userId]).toEqual(['institution-1', 'user-1']);
    expect(range.from).toEqual(AT);
    expect(range.to.getTime()).toBeGreaterThan(AT.getTime());
  });

  it('writes an exam the caller holds a seat on', async () => {
    exams.listMine.mockResolvedValue([examTerm('exam-1', true)]);

    const ics = await render('exam', 'exam-1');

    expect(ics).toContain('UID:exam-term-exam-1@studviro');
    expect(ics).toContain('SUMMARY:Exam: Algorithms (regular term)');
    expect(timetable.listMine).not.toHaveBeenCalled();
  });

  it('refuses an exam the caller has not registered for, as the feed leaves it out', async () => {
    exams.listMine.mockResolvedValue([examTerm('exam-1', false)]);

    await expect(render('exam', 'exam-1')).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('writes a deadline as an instant', async () => {
    deadlines.listMine.mockResolvedValue([deadline('activity-1')]);

    const ics = await render('deadline', 'activity-1');

    expect(ics).toContain('UID:deadline-activity-1@studviro');
    expect(ics).toContain('SUMMARY:Due: Essay (Algorithms)');
    expect(ics).not.toContain('DTEND');
  });

  it('answers an entry that does not exist as not found without reading any source', async () => {
    moments.find.mockResolvedValue(undefined);

    await expect(render('class', 'missing')).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(timetable.listMine).not.toHaveBeenCalled();
  });

  it('answers an entry that is not in the caller’s calendar as not found', async () => {
    timetable.listMine.mockResolvedValue([lecture('someone-elses')]);

    await expect(render('class', 'event-1')).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('answers a class as not found while the institution has the timetable switched off', async () => {
    configuration.isEnabled.mockResolvedValue(false);
    timetable.listMine.mockResolvedValue([lecture('event-1')]);

    await expect(render('class', 'event-1')).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(configuration.isEnabled).toHaveBeenCalledWith('institution-1', 'timetable');
    expect(timetable.listMine).not.toHaveBeenCalled();
  });

  it('answers an exam as not found while exam registration is switched off', async () => {
    configuration.isEnabled.mockResolvedValue(false);

    await expect(render('exam', 'exam-1')).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(configuration.isEnabled).toHaveBeenCalledWith('institution-1', 'examRegistration');
  });

  it('labels the entry in the caller’s language', async () => {
    users.findByIdOrFail.mockResolvedValue({ locale: 'sk' });
    deadlines.listMine.mockResolvedValue([deadline('activity-1')]);

    const ics = await render('deadline', 'activity-1');

    expect(ics).toContain('SUMMARY:Termín odovzdania: Essay (Algorithms)');
  });
});
