import { Injectable } from '@nestjs/common';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import { encodeCursor } from '../../database/repository/cursor';

import { TeachersRepository, type TaughtOfferingsQuery } from './teachers.repository';
import { ViewerOfferingAccessService } from './viewer-offering-access.service';

export interface TeacherOffering {
  readonly offeringId: string;
  readonly courseTitle: string;
  readonly courseCode: string;
  readonly termName: string;
  readonly viewerCanOpen: boolean;
}

export interface TeacherOfferingsPage {
  readonly items: TeacherOffering[];
  readonly hasNextPage: boolean;
  readonly nextCursor: string | null;
}

@Injectable()
export class TeacherOfferingsService {
  constructor(
    private readonly teachers: TeachersRepository,
    private readonly access: ViewerOfferingAccessService,
  ) {}

  async list(
    institutionId: string,
    teacherId: string,
    viewerId: string,
    query: TaughtOfferingsQuery,
  ): Promise<TeacherOfferingsPage> {
    if (!(await this.teachers.findTeacher(institutionId, teacherId))) {
      throw new EntityNotFoundError('teacher', teacherId);
    }

    const { offerings, hasNextPage } = await this.teachers.taughtOfferings(
      institutionId,
      teacherId,
      query,
    );
    const openable = await this.access.openableBy(
      institutionId,
      viewerId,
      offerings.map((offering) => offering.offeringId),
    );
    const last = offerings.at(-1);

    return {
      items: offerings.map(({ offeringId, courseTitle, courseCode, termName }) => ({
        offeringId,
        courseTitle,
        courseCode,
        termName,
        viewerCanOpen: openable(offeringId),
      })),
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeCursor({ value: last.startsAt, id: last.offeringId })
          : null,
    };
  }
}
