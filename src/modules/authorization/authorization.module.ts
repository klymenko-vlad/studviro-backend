import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthorizationService } from './authorization.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { RoleAssignmentsRepository } from './role-assignments.repository';
import { ScopeHierarchyService } from './scope-hierarchy.service';

@Global()
@Module({
  providers: [
    AuthorizationService,
    ScopeHierarchyService,
    RoleAssignmentsRepository,
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthorizationService, RoleAssignmentsRepository],
})
export class AuthorizationModule {}
