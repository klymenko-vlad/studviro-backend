import { Module } from '@nestjs/common';

import { CryptoModule } from '../../common/crypto/crypto.module';
import { UsersModule } from '../users/users.module';

import { ExternalIdentitiesRepository } from './external-identities.repository';
import { ExternalIdentitiesService } from './external-identities.service';
import { IdentityLinkingService } from './identity-linking.service';
import { MyIdentitiesController } from './my-identities.controller';

@Module({
  imports: [UsersModule, CryptoModule],
  controllers: [MyIdentitiesController],
  providers: [IdentityLinkingService, ExternalIdentitiesService, ExternalIdentitiesRepository],
  exports: [IdentityLinkingService, ExternalIdentitiesRepository],
})
export class IdentityModule {}
