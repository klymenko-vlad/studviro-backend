import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityNotFoundError, PermissionDeniedError } from '../../common/errors/domain.error';
import type { AuthorizationService } from '../authorization/authorization.service';

import type {
  CourseOfferingRepository,
  OfferingDetailRow,
  ViewerEnrollmentRow,
  ViewerStudyGroupRow,
} from './course-offering.repository';
import { CourseOfferingService } from './course-offering.service';
import type { OfferingTeacherRow, TeachingStaffRepository } from './teaching-staff.repository';

const offeringRow = (overrides: Partial<OfferingDetailRow> = {}): OfferingDetailRow => ({
  offeringId: 'offering-1',
  offeringStatus: 'running',
  language: 'sk',
  capacity: 120,
  courseId: 'course-1',
  courseCode: 'INF/ALG/22',
  courseTitle: 'Algorithms',
  courseDescription: 'Complexity and design',
  credits: '6.00',
  termId: 'term-1',
  termCode: '2026-SS',
  termName: 'Summer 2026',
  academicYear: '2025/2026',
  termStartsAt: new Date('2026-02-01T00:00:00.000Z'),
  termEndsAt: new Date('2026-06-30T00:00:00.000Z'),
  ...overrides,
});

const enrollmentRow = (overrides: Partial<ViewerEnrollmentRow> = {}): ViewerEnrollmentRow => ({
  enrollmentId: 'enrollment-1',
  status: 'active',
  requirementType: 'compulsory',
  attempt: 1,
  enrolledAt: new Date('2026-02-10T00:00:00.000Z'),
  ...overrides,
});

const studyGroupRow = (overrides: Partial<ViewerStudyGroupRow> = {}): ViewerStudyGroupRow => ({
  id: 'group-1',
  kind: 'seminar',
  code: 'S1',
  name: 'Monday seminar',
  capacity: 20,
  ...overrides,
});

const teacherRow = (overrides: Partial<OfferingTeacherRow> = {}): OfferingTeacherRow => ({
  courseOfferingId: 'offering-1',
  userId: 'teacher-1',
  displayName: 'Dr Lecturer',
  role: 'lecturer',
  isPrimary: true,
  ...overrides,
});

describe(CourseOfferingService.name, () => {
  const findOffering = vi.fn();
  const findViewerEnrollment = vi.fn();
  const findViewerStudyGroups = vi.fn();
  const findByOfferings = vi.fn();
  const can = vi.fn();

  const repository = {
    findOffering,
    findViewerEnrollment,
    findViewerStudyGroups,
  } as unknown as CourseOfferingRepository;
  const teachingStaff = { findByOfferings } as unknown as TeachingStaffRepository;
  const authorization = { can } as unknown as AuthorizationService;

  let service: CourseOfferingService;

  beforeEach(() => {
    vi.resetAllMocks();
    findOffering.mockResolvedValue(offeringRow());
    findViewerEnrollment.mockResolvedValue(enrollmentRow());
    findViewerStudyGroups.mockResolvedValue([studyGroupRow()]);
    findByOfferings.mockResolvedValue([teacherRow()]);
    can.mockResolvedValue(false);
    service = new CourseOfferingService(repository, teachingStaff, authorization);
  });

  it('returns the offering with its course, term, staff and the caller’s enrolment', async () => {
    const detail = await service.findForViewer('institution-1', 'offering-1', 'student-1');

    expect(detail).toMatchObject({
      offering: { id: 'offering-1', status: 'running', language: 'sk', capacity: 120 },
      course: { code: 'INF/ALG/22', title: 'Algorithms', credits: 6 },
      term: { code: '2026-SS', academicYear: '2025/2026' },
      teachers: [{ userId: 'teacher-1', displayName: 'Dr Lecturer' }],
      enrollment: { enrollmentId: 'enrollment-1', status: 'active' },
      studyGroups: [{ code: 'S1', kind: 'seminar' }],
      viewerRole: 'student',
    });
  });

  it('reads credits as a number and tolerates a course without them', async () => {
    findOffering.mockResolvedValue(offeringRow({ credits: null }));

    const detail = await service.findForViewer('institution-1', 'offering-1', 'student-1');

    expect(detail.course.credits).toBeNull();
  });

  it('raises not found for an offering outside the institution', async () => {
    findOffering.mockResolvedValue(undefined);

    await expect(
      service.findForViewer('institution-1', 'offering-1', 'student-1'),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('refuses a caller who is neither enrolled, teaching nor an administrator', async () => {
    findViewerEnrollment.mockResolvedValue(undefined);

    await expect(
      service.findForViewer('institution-1', 'offering-1', 'stranger-1'),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('admits the offering’s teacher without an enrolment', async () => {
    findViewerEnrollment.mockResolvedValue(undefined);

    const detail = await service.findForViewer('institution-1', 'offering-1', 'teacher-1');

    expect(detail.viewerRole).toBe('teacher');
    expect(detail.enrollment).toBeNull();
  });

  it('admits a caller holding offering:manage over the institution', async () => {
    findViewerEnrollment.mockResolvedValue(undefined);
    can.mockResolvedValue(true);

    const detail = await service.findForViewer('institution-1', 'offering-1', 'admin-1');

    expect(detail.viewerRole).toBe('administrator');
    expect(can).toHaveBeenCalledWith({
      userId: 'admin-1',
      permission: 'offering:manage',
      scope: { type: 'institution', id: 'institution-1' },
    });
  });

  it('does not ask for study groups a refused caller could not see', async () => {
    findViewerEnrollment.mockResolvedValue(undefined);

    await expect(
      service.findForViewer('institution-1', 'offering-1', 'stranger-1'),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(findViewerStudyGroups).not.toHaveBeenCalled();
  });
});
