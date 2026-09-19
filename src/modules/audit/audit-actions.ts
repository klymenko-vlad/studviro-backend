export const AUDIT_ACTIONS = [
  'grade.proposed',
  'grade.published',
  'role.granted',
  'role.revoked',
  'enrollment.corrected',
  'exam_term.cancelled',
  'personal_data.erased',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_SUBJECT_TYPES = [
  'course_result',
  'role_assignment',
  'enrollment',
  'exam_term',
  'personal_data_erasure',
] as const;

export type AuditSubjectType = (typeof AUDIT_SUBJECT_TYPES)[number];
