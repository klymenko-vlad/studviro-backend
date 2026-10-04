import type { SessionContext } from './sessions/session-issuer.service';

/**
 * Recorded against each refresh token so a user can recognise their own
 * sessions, and so a leaked-token investigation has somewhere to start.
 */
export function sessionContextOf(request: unknown): SessionContext {
  const { headers, ip } = request as {
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
  };
  const agent = headers?.['user-agent'];

  return {
    userAgent: Array.isArray(agent) ? agent[0] : agent,
    ipAddress: ip,
  };
}
