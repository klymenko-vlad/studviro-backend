import type { MailMessage } from './mail-message';

/** Where a composed message goes. Injected, so tests and development swap it. */
export abstract class MailTransport {
  abstract send(message: MailMessage): Promise<void>;
}
