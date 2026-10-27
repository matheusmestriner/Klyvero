import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TooManyRequestsException } from './too-many-requests.exception';
import { createHmac } from 'crypto';
import { RedisService } from '../infra/redis/redis.service';

type LocalCounter = { count: number; expiresAt: number };

@Injectable()
export class PreAuthRateLimitGuard implements CanActivate {
  private readonly fallback = new Map<string, LocalCounter>();

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private fingerprint(value: string) {
    const secret = this.config.get<string>('AUTH_THROTTLE_SECRET')
      ?? this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    return createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);
  }

  private group(path: string) {
    if (
      path.includes('/auth/login') ||
      path.includes('/auth/refresh') ||
      path.includes('/auth/bootstrap') ||
      path.includes('/auth/forgot-password') ||
      path.includes('/auth/reset-password') ||
      path.includes('/auth/owner-recovery') ||
      path.includes('/signup')
    ) return 'auth';
    if (
      path.includes('/email/track/') ||
      path.includes('/email/unsubscribe/') ||
      path.includes('/email/inbound') ||
      path.includes('/billing/webhook') ||
      path.includes('/calendar/google/callback') ||
      path.includes('/internal/whatsapp/events')
    ) return 'public-sensitive';
    return 'edge';
  }

  private maxFor(group: string) {
    if (group === 'auth') return Number(this.config.get('AUTH_EDGE_RATE_LIMIT_MAX') ?? 30);
    if (group === 'public-sensitive') return Number(this.config.get('PUBLIC_EDGE_RATE_LIMIT_MAX') ?? 120);
    return Number(this.config.get('EDGE_RATE_LIMIT_MAX') ?? 600);
  }

  private trimFallback(now: number) {
    if (this.fallback.size < 20_000) return;
    for (const [key, value] of this.fallback) {
      if (value.expiresAt <= now) this.fallback.delete(key);
    }
    while (this.fallback.size >= 20_000) {
      const oldest = this.fallback.keys().next().value as string | undefined;
      if (!oldest) break;
      this.fallback.delete(oldest);
    }
  }

  private async increment(key: string, ttlSeconds: number) {
    try {
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, ttlSeconds + 2);
      return count;
    } catch {
      const now = Date.now();
      const existing = this.fallback.get(key);
      if (!existing || existing.expiresAt <= now) {
        this.trimFallback(now);
        this.fallback.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
        return 1;
      }
      existing.count += 1;
      return existing.count;
    }
  }

  async canActivate(ctx: ExecutionContext) {
    const request = ctx.switchToHttp().getRequest();
    const ip = String(request.ip ?? request.socket?.remoteAddress ?? 'unknown');
    const path = String(request.originalUrl ?? request.url ?? '/');
    const group = this.group(path);
    const windowSeconds = Number(this.config.get('EDGE_RATE_LIMIT_WINDOW_SECONDS') ?? 60);
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = `edge:${this.fingerprint(ip)}:${group}:${bucket}`;
    const count = await this.increment(key, windowSeconds);
    if (count > this.maxFor(group)) throw new TooManyRequestsException('Too many requests');
    return true;
  }
}
