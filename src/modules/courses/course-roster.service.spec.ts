import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityNotFoundError, PermissionDeniedError } from '../../common/errors/domain.error';
import type { AuthorizationService } from '../authorization/authorization.service';

import type { CourseOfferingRepository } from './course-offering.repository';
import type {
  CourseRosterRepository,
  RosterEnrollmentRow,
  RosterStudyGroupRow,
} from './course-roster.repository';
import { CourseRosterService } from './course-roster.service';

const offeringRow = {
  offeringId: 'offering-1',
  offeringStatus: 'running',
  language: 'sk',
  capacity: 120,
  courseId: 'course-1',
  courseCode: 'INF/ALG/22',
  courseTitle: 'Algorithms',
  courseDescription: null,
  credits: '6.00',
  termId: 'term-1',
  termCode: '2026-SS',
  termName: 'Summer 2026',
  academicYear: '2025/2026',
  termStartsAt: new Date('2026-02-01T00:00:00.000Z'),
  termEndsAt: new Date('2026-06-30T00:00:00.000Z'),
};

const enrollment = (overrides: Partial<RosterEnrollmentRow> = {}): RosterEnrollmentRow => ({
  enrollmentId: 'enrollment-1',
  userId: 'student-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.edu',
  status: 'active',
  requirementType: 'compulsory',
  attempt: 1,
  enrolledAt: new Date('2026-02-10T00:00:00.000Z'),
  ...overrides,
});

const membership = (overrides: Partial<RosterStudyGroupRow> = {}): RosterStudyGroupRow => ({
  userId: 'student-1',
  id: 'group-1',
  kind: 'seminar',
  code: 'S1',
  name: 'Seminar 1',
  ...overrides,
});

describe(CourseRosterService.name, () => {
  const findOffering = vi.fn();
  const teaches = vi.fn();
  const findEnrollments = vi.fn();
  const findStudyGroups = vi.fn();
  const can = vi.fn();

  const offerings = { findOffering } as unknown as CourseOfferingRepository;
  const roster = {
    teaches,
    findEnrollments,
    findStudyGroups,
  } as unknown as CourseRosterRepository;
  const authorization = { can } as unknown as AuthorizationService;
  let service: CourseRosterService;

  beforeEach(() => {
    vi.clearAllMocks();
    findOffering.mockResolvedValue(offeringRow);
    teaches.mockResolvedValue(true);
    findEnrollments.mockResolvedValue([enrollment()]);
    findStudyGroups.mockResolvedValue([]);
    can.mockResolvedValue(false);
    service = new CourseRosterService(offerings, roster, authorization);
  });

  it('lists the enrolled students to the teacher of the offering', async () => {
    const result = await service.findForViewer('institution-1', 'offering-1', 'teacher-1');

    expect(result.students.map((student) => student.displayName)).toEqual(['Ada Lovelace']);
    expect(result.course.credits).toBe(6);
  });

  it('attaches each student’s own study groups', async () => {
    findEnrollments.mockResolvedValue([
      enrollment(),
      enrollment({ enrollmentId: 'enrollment-2', userId: 'student-2', displayName: 'Grace' }),
    ]);
    findStudyGroups.mockResolvedValue([
      membership(),
      membership({ userId: 'student-2', id: 'group-2', code: 'S2', name: null }),
    ]);

    const result = await service.findForViewer('institution-1', 'offering-1', 'teacher-1');

    expect(result.students[0]!.studyGroups.map((group) => group.code)).toEqual(['S1']);
    expect(result.students[1]!.studyGroups.map((group) => group.code)).toEqual(['S2']);
  });

  it('lets someone who administers offerings read a roster they do not teach', async () => {
    teaches.mockResolvedValue(false);
    can.mockResolvedValue(true);

    const result = await service.findForViewer('institution-1', 'offering-1', 'admin-1');

    expect(result.viewerRole).toBe('administrator');
  });

  it('refuses a student who merely holds enrollment:read', async () => {
    teaches.mockResolvedValue(false);

    await expect(
      service.findForViewer('institution-1', 'offering-1', 'student-1'),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(findEnrollments).not.toHaveBeenCalled();
  });

  it('reports an offering of another institution as missing', async () => {
    findOffering.mockResolvedValue(undefined);

    await expect(
      service.findForViewer('institution-1', 'offering-1', 'teacher-1'),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('returns an empty roster rather than querying groups for nobody', async () => {
    findEnrollments.mockResolvedValue([]);

    const result = await service.findForViewer('institution-1', 'offering-1', 'teacher-1');

    expect(result.students).toEqual([]);
    expect(findStudyGroups).not.toHaveBeenCalled();
  });
});
