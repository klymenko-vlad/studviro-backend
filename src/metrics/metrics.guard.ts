import { timingSafeEqual } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class MetricsGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.metricsToken;
    if (!expected && !this.config.isProduction) return true;

    const authorization = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
    }>().headers?.authorization;
    const presented = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

    if (!expected || !presented || !sameValue(presented, expected)) {
      throw new UnauthorizedException('Valid metrics credentials are required');
    }

    return true;
  }
}

function sameValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
