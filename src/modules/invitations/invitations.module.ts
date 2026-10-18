import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { UsersModule } from '../users/users.module';

import { InvitationMailer } from './invitation-mailer';
import { InvitationsController } from './invitations.controller';
import { InvitationsRepository } from './invitations.repository';
import { InvitationsService } from './invitations.service';
import { MergeService } from './merge.service';

@Module({
  imports: [UsersModule, AuthModule, AuthorizationModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, InvitationsRepository, MergeService, InvitationMailer],
  exports: [InvitationsService, InvitationsRepository, InvitationMailer],
})
export class InvitationsModule {}
