import { Global, Module } from '@nestjs/common';

import { CaptchaController } from './captcha.controller';
import { CaptchaService } from './captcha.service';
import { CaptchaGuard } from './guards/captcha.guard';

/**
 * Global because the routes it protects live in `auth` and `marketing` and
 * would otherwise each import it. It registers no `APP_GUARD` — `CaptchaGuard`
 * is applied per route with `@UseGuards`, so importing this module twice cannot
 * arm a second copy of it (the trap `FeatureFlagGuard` exists to avoid).
 */
@Global()
@Module({
  controllers: [CaptchaController],
  providers: [CaptchaService, CaptchaGuard],
  exports: [CaptchaService, CaptchaGuard],
})
export class CaptchaModule {}
