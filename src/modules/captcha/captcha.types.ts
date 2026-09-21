/**
 * ALTCHA's wire format, implemented rather than imported (ADR 0033).
 *
 * The client is handed a `challenge` — the SHA-256 of `salt + n` for an `n` the
 * server picked below `maxNumber` — and has to find `n` by hashing. There is no
 * puzzle to look at and nothing to get wrong, and the cost is linear in how
 * many times you submit the form.
 */
export interface CaptchaChallenge {
  readonly algorithm: 'SHA-256';
  readonly challenge: string;
  readonly salt: string;
  readonly maxnumber: number;
  readonly signature: string;
}

/** What the client sends back, base64 of this object's JSON. */
export interface CaptchaSolution {
  readonly algorithm: string;
  readonly challenge: string;
  readonly salt: string;
  readonly number: number;
  readonly signature: string;
}

export type CaptchaRefusal =
  | 'missing'
  | 'malformed'
  | 'wrong_algorithm'
  | 'expired'
  | 'bad_signature'
  | 'wrong_answer'
  | 'already_used';
