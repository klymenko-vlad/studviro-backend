import { composeMail, mailLocale, type ComposedMail } from './mail-layout';

export function welcomeMail(input: {
  displayName: string;
  signInUrl: string;
  locale: string;
}): ComposedMail {
  const locale = mailLocale(input.locale);

  return locale === 'sk'
    ? composeMail({
        locale,
        subject: 'Vitajte v StudViro',
        paragraphs: [
          `Dobrý deň, ${input.displayName},`,
          'váš účet v StudViro je vytvorený. Prihlasujete sa e-mailovou adresou, na ktorú prišla táto správa.',
        ],
        action: { label: 'Prihlásiť sa', url: input.signInUrl },
        closing: 'StudViro',
      })
    : composeMail({
        locale,
        subject: 'Welcome to StudViro',
        paragraphs: [
          `Hello ${input.displayName},`,
          'your StudViro account is ready. You sign in with the address this message was sent to.',
        ],
        action: { label: 'Sign in', url: input.signInUrl },
        closing: 'StudViro',
      });
}
