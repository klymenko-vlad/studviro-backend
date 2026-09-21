import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const CAPTCHA_KEY = 'captcha:required';

/**
 * Demands a solved challenge in the request body's `captcha` field.
 *
 * Opt-in rather than deny-by-default, unlike authentication: almost every route
 * in the API is behind a session already, and requiring a proof of work from a
 * signed-in caller on every write would be a tax on using the product. This
 * belongs only on the handful of routes a stranger can reach.
 */
export const RequireCaptcha = (): CustomDecorator => SetMetadata(CAPTCHA_KEY, true);
