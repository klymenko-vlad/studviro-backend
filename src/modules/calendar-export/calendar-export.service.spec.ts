import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import type { AuthorizationService } from '../authorization/authorization.service';
import type { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';
import type { InstitutionsRepository } from '../institutions/institutions.repository';
import type { MyDeadlinesService } from '../learning/my-deadlines.service';
import type { PersonalEventsService } from '../planner/personal-events.service';
import type { PersonalTasksService } from '../planner/personal-tasks.service';
import type { MyExamTermsService } from '../scheduling/my-exam-terms.service';
import type { MyTimetableEventsService } from '../scheduling/my-timetable-events.service';
import type { UsersRepository } from '../users/users.repository';

import { CalendarExportService } from './calendar-export.service';
import type { CalendarFeedService } from './calendar-feed.service';

const NOW = new Date('2026-10-18T10:00:00.000Z');
const FEED = { institutionId: 'institution-1', userId: 'user-1' };

describe('CalendarExportService', () => {
  const feeds = { resolve: vi.fn() };
  const timetable = { listMine: vi.fn() };
  const exams = { listMine: vi.fn() };
  const deadlines = { listMine: vi.fn() };
  const configuration = { isEnabled: vi.fn() };
  const institutions = { findByIdOrFail: vi.fn() };
  const users = { findById: vi.fn(), findByIdOrFail: vi.fn() };
  const authorization = { can: vi.fn() };
  const personalEvents = { list: vi.fn() };
  const personalTasks = { listOpenDue: vi.fn() };
  let service: CalendarExportService;

  beforeEach(() => {
    vi.clearAllMocks();
    feeds.resolve.mockResolvedValue(FEED);
    timetable.listMine.mockResolvedValue([]);
    exams.listMine.mockResolvedValue([]);
    deadlines.listMine.mockResolvedValue([]);
    configuration.isEnabled.mockResolvedValue(true);
    institutions.findByIdOrFail.mockResolvedValue({ name: 'UKF' });
    users.findById.mockResolvedValue({ status: 'active', locale: 'sk' });
    users.findByIdOrFail.mockResolvedValue({ status: 'active', locale: 'sk' });
    authorization.can.mockResolvedValue(true);
    personalEvents.list.mockResolvedValue([]);
    personalTasks.listOpenDue.mockResolvedValue([]);

    service = new CalendarExportService(
      feeds as unknown as CalendarFeedService,
      timetable as unknown as MyTimetableEventsService,
      exams as unknown as MyExamTermsService,
      deadlines as unknown as MyDeadlinesService,
      configuration as unknown as InstitutionConfigurationService,
      institutions as unknown as InstitutionsRepository,
      users as unknown as UsersRepository,
      authorization as unknown as AuthorizationService,
      personalEvents as unknown as PersonalEventsService,
      personalTasks as unknown as PersonalTasksService,
    );
  });

  it('reads two weeks back and eleven weeks ahead, inside every source’s 92-day limit', async () => {
    await service.render('institution-1', 'user-1', NOW);

    const [, , range] = timetable.listMine.mock.calls[0] as [
      string,
      string,
      { from: Date; to: Date },
    ];
    expect(range.from).toEqual(new Date('2026-10-04T10:00:00.000Z'));
    expect(range.to).toEqual(new Date('2027-01-04T10:00:00.000Z'));
    expect((range.to.getTime() - range.from.getTime()) / 86_400_000).toBeLessThanOrEqual(92);
  });

  it('names the calendar after the institution', async () => {
    const ics = await service.render('institution-1', 'user-1', NOW);

    expect(ics).toContain('X-WR-CALNAME:StudViro – UKF');
  });

  it('leaves out the classes and exams of a module the institution switched off', async () => {
    configuration.isEnabled.mockResolvedValue(false);

    await service.render('institution-1', 'user-1', NOW);

    expect(timetable.listMine).not.toHaveBeenCalled();
    expect(exams.listMine).not.toHaveBeenCalled();
    expect(deadlines.listMine).toHaveBeenCalled();
  });

  it('serves a feed as its owner’s calendar', async () => {
    const ics = await service.renderFeed('token', NOW);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(timetable.listMine).toHaveBeenCalledWith(
      'institution-1',
      'user-1',
      expect.anything(),
    );
  });

  it('answers an unknown token as not found', async () => {
    feeds.resolve.mockResolvedValue(undefined);

    await expect(service.renderFeed('guess', NOW)).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('stops serving the feed of a suspended account', async () => {
    users.findById.mockResolvedValue({ status: 'suspended', locale: 'en' });

    await expect(service.renderFeed('token', NOW)).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(timetable.listMine).not.toHaveBeenCalled();
  });

  it('stops serving the feed of someone who lost their role in the institution', async () => {
    authorization.can.mockResolvedValue(false);

    await expect(service.renderFeed('token', NOW)).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(authorization.can).toHaveBeenCalledWith({
      userId: 'user-1',
      permission: 'schedule:read',
      scope: { type: 'institution', id: 'institution-1' },
    });
  });
});
