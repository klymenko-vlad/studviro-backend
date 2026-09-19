import http from 'k6/http';

import { serverErrors, unexpectedStatus } from './metrics.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * One request, with the two judgements every call site needs recorded:
 * whether the server broke, and whether it answered with a status this
 * scenario had a name for. A 409 on a full course is the system working; a
 * 500 or an unlisted status is not.
 */
export function call(method, url, { token, body, expect } = {}) {
  const headers = { ...JSON_HEADERS };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = http.request(method, url, body === undefined ? null : JSON.stringify(body), {
    headers,
  });

  serverErrors.add(response.status >= 500);
  if (expect) unexpectedStatus.add(!expect.includes(response.status));

  return response;
}

export function get(url, token, expect = [200]) {
  return call('GET', url, { token, expect });
}

export function post(url, token, body, expect = [200, 201]) {
  return call('POST', url, { token, body, expect });
}

export function errorCode(response) {
  try {
    return response.json('code');
  } catch {
    return null;
  }
}
