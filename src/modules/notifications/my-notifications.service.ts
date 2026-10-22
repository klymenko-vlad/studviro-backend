import { Injectable } from '@nestjs/common';

import { EntityNotFoundError } from '../../common/errors/domain.error';

import {
  MyNotificationsRepository,
  type MyNotificationRow,
} from './my-notifications.repository';

const MAX_PAGE_SIZE = 100;

export interface ListMyNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
}

@Injectable()
export class MyNotificationsService {
  constructor(private readonly repository: MyNotificationsRepository) {}

  listMine(
    institutionId: string,
    userId: string,
    options: ListMyNotificationsOptions,
  ): Promise<MyNotificationRow[]> {
    return this.repository.findMine(institutionId, userId, {
      unreadOnly: options.unreadOnly,
      limit: Math.min(options.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE),
    });
  }

  countUnread(institutionId: string, userId: string): Promise<number> {
    return this.repository.countUnread(institutionId, userId);
  }

  async markRead(
    institutionId: string,
    userId: string,
    deliveryId: string,
    now = new Date(),
  ): Promise<MyNotificationRow> {
    const read = await this.repository.markRead(institutionId, userId, deliveryId, now);
    if (!read) throw new EntityNotFoundError('notification', deliveryId);

    return read;
  }

  markAllRead(institutionId: string, userId: string, now = new Date()): Promise<number> {
    return this.repository.markAllRead(institutionId, userId, now);
  }
}
