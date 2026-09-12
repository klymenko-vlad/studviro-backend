import type {
  SisAcademicTerm,
  SisCourse,
  SisCourseOffering,
  SisEnrollment,
  SisExamTerm,
  SisOfficialResult,
  SisOrgUnit,
  SisPerson,
  SisProgram,
  SisProgramMembership,
  SisRoom,
  SisStudyGroup,
  SisTimetableEvent,
} from './academic-system.records';
import type {
  Capabilities,
  ConnectorCredentialField,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorRecord,
} from './connector.types';

export const ACADEMIC_SYSTEM_CAPABILITIES = [
  'persons.read',
  'orgUnits.read',
  'academicTerms.read',
  'programs.read',
  'programMemberships.read',
  'courses.read',
  'courseOfferings.read',
  'enrollments.read',
  'studyGroups.read',
  'rooms.read',
  'timetableEvents.read',
  'examTerms.read',
  'officialResults.read',
  'examRegistration.write',
  'courseRegistration.write',
] as const;
export type AcademicSystemCapability = (typeof ACADEMIC_SYSTEM_CAPABILITIES)[number];
export type AcademicSystemCapabilities = Capabilities<AcademicSystemCapability>;

export interface SisExamRegistrationCommand {
  readonly examTermExternalId: string;
  readonly personExternalId: string;
}

export interface SisCourseRegistrationCommand {
  readonly courseOfferingExternalId: string;
  readonly personExternalId: string;
}

export interface AcademicSystemConnector {
  readonly name: string;

  healthCheck(): Promise<ConnectorHealth>;
  capabilities(): AcademicSystemCapabilities;
  credentialFields(): readonly ConnectorCredentialField[];

  getPersons(query?: ConnectorQuery): Promise<ConnectorRecord<SisPerson>[]>;
  getOrgUnits(query?: ConnectorQuery): Promise<ConnectorRecord<SisOrgUnit>[]>;
  getAcademicTerms(query?: ConnectorQuery): Promise<ConnectorRecord<SisAcademicTerm>[]>;
  getPrograms(query?: ConnectorQuery): Promise<ConnectorRecord<SisProgram>[]>;
  getProgramMemberships(
    query?: ConnectorQuery,
  ): Promise<ConnectorRecord<SisProgramMembership>[]>;
  getCourses(query?: ConnectorQuery): Promise<ConnectorRecord<SisCourse>[]>;
  getCourseOfferings(query?: ConnectorQuery): Promise<ConnectorRecord<SisCourseOffering>[]>;
  getEnrollments(query?: ConnectorQuery): Promise<ConnectorRecord<SisEnrollment>[]>;
  getStudyGroups(query?: ConnectorQuery): Promise<ConnectorRecord<SisStudyGroup>[]>;
  getRooms(query?: ConnectorQuery): Promise<ConnectorRecord<SisRoom>[]>;
  getTimetableEvents(query?: ConnectorQuery): Promise<ConnectorRecord<SisTimetableEvent>[]>;
  getExamTerms(query?: ConnectorQuery): Promise<ConnectorRecord<SisExamTerm>[]>;
  getOfficialResults(query?: ConnectorQuery): Promise<ConnectorRecord<SisOfficialResult>[]>;

  registerForExam?(command: SisExamRegistrationCommand): Promise<void>;
  registerForCourse?(command: SisCourseRegistrationCommand): Promise<void>;
}

export const ACADEMIC_SYSTEM_CONNECTORS = Symbol('ACADEMIC_SYSTEM_CONNECTORS');
