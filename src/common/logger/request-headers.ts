/**
 * The request headers a log line keeps. Everything else is dropped, not
 * censored: the platforms in front of the API keep adding credentials under new
 * names — Vercel's `x-vercel-oidc-token`, `x-vercel-proxy-signature`, the Bearer
 * token inside `x-vercel-sc-headers`, the `sig=` in `forwarded` — and a list of
 * names to hide is always one header behind.
 */
export const LOGGED_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  'host',
  'user-agent',
  'referer',
  'origin',
  'content-type',
  'content-length',
  'accept',
  'accept-language',
  'x-request-id',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'cf-ray',
  'x-vercel-id',
  'rndr-id',
]);

export function loggedRequestHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(headers ?? {})) {
    if (LOGGED_REQUEST_HEADERS.has(name.toLowerCase())) kept[name] = value;
  }

  return kept;
}
