/**
 * The source gave a business answer — no seats, window closed, not eligible.
 * Deterministic: retrying produces the same answer, so the platform stops and
 * compensates rather than backing off. An adapter that cannot tell a refusal
 * from a transport failure must throw an ordinary error instead, because
 * retrying is recoverable and compensating wrongly is not.
 */
export class ConnectorRejectedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ConnectorRejectedError';
    Error.captureStackTrace(this, ConnectorRejectedError);
  }
}
