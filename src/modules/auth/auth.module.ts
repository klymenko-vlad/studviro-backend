import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UsersModule } from '../users/users.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ExpiredTokenPurgeService } from './expired-token-purge.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordChangeController } from './password-change/password-change.controller';
import { PasswordChangeService } from './password-change/password-change.service';
import { PasswordConfirmation } from './password-confirmation.service';
import { PasswordResetTokensRepository } from './password-reset/password-reset-tokens.repository';
import { PasswordResetController } from './password-reset/password-reset.controller';
import { PasswordResetService } from './password-reset/password-reset.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { SessionIssuer } from './sessions/session-issuer.service';
import { SessionsController } from './sessions/sessions.controller';
import { SessionsService } from './sessions/sessions.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';
import { RecoveryCodesRepository } from './two-factor/recovery-codes.repository';
import { SecretCipherService } from './two-factor/secret-cipher.service';
import { TwoFactorChallenges } from './two-factor/two-factor-challenges.service';
import { TwoFactorCredentialsRepository } from './two-factor/two-factor-credentials.repository';
import { TwoFactorLoginService } from './two-factor/two-factor-login.service';
import { TwoFactorVerifier } from './two-factor/two-factor-verifier.service';
import { TwoFactorController } from './two-factor/two-factor.controller';
import { TwoFactorService } from './two-factor/two-factor.service';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    // Secrets are passed per-call in `TokenService`, because access and refresh
    // tokens are signed with different keys — registering one here would make
    // it far too easy to sign a refresh token with the access secret.
    JwtModule.register({}),
  ],
  controllers: [
    AuthController,
    PasswordResetController,
    PasswordChangeController,
    SessionsController,
    TwoFactorController,
  ],
  providers: [
    AuthService,
    TokenService,
    RefreshTokensRepository,
    ExpiredTokenPurgeService,
    PasswordResetService,
    PasswordResetTokensRepository,
    PasswordConfirmation,
    PasswordChangeService,
    SessionIssuer,
    SessionsService,
    SecretCipherService,
    TwoFactorCredentialsRepository,
    RecoveryCodesRepository,
    TwoFactorChallenges,
    TwoFactorVerifier,
    TwoFactorLoginService,
    TwoFactorService,
    JwtStrategy,
    // Order matters: authentication must resolve the principal before
    // authorisation can inspect its role.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [
    AuthService,
    TokenService,
    RefreshTokensRepository,
    PasswordResetTokensRepository,
    TwoFactorCredentialsRepository,
    RecoveryCodesRepository,
  ],
})
export class AuthModule {}
