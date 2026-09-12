import { Module } from '@nestjs/common';

import { DemoRequestsController } from './demo-requests.controller';
import { DemoRequestsRepository } from './demo-requests.repository';
import { DemoRequestsService } from './demo-requests.service';

@Module({
  controllers: [DemoRequestsController],
  providers: [DemoRequestsRepository, DemoRequestsService],
})
export class MarketingModule {}
