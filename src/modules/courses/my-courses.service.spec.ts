import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EnrolledCourseRow,
  MyCoursesRepository,
  OfferingTeacherRow,
} from './my-courses.repository';
import { MyCoursesService } from './my-courses.service';

const row = (overrides: Partial<EnrolledCourseRow> = {}): EnrolledCourseRow => ({
  enrollmentId: 'enrollment-1',
  status: 'active',
  requirementType: 'compulsory',
  attempt: 1,
  enrolledAt: new Date('2026-02-10T00:00:00.000Z'),
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
  ...overrides,
});

const teacher = (overrides: Partial<OfferingTeacherRow> = {}): OfferingTeacherRow => ({
  courseOfferingId: 'offering-1',
  userId: 'user-1',
  displayName: 'Dr Lecturer',
  role: 'lecturer',
  isPrimary: true,
  ...overrides,
});

describe(MyCoursesService.name, () => {
  const findEnrolledCourses = vi.fn();
  const findTeachers = vi.fn();
  const repository = { findEnrolledCourses, findTeachers } as unknown as MyCoursesRepository;
  let service: MyCoursesService;

  beforeEach(() => {
    service = new MyCoursesService(repository);
  });

  it('reads credits as a number rather than the numeric column’s string', async () => {
    findEnrolledCourses.mockResolvedValue([row()]);
    findTeachers.mockResolvedValue([]);

    const [course] = await service.listEnrolled('institution-1', 'student-1');

    expect(course!.course.credits).toBe(6);
  });

  it('leaves credits null when the course carries none', async () => {
    findEnrolledCourses.mockResolvedValue([row({ credits: null })]);
    findTeachers.mockResolvedValue([]);

    const [course] = await service.listEnrolled('institution-1', 'student-1');

    expect(course!.course.credits).toBeNull();
  });

  it('attaches only the teachers of each offering', async () => {
    findEnrolledCourses.mockResolvedValue([
      row(),
      row({ enrollmentId: 'enrollment-2', offeringId: 'offering-2' }),
    ]);
    findTeachers.mockResolvedValue([
      teacher(),
      teacher({ courseOfferingId: 'offering-2', userId: 'user-2', displayName: 'Dr Other' }),
    ]);

    const courses = await service.listEnrolled('institution-1', 'student-1');

    expect(courses[0]!.teachers.map((t) => t.displayName)).toEqual(['Dr Lecturer']);
    expect(courses[1]!.teachers.map((t) => t.displayName)).toEqual(['Dr Other']);
  });

  it('asks for each offering’s teachers only once', async () => {
    findEnrolledCourses.mockResolvedValue([row(), row({ enrollmentId: 'enrollment-2' })]);
    findTeachers.mockResolvedValue([teacher()]);

    await service.listEnrolled('institution-1', 'student-1');

    expect(findTeachers).toHaveBeenCalledWith(['offering-1']);
  });

  it('does not query teachers when nothing is enrolled', async () => {
    findEnrolledCourses.mockResolvedValue([]);

    expect(await service.listEnrolled('institution-1', 'student-1')).toEqual([]);
    expect(findTeachers).not.toHaveBeenCalled();
  });
});
