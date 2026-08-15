import { Module } from '@nestjs/common';

import { CryptoModule } from '../../common/crypto/crypto.module';
import { UsersModule } from '../users/users.module';

import { ExternalIdentitiesRepository } from './external-identities.repository';
import { IdentityLinkingService } from './identity-linking.service';

@Module({
  imports: [UsersModule, CryptoModule],
  providers: [IdentityLinkingService, ExternalIdentitiesRepository],
  exports: [IdentityLinkingService, ExternalIdentitiesRepository],
})
export class IdentityModule {}
