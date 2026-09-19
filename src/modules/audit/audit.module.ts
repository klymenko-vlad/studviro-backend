import { Global, Module } from '@nestjs/common';

import { AuditEventsController } from './audit-events.controller';
import { AuditEventsService } from './audit-events.service';
import { AuditService } from './audit.service';

/**
 * Global because auditing cuts across modules that have no other reason to
 * know about each other, the same argument `AuthorizationModule` makes.
 */
@Global()
@Module({
  controllers: [AuditEventsController],
  providers: [AuditService, AuditEventsService],
  exports: [AuditService],
})
export class AuditModule {}
