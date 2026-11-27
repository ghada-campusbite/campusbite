import { Injectable, Logger } from '@nestjs/common';

// Resend over plain HTTPS (no SDK dependency). In development without a key the message is only logged.
@Injectable()
export class MailService {
  private log = new Logger(MailService.name);

  async send(to: string, subject: string, text: string): Promise<void> {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      if (process.env.NODE_ENV === 'production') throw new Error('RESEND_API_KEY missing');
      this.log.warn(`[dev mail] to=${to} subject=${subject}\n${text}`);
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`mail provider http ${res.status}`);
  }
}
