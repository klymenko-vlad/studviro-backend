import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PermissionDeniedError } from '../../../common/errors/domain.error';
import { CaptchaService } from '../captcha.service';
import type { CaptchaRefusal } from '../captcha.types';
import { CAPTCHA_KEY } from '../decorators/require-captcha.decorator';

/**
 * Registered on the routes that ask for it rather than globally, because a
 * global guard reading metadata would still run for every request in the app to
 * decide it has nothing to do.
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly captcha: CaptchaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(CAPTCHA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ body?: { captcha?: unknown } }>();
    const solution = request.body?.captcha;
    const verdict = await this.captcha.verify(
      typeof solution === 'string' ? solution : undefined,
    );

    if (verdict.ok) return true;

    throw new PermissionDeniedError('CAPTCHA_FAILED', messageFor(verdict.reason));
  }
}

/**
 * Named reasons, because the client has to tell "fetch a new challenge and try
 * again" apart from "you are being refused" — and because a caller who solved
 * the puzzle honestly and was refused deserves to know it was the clock.
 */
function messageFor(reason: CaptchaRefusal): string {
  switch (reason) {
    case 'missing':
      return 'This form needs its verification check completed first';
    case 'expired':
      return 'The verification check expired. Try again';
    case 'already_used':
      return 'That verification check has already been used. Try again';
    // A forged, garbled or wrong answer gets one answer between them: telling a
    // bot which of its four mistakes it made is free debugging for the bot.
    case 'malformed':
    case 'wrong_algorithm':
    case 'bad_signature':
    case 'wrong_answer':
      return 'The verification check did not pass';
  }
}
