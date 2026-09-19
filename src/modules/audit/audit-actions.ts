export const AUDIT_ACTIONS = [
  'grade.proposed',
  'grade.published',
  'role.granted',
  'role.revoked',
  'enrollment.corrected',
  'exam_term.cancelled',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_SUBJECT_TYPES = [
  'course_result',
  'role_assignment',
  'enrollment',
  'exam_term',
] as const;

export type AuditSubjectType = (typeof AUDIT_SUBJECT_TYPES)[number];
