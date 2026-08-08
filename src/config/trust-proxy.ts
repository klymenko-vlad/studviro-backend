/**
 * Fastify's `trustProxy` setting, parsed from `TRUSTED_PROXIES`.
 *
 * Shared because the adapter is constructed before Nest's DI container exists,
 * so `bootstrap` cannot read it from `AppConfigService` — and the two must not
 * be allowed to disagree about which hops are trusted.
 *
 * Trusting every hop (`true`) makes `X-Forwarded-For` caller-controlled, which
 * hands any client an unlimited supply of source addresses to spend against
 * per-IP rate limits. The env schema rejects it in production.
 */
export function parseTrustProxy(raw: string): boolean | string | string[] {
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  if (raw === 'loopback') return 'loopback';

  const hops = raw
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);

  const [only] = hops;

  return hops.length === 1 && only !== undefined ? only : hops;
}
