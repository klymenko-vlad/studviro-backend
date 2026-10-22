import { check } from 'k6';

import { API } from './config.js';
import { post } from './client.js';
import { signInDuration } from './metrics.js';

export function signIn(email, password) {
  const response = post(`${API}/auth/login`, null, { email, password }, [200, 201]);
  signInDuration.add(response.timings.duration);

  const ok = check(response, {
    'sign-in succeeded': (r) => r.status === 200 || r.status === 201,
  });

  return ok ? response.json('accessToken') : null;
}
