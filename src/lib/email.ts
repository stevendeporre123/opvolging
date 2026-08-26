import type { Env } from '../types';

export interface EmailAttachment {
  filename: string;
  content: string; // base64
  contentType: string;
}

export interface EmailOptions {
  to: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

/**
 * Verstuurt e-mail via de Resend API (https://resend.com). Vervang deze
 * functie gerust door een andere provider (Postmark, SendGrid, ...) - de
 * rest van de app roept enkel `sendEmail()` aan en weet niets van Resend.
 *
 * Vereist de secret RESEND_API_KEY (`wrangler secret put RESEND_API_KEY`).
 * Zolang die niet is ingesteld, wordt de mail enkel gelogd (handig voor
 * lokaal testen) en niet effectief verzonden.
 */
export async function sendEmail(env: Env, opts: EmailOptions): Promise<{ verzonden: boolean; reden?: string }> {
  if (!env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY niet ingesteld, mail wordt niet verzonden:', {
      to: opts.to,
      subject: opts.subject,
    });
    return { verzonden: false, reden: 'RESEND_API_KEY ontbreekt (zie README voor configuratie)' };
  }
  if (opts.to.length === 0) {
    return { verzonden: false, reden: 'Geen bestemmelingen opgegeven' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_AFZENDER,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[email] Versturen mislukt:', res.status, body);
    return { verzonden: false, reden: `Mailprovider gaf status ${res.status}` };
  }
  return { verzonden: true };
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function parseEmailList(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
}
