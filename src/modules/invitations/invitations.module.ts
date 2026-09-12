import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { UsersModule } from '../users/users.module';

import { InvitationsController } from './invitations.controller';
import { InvitationsRepository } from './invitations.repository';
import { InvitationsService } from './invitations.service';
import { MergeService } from './merge.service';

@Module({
  imports: [UsersModule, AuthModule, AuthorizationModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, InvitationsRepository, MergeService],
  exports: [InvitationsService, InvitationsRepository],
})
export class InvitationsModule {}
