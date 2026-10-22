import { describe, expect, it } from 'vitest';

import { loggedRequestHeaders } from './request-headers';

describe('loggedRequestHeaders', () => {
  it('keeps the headers that trace a request', () => {
    expect(
      loggedRequestHeaders({
        host: 'studviro-backend.onrender.com',
        'user-agent': 'Mozilla/5.0',
        'x-request-id': 'fcb481a0',
        'x-vercel-id': 'fra1::4c62j',
      }),
    ).toEqual({
      host: 'studviro-backend.onrender.com',
      'user-agent': 'Mozilla/5.0',
      'x-request-id': 'fcb481a0',
      'x-vercel-id': 'fra1::4c62j',
    });
  });

  it('drops credentials, including ones the platform adds under its own names', () => {
    const kept = loggedRequestHeaders({
      host: 'api',
      authorization: 'Bearer user-token',
      cookie: 'sv_refresh=secret',
      'x-vercel-oidc-token': 'eyJ0eXAi',
      'x-vercel-proxy-signature': 'Bearer f949add1',
      'x-vercel-sc-headers': '{"Authorization":"Bearer eyJ0eXAi"}',
      forwarded: 'for=85.248.211.46;sig=0QmVhcmVy',
    });

    expect(kept).toEqual({ host: 'api' });
  });

  it('answers with nothing when there are no headers', () => {
    expect(loggedRequestHeaders(undefined)).toEqual({});
  });
});
