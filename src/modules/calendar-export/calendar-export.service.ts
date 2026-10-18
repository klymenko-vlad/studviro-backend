import { Injectable } from '@nestjs/common';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import { AuthorizationService } from '../authorization/authorization.service';
import { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';
import { InstitutionsRepository } from '../institutions/institutions.repository';
import { MyDeadlinesService } from '../learning/my-deadlines.service';
import { MyExamTermsService } from '../scheduling/my-exam-terms.service';
import { MyTimetableEventsService } from '../scheduling/my-timetable-events.service';
import { UsersRepository } from '../users/users.repository';

import { toCalendarEntries } from './calendar-entries';
import { CalendarFeedService } from './calendar-feed.service';
import { calendarLabels } from './calendar-labels';
import { renderIcal } from './ical';

const DAY_MS = 24 * 60 * 60 * 1000;
export const CALENDAR_DAYS_BEHIND = 14;
export const CALENDAR_DAYS_AHEAD = 78;

/**
 * One person's calendar in one institution as iCalendar (RFC 5545): the classes
 * they attend or teach, the exam terms they hold a seat on or examine, and their
 * deadlines, from two weeks back to eleven weeks ahead.
 */
@Injectable()
export class CalendarExportService {
  constructor(
    private readonly feeds: CalendarFeedService,
    private readonly timetable: MyTimetableEventsService,
    private readonly exams: MyExamTermsService,
    private readonly deadlines: MyDeadlinesService,
    private readonly configuration: InstitutionConfigurationService,
    private readonly institutions: InstitutionsRepository,
    private readonly users: UsersRepository,
    private readonly authorization: AuthorizationService,
  ) {}

  async render(institutionId: string, userId: string, now = new Date()): Promise<string> {
    const from = new Date(now.getTime() - CALENDAR_DAYS_BEHIND * DAY_MS);
    const to = new Date(now.getTime() + CALENDAR_DAYS_AHEAD * DAY_MS);
    const range = { from, to };

    const [institution, user, withTimetable, withExams] = await Promise.all([
      this.institutions.findByIdOrFail(institutionId),
      this.users.findByIdOrFail(userId),
      this.configuration.isEnabled(institutionId, 'timetable'),
      this.configuration.isEnabled(institutionId, 'examRegistration'),
    ]);

    const [timetable, exams, deadlines] = await Promise.all([
      withTimetable ? this.timetable.listMine(institutionId, userId, range) : [],
      withExams ? this.exams.listMine(institutionId, userId, range, now) : [],
      this.deadlines.listMine(institutionId, userId, range),
    ]);

    const labels = calendarLabels(user.locale);

    return renderIcal({
      name: labels.calendarName(institution.name),
      stamp: now,
      events: toCalendarEntries({ timetable, exams, deadlines }, labels),
    });
  }

  /**
   * A feed answers only while its owner could still read the calendar in the
   * app; anything else is indistinguishable from a token that never existed.
   */
  async renderFeed(token: string, now = new Date()): Promise<string> {
    const feed = await this.feeds.resolve(token);
    if (feed === undefined) throw new EntityNotFoundError('CalendarFeed');

    const user = await this.users.findById(feed.userId);
    const allowed =
      user?.status === 'active' &&
      (await this.authorization.can({
        userId: feed.userId,
        permission: 'schedule:read',
        scope: { type: 'institution', id: feed.institutionId },
      }));
    if (!allowed) throw new EntityNotFoundError('CalendarFeed');

    return this.render(feed.institutionId, feed.userId, now);
  }
}
