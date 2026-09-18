import { Inject, Injectable } from '@nestjs/common';

import {
  ACADEMIC_SYSTEM_CAPABILITIES,
  type AcademicSystemCapabilities,
  type AcademicSystemConnector,
  type SisCourseRegistrationCommand,
  type SisCourseWithdrawalCommand,
  type SisExamRegistrationCancelCommand,
  type SisExamRegistrationCommand,
  type SisResultPublicationCommand,
  type SisWriteAcknowledgement,
} from '../academic-system.connector';
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
} from '../academic-system.records';
import {
  changedSince,
  type ConnectorCredentialField,
  type ConnectorHealth,
  type ConnectorQuery,
  type ConnectorRecord,
} from '../connector.types';

import { buildMockSisDataset, type MockSisDataset } from './mock-sis.dataset';
import { MOCK_SIS_OPTIONS, type MockSisOptions } from './mock-sis.options';
import {
  acceptCourseRegistration,
  acceptCourseWithdrawal,
  acceptExamRegistration,
  acceptExamRegistrationCancellation,
  acceptResultPublication,
} from './mock-sis.registrar';

const UNSUPPORTED_CAPABILITIES = new Set<string>();

const CREDENTIAL_FIELDS: readonly ConnectorCredentialField[] = [
  {
    key: 'apiToken',
    label: 'API token',
    description:
      'The mock connector accepts any value; the field exists so credential storage can be exercised end to end.',
    secret: true,
    required: false,
  },
];

@Injectable()
export class MockSisConnector implements AcademicSystemConnector {
  private cached: MockSisDataset | undefined;

  constructor(@Inject(MOCK_SIS_OPTIONS) private readonly options: MockSisOptions) {}

  get name(): string {
    return this.options.name;
  }

  healthCheck(): Promise<ConnectorHealth> {
    return Promise.resolve({ reachable: true, checkedAt: new Date(), detail: null });
  }

  capabilities(): AcademicSystemCapabilities {
    return Object.fromEntries(
      ACADEMIC_SYSTEM_CAPABILITIES.map((capability) => [
        capability,
        !UNSUPPORTED_CAPABILITIES.has(capability),
      ]),
    ) as AcademicSystemCapabilities;
  }

  credentialFields(): readonly ConnectorCredentialField[] {
    return CREDENTIAL_FIELDS;
  }

  get dataset(): MockSisDataset {
    this.cached ??= buildMockSisDataset(this.options);

    return this.cached;
  }

  getPersons(query?: ConnectorQuery): Promise<ConnectorRecord<SisPerson>[]> {
    return this.read(this.dataset.persons, query);
  }

  getOrgUnits(query?: ConnectorQuery): Promise<ConnectorRecord<SisOrgUnit>[]> {
    return this.read(this.dataset.orgUnits, query);
  }

  getAcademicTerms(query?: ConnectorQuery): Promise<ConnectorRecord<SisAcademicTerm>[]> {
    return this.read(this.dataset.academicTerms, query);
  }

  getPrograms(query?: ConnectorQuery): Promise<ConnectorRecord<SisProgram>[]> {
    return this.read(this.dataset.programs, query);
  }

  getProgramMemberships(
    query?: ConnectorQuery,
  ): Promise<ConnectorRecord<SisProgramMembership>[]> {
    return this.read(this.dataset.programMemberships, query);
  }

  getCourses(query?: ConnectorQuery): Promise<ConnectorRecord<SisCourse>[]> {
    return this.read(this.dataset.courses, query);
  }

  getCourseOfferings(query?: ConnectorQuery): Promise<ConnectorRecord<SisCourseOffering>[]> {
    return this.read(this.dataset.courseOfferings, query);
  }

  getEnrollments(query?: ConnectorQuery): Promise<ConnectorRecord<SisEnrollment>[]> {
    return this.read(this.dataset.enrollments, query);
  }

  getStudyGroups(query?: ConnectorQuery): Promise<ConnectorRecord<SisStudyGroup>[]> {
    return this.read(this.dataset.studyGroups, query);
  }

  getRooms(query?: ConnectorQuery): Promise<ConnectorRecord<SisRoom>[]> {
    return this.read(this.dataset.rooms, query);
  }

  getTimetableEvents(query?: ConnectorQuery): Promise<ConnectorRecord<SisTimetableEvent>[]> {
    return this.read(this.dataset.timetableEvents, query);
  }

  getExamTerms(query?: ConnectorQuery): Promise<ConnectorRecord<SisExamTerm>[]> {
    return this.read(this.dataset.examTerms, query);
  }

  getOfficialResults(query?: ConnectorQuery): Promise<ConnectorRecord<SisOfficialResult>[]> {
    return this.read(this.dataset.officialResults, query);
  }

  registerForExam(command: SisExamRegistrationCommand): Promise<SisWriteAcknowledgement> {
    return acceptExamRegistration(command);
  }

  cancelExamRegistration(command: SisExamRegistrationCancelCommand): Promise<void> {
    return acceptExamRegistrationCancellation(command);
  }

  registerForCourse(command: SisCourseRegistrationCommand): Promise<SisWriteAcknowledgement> {
    return acceptCourseRegistration(command);
  }

  withdrawFromCourse(command: SisCourseWithdrawalCommand): Promise<void> {
    return acceptCourseWithdrawal(command);
  }

  publishResult(command: SisResultPublicationCommand): Promise<SisWriteAcknowledgement> {
    return acceptResultPublication(command);
  }

  private read<TData>(
    records: readonly ConnectorRecord<TData>[],
    query?: ConnectorQuery,
  ): Promise<ConnectorRecord<TData>[]> {
    return Promise.resolve(changedSince(records, query));
  }
}
