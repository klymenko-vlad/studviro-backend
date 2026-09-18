import { Injectable } from '@nestjs/common';

import { DependencyUnavailableError } from '../../common/errors/domain.error';
import type { SourceWriteIntent } from '../../database/schema';

import { ExamRegistrationWriteRepository } from './exam-registration-write.repository';
import type {
  ExamRegistrationPayload,
  IntentWriter,
  WriteAcknowledgement,
} from './write-intent.types';
import { WriteTargetService } from './write-target.service';

export const EXAM_REGISTRATIONS_TABLE = 'exam_registrations';

abstract class ExamRegistrationWriter implements IntentWriter {
  abstract readonly kind: SourceWriteIntent['kind'];

  constructor(
    protected readonly targets: WriteTargetService,
    protected readonly registrations: ExamRegistrationWriteRepository,
  ) {}

  abstract execute(intent: SourceWriteIntent): Promise<WriteAcknowledgement>;

  acknowledge(intent: SourceWriteIntent, ack: WriteAcknowledgement): Promise<void> {
    return this.registrations.stampAcknowledged(
      intent.canonicalId,
      'sis',
      ack.externalId,
      new Date(),
    );
  }

  abandon(intent: SourceWriteIntent): Promise<void> {
    return this.registrations.markFailed(intent.canonicalId);
  }

  abstract compensate(intent: SourceWriteIntent): Promise<void>;

  protected payloadOf(intent: SourceWriteIntent): ExamRegistrationPayload {
    return intent.payload as unknown as ExamRegistrationPayload;
  }

  protected async connectorFor(intent: SourceWriteIntent) {
    const target = await this.targets.academic(intent.institutionId, 'examRegistration.write');

    if (target?.connectorName !== intent.connectorName) {
      throw new DependencyUnavailableError(
        'WRITE_BACK_CONNECTOR_UNAVAILABLE',
        `The "${intent.connectorName}" connector no longer accepts exam registration writes`,
      );
    }

    return target.connector;
  }
}

@Injectable()
export class ExamRegistrationCreateWriter extends ExamRegistrationWriter {
  readonly kind = 'exam_registration.create' as const;

  async execute(intent: SourceWriteIntent): Promise<WriteAcknowledgement> {
    const connector = await this.connectorFor(intent);
    const payload = this.payloadOf(intent);

    if (!connector.registerForExam) {
      throw new DependencyUnavailableError(
        'WRITE_BACK_COMMAND_UNSUPPORTED',
        `The "${intent.connectorName}" connector declares exam registration writes but implements none`,
      );
    }

    return connector.registerForExam({
      idempotencyKey: intent.id,
      examTermExternalId: payload.examTermExternalId,
      personExternalId: payload.personExternalId,
    });
  }

  async compensate(intent: SourceWriteIntent): Promise<void> {
    await this.registrations.compensateCreate(intent.canonicalId, new Date());
  }
}

@Injectable()
export class ExamRegistrationCancelWriter extends ExamRegistrationWriter {
  readonly kind = 'exam_registration.cancel' as const;

  async execute(intent: SourceWriteIntent): Promise<WriteAcknowledgement> {
    const connector = await this.connectorFor(intent);
    const payload = this.payloadOf(intent);

    if (!connector.cancelExamRegistration) {
      throw new DependencyUnavailableError(
        'WRITE_BACK_COMMAND_UNSUPPORTED',
        `The "${intent.connectorName}" connector declares exam registration writes but cannot cancel one`,
      );
    }

    await connector.cancelExamRegistration({
      idempotencyKey: intent.id,
      examTermExternalId: payload.examTermExternalId,
      personExternalId: payload.personExternalId,
      registrationExternalId: payload.registrationExternalId,
    });

    return { externalId: null };
  }

  /**
   * Nothing is reversed. The student has already cancelled here, and
   * un-cancelling because the registrar refused the message would be a worse
   * lie than the disagreement the stuck write records.
   */
  compensate(): Promise<void> {
    return Promise.resolve();
  }
}
