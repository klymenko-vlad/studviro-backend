export interface ComposedMail {
  subject: string;
  text: string;
  html: string;
}

export type MailLocale = 'en' | 'sk';

export interface MailContent {
  locale: MailLocale;
  subject: string;
  paragraphs: string[];
  action: { label: string; url: string };
  closing: string;
}

export function mailLocale(locale: string): MailLocale {
  return locale.toLowerCase().startsWith('sk') ? 'sk' : 'en';
}

export function mailDate(date: Date, locale: MailLocale): string {
  return new Intl.DateTimeFormat(locale === 'sk' ? 'sk-SK' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** One shape for every message: plain text first, and HTML that says the same. */
export function composeMail(content: MailContent): ComposedMail {
  const text = [
    ...content.paragraphs,
    `${content.action.label}: ${content.action.url}`,
    content.closing,
  ].join('\n\n');

  const href = safeHref(content.action.url);
  const html = [
    '<!doctype html>',
    `<html lang="${content.locale}"><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">`,
    ...content.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    href === null
      ? `<p>${escapeHtml(content.action.label)}</p>`
      : `<p><a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(content.action.label)}</a></p>` +
        `<p style="font-size:13px;color:#555">${escapeHtml(href)}</p>`,
    `<p>${escapeHtml(content.closing)}</p>`,
    '</body></html>',
  ].join('\n');

  return { subject: content.subject, text, html };
}

function safeHref(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
