import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { NetworkSafetyService } from '../security/network-safety.service';

export type SystemMail = { to: string; subject: string; text: string; html?: string };

/**
 * Transactional mail (password recovery) sent through the platform SMTP account
 * configured by SMTP_DEFAULT_*. Tenant mailboxes used by campaigns are separate.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly config: ConfigService, private readonly network: NetworkSafetyService) {}

  isConfigured() {
    return !!this.config.get<string>('SMTP_DEFAULT_HOST') && !!this.from();
  }

  private from() {
    const explicit = this.config.get<string>('SMTP_DEFAULT_FROM')?.trim();
    if (explicit) return explicit;
    const user = this.config.get<string>('SMTP_DEFAULT_USER')?.trim();
    return user && user.includes('@') ? user : undefined;
  }

  async send(mail: SystemMail) {
    const host = this.config.get<string>('SMTP_DEFAULT_HOST')?.trim();
    const from = this.from();
    if (!host || !from) throw new ServiceUnavailableException('System mail is not configured');

    const resolved = await this.network.resolveHost(host, 'smtp');
    const secure = this.config.get('SMTP_DEFAULT_SECURE') === 'true';
    const production = this.config.get('NODE_ENV') === 'production';
    const user = this.config.get<string>('SMTP_DEFAULT_USER');
    const pass = this.config.get<string>('SMTP_DEFAULT_PASS');

    const transporter = nodemailer.createTransport({
      // Pin the validated IP to avoid DNS rebinding between validation and connect.
      host: resolved.address,
      port: Number(this.config.get('SMTP_DEFAULT_PORT') ?? 587),
      secure,
      name: host,
      requireTLS: production && !secure,
      auth: user ? { user, pass } : undefined,
      tls: { servername: host, rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });

    try {
      await transporter.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    } catch (error) {
      this.logger.warn(`System mail failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException('System mail failed');
    }
  }
}
