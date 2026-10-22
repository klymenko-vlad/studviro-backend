import { SetMetadata, type CustomDecorator } from '@nestjs/common';

import type { FeatureFlag } from '../../../../database/schema';

export const FEATURE_KEY = 'institution:feature';

export interface FeatureRequirement {
  readonly flag: FeatureFlag;
  readonly param: string;
}

/**
 * Turning a feature off at an institution has to close the door, not merely
 * grey out a link: an administrator control that changes nothing is a lie the
 * settings screen tells.
 */
export const RequireFeature = (flag: FeatureFlag, param = 'institutionId'): CustomDecorator =>
  SetMetadata<string, FeatureRequirement>(FEATURE_KEY, { flag, param });
