import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UsersModule } from '../users/users.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    // Secrets are passed per-call in `TokenService`, because access and refresh
    // tokens are signed with different keys — registering one here would make
    // it far too easy to sign a refresh token with the access secret.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    RefreshTokensRepository,
    JwtStrategy,
    // Order matters: authentication must resolve the principal before
    // authorisation can inspect its role.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
