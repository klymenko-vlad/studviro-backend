import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FEATURE_KEY, type FeatureRequirement } from '../decorators/require-feature.decorator';
import { InstitutionConfigurationService } from '../institution-configuration.service';

interface ScopedRequest {
  params?: Record<string, string | undefined>;
}

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configuration: InstitutionConfigurationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<FeatureRequirement | undefined>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const institutionId = context.switchToHttp().getRequest<ScopedRequest>().params?.[
      required.param
    ];

    if (!institutionId) return true;

    if (await this.configuration.isEnabled(institutionId, required.flag)) return true;

    throw new ForbiddenException({
      code: 'FEATURE_DISABLED',
      message: 'This institution has turned that off',
      details: { feature: required.flag },
    });
  }
}
