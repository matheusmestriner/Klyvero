import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TooManyRequestsException } from './too-many-requests.exception';
import { createHmac } from 'crypto';
import { RedisService } from '../infra/redis/redis.service';
import { AuthUser } from './auth.types';

type LocalCounter = { count: number; expiresAt: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
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
      const current = this.fallback.get(key);
      if (!current || current.expiresAt <= now) {
        this.trimFallback(now);
        this.fallback.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
        return 1;
      }
      current.count += 1;
      return current.count;
    }
  }

  async canActivate(ctx: ExecutionContext) {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    const ip = String(request.ip ?? request.socket?.remoteAddress ?? 'unknown');
    const windowSeconds = Number(this.config.get('RATE_LIMIT_WINDOW_SECONDS') ?? 60);
    const isLogin = String(request.originalUrl ?? request.url ?? '').includes('/auth/login');
    const max = Number(this.config.get(isLogin ? 'LOGIN_RATE_LIMIT_MAX' : 'RATE_LIMIT_MAX') ?? (isLogin ? 10 : 180));
    const identity = user?.sub ? `principal:${user.sub}` : `ip:${ip}`;
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = `rate:${this.fingerprint(identity)}:${isLogin ? 'login' : 'api'}:${bucket}`;
    const count = await this.increment(key, windowSeconds);
    if (count > max) throw new TooManyRequestsException('Too many requests');
    return true;
  }
}
