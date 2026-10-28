import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CalendarEvent, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { google, calendar_v3 } from 'googleapis';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { RedisService } from '../../infra/redis/redis.service';

const SYNC_PAST_DAYS = 90;
const SYNC_FUTURE_DAYS = 365;
const MAX_PUSH = 500;
const MAX_IMPORT = 2500;

type IntegrationConfig = { scope?: string; connectedAt?: string; lastSyncAt?: string; lastSyncCount?: number };

@Injectable()
export class CalendarIntegrationService {
  private readonly logger = new Logger(CalendarIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  isConfigured() {
    return !!(
      this.config.get<string>('GOOGLE_CLIENT_ID') &&
      this.config.get<string>('GOOGLE_CLIENT_SECRET') &&
      this.config.get<string>('GOOGLE_REDIRECT_URI')
    );
  }

  private oauth() {
    const id = this.config.get<string>('GOOGLE_CLIENT_ID');
    const secret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirect = this.config.get<string>('GOOGLE_REDIRECT_URI');
    if (!id || !secret || !redirect) throw new ServiceUnavailableException('Google Calendar OAuth is not configured');
    return new google.auth.OAuth2(id, secret, redirect);
  }

  private stateSecret() { return this.config.getOrThrow<string>('OAUTH_STATE_SECRET'); }

  async connectUrl(tenantId: string, userId: string) {
    // The web UI expects { configured, url } and shows its own message when unconfigured.
    if (!this.isConfigured()) return { configured: false, url: null };
    const oauth = this.oauth();
    const nonce = randomUUID();
    const key = `oauth:google:${nonce}`;
    try {
      await this.redis.client.set(key, JSON.stringify({ tenantId, userId }), 'EX', 600, 'NX');
    } catch {
      throw new ServiceUnavailableException('OAuth state store is unavailable');
    }
    const state = await this.jwt.signAsync(
      { tenantId, userId, purpose: 'google-calendar', nonce, tokenType: 'oauth-state' },
      {
        secret: this.stateSecret(),
        algorithm: 'HS256',
        issuer: this.config.get('JWT_ISSUER') ?? 'klyvero-api',
        audience: 'google-oauth',
        expiresIn: '10m',
      },
    );
    return {
      configured: true,
      url: oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/calendar.events'], state }),
    };
  }

  private async consumeNonce(nonce: string) {
    const key = `oauth:google:${nonce}`;
    const script = "local v=redis.call('GET',KEYS[1]); if v then redis.call('DEL',KEYS[1]); end; return v";
    return this.redis.client.eval(script, 1, key) as Promise<string | null>;
  }

  async callback(code: string, state: string) {
    if (!code || !state || code.length > 4096 || state.length > 8192) throw new BadRequestException('Invalid OAuth callback');
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(state, {
        secret: this.stateSecret(),
        algorithms: ['HS256'],
        issuer: this.config.get('JWT_ISSUER') ?? 'klyvero-api',
        audience: 'google-oauth',
      });
    } catch {
      throw new BadRequestException('Invalid OAuth state');
    }
    if (payload.purpose !== 'google-calendar' || payload.tokenType !== 'oauth-state' || !payload.nonce) {
      throw new BadRequestException('Invalid OAuth state');
    }
    const consumed = await this.consumeNonce(String(payload.nonce));
    if (!consumed) throw new BadRequestException('OAuth state has expired or was already used');
    const expected = JSON.parse(consumed) as { tenantId: string; userId: string };
    if (expected.tenantId !== payload.tenantId || expected.userId !== payload.userId) throw new BadRequestException('OAuth state mismatch');

    const user = await this.prisma.user.findFirst({
      where: { id: payload.userId, tenantId: payload.tenantId, active: true, tenant: { status: 'ACTIVE' } },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('OAuth principal is no longer active');

    const oauth = this.oauth();
    const { tokens } = await oauth.getToken(code);
    const encrypted = this.crypto.encrypt(JSON.stringify(tokens));
    const secret = await this.prisma.secret.upsert({
      where: { tenantId_name: { tenantId: payload.tenantId, name: 'google-calendar-oauth' } },
      create: { tenantId: payload.tenantId, name: 'google-calendar-oauth', ...encrypted },
      update: encrypted,
    });
    const config: IntegrationConfig = { scope: 'calendar.events', connectedAt: new Date().toISOString() };
    const existing = await this.prisma.integration.findFirst({ where: { tenantId: payload.tenantId, type: 'GOOGLE_CALENDAR' } });
    if (existing) {
      await this.prisma.integration.update({ where: { id: existing.id }, data: { status: 'CONNECTED', secretRef: secret.id, config: config as Prisma.InputJsonObject } });
    } else {
      await this.prisma.integration.create({ data: { tenantId: payload.tenantId, type: 'GOOGLE_CALENDAR', name: 'Google Calendar', status: 'CONNECTED', secretRef: secret.id, config: config as Prisma.InputJsonObject } });
    }
    return payload.tenantId as string;
  }

  private async integration(tenantId: string) {
    return this.prisma.integration.findFirst({ where: { tenantId, type: 'GOOGLE_CALENDAR' } });
  }

  async status(tenantId: string) {
    const row = await this.integration(tenantId);
    const cfg = (row?.config ?? {}) as IntegrationConfig;
    return {
      configured: this.isConfigured(),
      connected: row?.status === 'CONNECTED',
      connectedAt: cfg.connectedAt ?? null,
      lastSyncAt: cfg.lastSyncAt ?? null,
      lastSyncCount: cfg.lastSyncCount ?? 0,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  private async client(tenantId: string) {
    const integration = await this.prisma.integration.findFirst({ where: { tenantId, type: 'GOOGLE_CALENDAR', status: 'CONNECTED' } });
    if (!integration?.secretRef) throw new ServiceUnavailableException('Google Calendar is not connected');
    const secret = await this.prisma.secret.findFirst({ where: { id: integration.secretRef, tenantId } });
    if (!secret) throw new ServiceUnavailableException('Google Calendar credential is missing');
    const oauth = this.oauth();
    oauth.setCredentials(JSON.parse(this.crypto.decrypt(secret)));
    oauth.on('tokens', async (tokens) => {
      const current = JSON.parse(this.crypto.decrypt(secret));
      const encrypted = this.crypto.encrypt(JSON.stringify({ ...current, ...tokens }));
      await this.prisma.secret.update({ where: { id: secret.id }, data: encrypted }).catch(() => undefined);
    });
    return google.calendar({ version: 'v3', auth: oauth });
  }

  private dateOnly(value: Date) { return value.toISOString().slice(0, 10); }

  private resource(event: CalendarEvent): calendar_v3.Schema$Event {
    let when: Pick<calendar_v3.Schema$Event, 'start' | 'end'>;
    if (event.allDay) {
      const start = this.dateOnly(event.startsAt);
      const end = event.endsAt > event.startsAt ? this.dateOnly(event.endsAt) : this.dateOnly(new Date(event.startsAt.getTime() + 86_400_000));
      when = { start: { date: start }, end: { date: end } };
    } else {
      when = {
        start: { dateTime: event.startsAt.toISOString(), timeZone: event.timezone },
        end: { dateTime: event.endsAt.toISOString(), timeZone: event.timezone },
      };
    }
    return {
      summary: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      ...when,
      attendees: event.attendeeEmail ? [{ email: event.attendeeEmail, displayName: event.attendeeName ?? undefined }] : undefined,
    };
  }

  private async push(calendar: calendar_v3.Calendar, event: CalendarEvent) {
    const requestBody = this.resource(event);
    let response;
    if (event.externalId) {
      try {
        response = await calendar.events.update({ calendarId: 'primary', eventId: event.externalId, requestBody });
      } catch (error: any) {
        // The remote copy was deleted on Google's side: recreate it.
        if (error?.code !== 404 && error?.code !== 410) throw error;
        response = await calendar.events.insert({ calendarId: 'primary', requestBody, conferenceDataVersion: 1 });
      }
    } else {
      response = await calendar.events.insert({ calendarId: 'primary', requestBody, conferenceDataVersion: 1 });
    }
    const updated = await this.prisma.calendarEvent.update({
      where: { id: event.id },
      data: {
        externalId: response.data.id ?? event.externalId,
        meetingUrl: response.data.hangoutLink ?? event.meetingUrl,
        htmlLink: response.data.htmlLink ?? event.htmlLink,
      },
    });
    return { externalId: response.data.id, htmlLink: response.data.htmlLink, meetingUrl: response.data.hangoutLink, event: updated };
  }

  async syncEvent(tenantId: string, eventId: string) {
    const event = await this.prisma.calendarEvent.findFirst({ where: { id: eventId, tenantId } });
    if (!event) throw new NotFoundException('Calendar event not found');
    const calendar = await this.client(tenantId);
    const { event: _event, ...result } = await this.push(calendar, event);
    return result;
  }

  /** Best effort: used right after create/update so connected workspaces mirror to Google. Never throws. */
  async trySyncEvent(tenantId: string, event: CalendarEvent): Promise<CalendarEvent> {
    try {
      const connected = await this.prisma.integration.findFirst({ where: { tenantId, type: 'GOOGLE_CALENDAR', status: 'CONNECTED' }, select: { id: true } });
      if (!connected) return event;
      const calendar = await this.client(tenantId);
      return (await this.push(calendar, event)).event;
    } catch (error) {
      this.logger.warn(`Google push failed for event ${event.id}: ${error instanceof Error ? error.message : String(error)}`);
      return event;
    }
  }

  /** Best effort removal of the Google copy when the local event is deleted. Never throws. */
  async tryDeleteRemote(tenantId: string, externalId: string | null | undefined) {
    if (!externalId) return;
    try {
      const connected = await this.prisma.integration.findFirst({ where: { tenantId, type: 'GOOGLE_CALENDAR', status: 'CONNECTED' }, select: { id: true } });
      if (!connected) return;
      const calendar = await this.client(tenantId);
      await calendar.events.delete({ calendarId: 'primary', eventId: externalId });
    } catch (error) {
      this.logger.warn(`Google delete failed for ${externalId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private fromGoogle(item: calendar_v3.Schema$Event) {
    const allDay = !item.start?.dateTime && !!item.start?.date;
    const startsAt = new Date(item.start?.dateTime ?? `${item.start?.date}T00:00:00.000Z`);
    let endsAt = new Date(item.end?.dateTime ?? `${item.end?.date}T00:00:00.000Z`);
    if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) endsAt = new Date(startsAt.getTime() + (allDay ? 86_400_000 : 3_600_000));
    const attendee = item.attendees?.find((entry) => !entry.self && entry.email) ?? undefined;
    return {
      title: (item.summary ?? '(sem título)').slice(0, 300),
      description: item.description ?? null,
      location: item.location ?? null,
      startsAt,
      endsAt,
      allDay,
      timezone: item.start?.timeZone ?? 'America/Sao_Paulo',
      attendeeName: attendee?.displayName ?? null,
      attendeeEmail: attendee?.email ?? null,
      htmlLink: item.htmlLink ?? null,
      meetingUrl: item.hangoutLink ?? null,
    };
  }

  /**
   * Two-way sync for the last 90 / next 365 days: pushes Klyvero events that are
   * new or changed locally, then imports (and updates/removes) Google events.
   */
  async sync(tenantId: string) {
    const calendar = await this.client(tenantId);
    const now = Date.now();
    const timeMin = new Date(now - SYNC_PAST_DAYS * 86_400_000);
    const timeMax = new Date(now + SYNC_FUTURE_DAYS * 86_400_000);

    let pushed = 0;
    let failed = 0;
    const lastSync = ((await this.integration(tenantId))?.config as IntegrationConfig | null)?.lastSyncAt;
    const local = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        source: 'KLYVERO',
        status: 'SCHEDULED',
        startsAt: { gte: timeMin, lte: timeMax },
        // Only what is new or changed since the previous sync.
        ...(lastSync ? { OR: [{ externalId: null }, { updatedAt: { gt: new Date(lastSync) } }] } : {}),
      },
      orderBy: { startsAt: 'asc' },
      take: MAX_PUSH,
    });
    for (const event of local) {
      try {
        await this.push(calendar, event);
        pushed += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`Google push failed for event ${event.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let imported = 0;
    let removed = 0;
    let pageToken: string | undefined;
    let seen = 0;
    do {
      const page = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
        pageToken,
      });
      for (const item of page.data.items ?? []) {
        if (!item.id) continue;
        seen += 1;
        const existing = await this.prisma.calendarEvent.findFirst({ where: { tenantId, externalId: item.id } });
        if (item.status === 'cancelled') {
          if (existing) {
            await this.prisma.calendarEvent.delete({ where: { id: existing.id } });
            removed += 1;
          }
          continue;
        }
        const data = this.fromGoogle(item);
        if (existing) {
          await this.prisma.calendarEvent.update({ where: { id: existing.id }, data });
        } else {
          await this.prisma.calendarEvent.create({ data: { tenantId, externalId: item.id, source: 'GOOGLE', ...data } });
        }
        imported += 1;
      }
      pageToken = page.data.nextPageToken ?? undefined;
    } while (pageToken && seen < MAX_IMPORT);

    const integration = await this.integration(tenantId);
    if (integration) {
      const cfg = { ...((integration.config ?? {}) as IntegrationConfig), lastSyncAt: new Date().toISOString(), lastSyncCount: pushed + imported };
      await this.prisma.integration.update({ where: { id: integration.id }, data: { config: cfg as Prisma.InputJsonObject } });
    }
    return { synced: pushed + imported, pushed, imported, removed, failed };
  }

  async disconnect(tenantId: string) {
    const integration = await this.integration(tenantId);
    if (!integration) return { ok: true, connected: false };
    if (integration.secretRef) {
      const secret = await this.prisma.secret.findFirst({ where: { id: integration.secretRef, tenantId } });
      if (secret) {
        try {
          const tokens = JSON.parse(this.crypto.decrypt(secret));
          const token = tokens.refresh_token ?? tokens.access_token;
          if (token && this.isConfigured()) await this.oauth().revokeToken(token);
        } catch (error) {
          this.logger.warn(`Google token revocation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        await this.prisma.secret.deleteMany({ where: { id: secret.id, tenantId } });
      }
    }
    await this.prisma.integration.update({ where: { id: integration.id }, data: { status: 'DISCONNECTED', secretRef: null } });
    return { ok: true, connected: false };
  }
}
