import { Injectable } from '@nestjs/common';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';
import { InstitutionsRepository } from '../institutions/institutions.repository';
import { MyDeadlinesService } from '../learning/my-deadlines.service';
import { MyExamTermsService } from '../scheduling/my-exam-terms.service';
import { MyTimetableEventsService } from '../scheduling/my-timetable-events.service';
import { UsersRepository } from '../users/users.repository';

import { toCalendarEntries, type CalendarSources } from './calendar-entries';
import type { CalendarEntryRef } from './calendar-entry';
import { CalendarEntryMomentsRepository } from './calendar-entry-moments.repository';
import { calendarLabels } from './calendar-labels';
import { renderIcal } from './ical';

const NOTHING: CalendarSources = {
  timetable: [],
  exams: [],
  deadlines: [],
  personalEvents: [],
  personalTasks: [],
};

@Injectable()
export class CalendarEntryExportService {
  constructor(
    private readonly moments: CalendarEntryMomentsRepository,
    private readonly timetable: MyTimetableEventsService,
    private readonly exams: MyExamTermsService,
    private readonly deadlines: MyDeadlinesService,
    private readonly configuration: InstitutionConfigurationService,
    private readonly institutions: InstitutionsRepository,
    private readonly users: UsersRepository,
  ) {}

  async render(
    institutionId: string,
    userId: string,
    entry: CalendarEntryRef,
    now = new Date(),
  ): Promise<string> {
    const at = await this.moments.find(institutionId, entry);
    if (at === undefined) throw new EntityNotFoundError('CalendarEntry');

    const sources = await this.sources(institutionId, userId, entry, at, now);
    const [institution, user] = await Promise.all([
      this.institutions.findByIdOrFail(institutionId),
      this.users.findByIdOrFail(userId),
    ]);
    const labels = calendarLabels(user.locale);
    const events = toCalendarEntries(sources, labels);
    if (events.length === 0) throw new EntityNotFoundError('CalendarEntry');

    return renderIcal({ name: labels.calendarName(institution.name), stamp: now, events });
  }

  // The caller's own reads decide access; the one-millisecond window only finds the entry.
  private async sources(
    institutionId: string,
    userId: string,
    { kind, id }: CalendarEntryRef,
    at: Date,
    now: Date,
  ): Promise<CalendarSources> {
    const range = { from: at, to: new Date(at.getTime() + 1) };

    switch (kind) {
      case 'class': {
        if (!(await this.configuration.isEnabled(institutionId, 'timetable'))) return NOTHING;
        const timetable = await this.timetable.listMine(institutionId, userId, range);

        return { ...NOTHING, timetable: timetable.filter((event) => event.id === id) };
      }
      case 'exam': {
        if (!(await this.configuration.isEnabled(institutionId, 'examRegistration'))) {
          return NOTHING;
        }
        const exams = await this.exams.listMine(institutionId, userId, range, now);

        return { ...NOTHING, exams: exams.filter((term) => term.id === id) };
      }
      case 'deadline': {
        const deadlines = await this.deadlines.listMine(institutionId, userId, range, now);

        return { ...NOTHING, deadlines: deadlines.filter((item) => item.id === id) };
      }
    }
  }
}
