import { composeMail, mailLocale, type ComposedMail } from './mail-layout';

export function passwordResetMail(input: {
  resetUrl: string;
  expiresAt: Date;
  locale: string;
  now: Date;
}): ComposedMail {
  const locale = mailLocale(input.locale);
  const minutes = Math.max(
    1,
    Math.round((input.expiresAt.getTime() - input.now.getTime()) / 60_000),
  );

  return locale === 'sk'
    ? composeMail({
        locale,
        subject: 'Obnovenie hesla do StudViro',
        paragraphs: [
          'Niekto požiadal o nové heslo k vášmu účtu v StudViro.',
          `Odkaz platí ${minutes} minút a dá sa použiť raz. Ak ste o obnovenie nežiadali, tento e-mail ignorujte; heslo sa nezmení.`,
        ],
        action: { label: 'Nastaviť nové heslo', url: input.resetUrl },
        closing: 'StudViro',
      })
    : composeMail({
        locale,
        subject: 'Reset your StudViro password',
        paragraphs: [
          'Someone asked for a new password for your StudViro account.',
          `The link works for ${minutes} minutes and only once. If you did not ask, ignore this email; your password stays as it is.`,
        ],
        action: { label: 'Set a new password', url: input.resetUrl },
        closing: 'StudViro',
      });
}
