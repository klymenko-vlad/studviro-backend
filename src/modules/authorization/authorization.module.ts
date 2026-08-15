import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { UsersModule } from '../users/users.module';

import { AuthorizationService } from './authorization.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { MyPermissionsController } from './my-permissions.controller';
import { MyRolesController } from './my-roles.controller';
import { RoleAssignmentsController } from './role-assignments.controller';
import { RoleAssignmentsRepository } from './role-assignments.repository';
import { RoleAssignmentsService } from './role-assignments.service';
import { ScopeHierarchyService } from './scope-hierarchy.service';

@Global()
@Module({
  imports: [UsersModule],
  controllers: [RoleAssignmentsController, MyRolesController, MyPermissionsController],
  providers: [
    AuthorizationService,
    RoleAssignmentsService,
    ScopeHierarchyService,
    RoleAssignmentsRepository,
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthorizationService, RoleAssignmentsRepository],
})
export class AuthorizationModule {}
