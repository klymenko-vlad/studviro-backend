import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DemoRequestsRepository } from './demo-requests.repository';
import type { CreateDemoRequestDto } from './dto/create-demo-request.dto';

export interface DemoRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class DemoRequestsService {
  constructor(private readonly repository: DemoRequestsRepository) {}

  async submit(
    dto: CreateDemoRequestDto,
    context: DemoRequestContext,
    now = new Date(),
  ): Promise<void> {
    if (dto.website !== undefined && dto.website !== '') return;

    await this.repository.record(
      {
        institutionName: dto.institutionName,
        contactName: dto.contactName,
        email: dto.email,
        role: dto.role,
        message: dto.message,
        ipHash: hashIp(context.ipAddress),
        userAgent: context.userAgent,
      },
      now,
    );
  }
}

/** Enough to recognise a repeat abuser, not enough to be an address on file. */
function hashIp(ipAddress: string | undefined): string | undefined {
  return ipAddress === undefined
    ? undefined
    : createHash('sha256').update(ipAddress).digest('hex');
}
