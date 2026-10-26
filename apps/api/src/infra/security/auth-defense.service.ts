import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TooManyRequestsException } from '../../common/too-many-requests.exception';
import { createHmac } from 'crypto';
import { RedisService } from '../redis/redis.service';

type FallbackEntry = { count: number; expiresAt: number; lockedUntil?: number };

@Injectable()
export class AuthDefenseService {
  private readonly fallback = new Map<string, FallbackEntry>();

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private trimFallback(now: number) {
    for (const [key, value] of this.fallback) if (value.expiresAt <= now) this.fallback.delete(key);
    while (this.fallback.size >= 20_000) {
      const oldest = this.fallback.keys().next().value as string | undefined;
      if (!oldest) break;
      this.fallback.delete(oldest);
    }
  }

  private fingerprint(value: string) {
    const secret = this.config.get<string>('AUTH_THROTTLE_SECRET')
      ?? this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  private keys(tenantSlug: string, email: string, ip?: string) {
    const account = this.fingerprint(`${tenantSlug.trim().toLowerCase()}|${email.trim().toLowerCase()}`);
    const combo = this.fingerprint(`${account}|${ip ?? 'unknown'}`);
    return {
      account: `auth:fail:acct:${account}`,
      combo: `auth:fail:combo:${combo}`,
      accountLock: `auth:lock:acct:${account}`,
      comboLock: `auth:lock:combo:${combo}`,
    };
  }

  async assertAllowed(tenantSlug: string, email: string, ip?: string) {
    const keys = this.keys(tenantSlug, email, ip);
    try {
      const [accountLock, comboLock] = await this.redis.client.mget(keys.accountLock, keys.comboLock);
      if (accountLock || comboLock) throw new TooManyRequestsException('Authentication temporarily throttled');
      return;
    } catch (error) {
      if (error instanceof TooManyRequestsException) throw error;
      const now = Date.now();
      for (const key of [keys.accountLock, keys.comboLock]) {
        const entry = this.fallback.get(key);
        if (entry?.lockedUntil && entry.lockedUntil > now) throw new TooManyRequestsException('Authentication temporarily throttled');
      }
    }
  }

  async recordFailure(tenantSlug: string, email: string, ip?: string) {
    const keys = this.keys(tenantSlug, email, ip);
    const windowSeconds = Number(this.config.get('AUTH_FAILURE_WINDOW_SECONDS') ?? 900);
    const accountThreshold = Number(this.config.get('AUTH_ACCOUNT_FAILURE_LIMIT') ?? 20);
    const comboThreshold = Number(this.config.get('AUTH_COMBO_FAILURE_LIMIT') ?? 5);
    const accountLockSeconds = Number(this.config.get('AUTH_ACCOUNT_LOCK_SECONDS') ?? 300);
    const comboLockSeconds = Number(this.config.get('AUTH_COMBO_LOCK_SECONDS') ?? 600);

    try {
      const tx = this.redis.client.multi();
      tx.incr(keys.account).expire(keys.account, windowSeconds, 'NX');
      tx.incr(keys.combo).expire(keys.combo, windowSeconds, 'NX');
      const result = await tx.exec();
      const accountCount = Number(result?.[0]?.[1] ?? 0);
      const comboCount = Number(result?.[2]?.[1] ?? 0);
      const locks = this.redis.client.multi();
      if (accountCount >= accountThreshold) locks.set(keys.accountLock, '1', 'EX', accountLockSeconds);
      if (comboCount >= comboThreshold) locks.set(keys.comboLock, '1', 'EX', comboLockSeconds);
      await locks.exec();
      return;
    } catch {
      const now = Date.now();
      this.trimFallback(now);
      const bump = (key: string, threshold: number, lockKey: string, lockSeconds: number) => {
        let entry = this.fallback.get(key);
        if (!entry || entry.expiresAt <= now) entry = { count: 0, expiresAt: now + windowSeconds * 1000 };
        entry.count += 1;
        this.fallback.set(key, entry);
        if (entry.count >= threshold) this.fallback.set(lockKey, { count: 0, expiresAt: now + lockSeconds * 1000, lockedUntil: now + lockSeconds * 1000 });
      };
      bump(keys.account, accountThreshold, keys.accountLock, accountLockSeconds);
      bump(keys.combo, comboThreshold, keys.comboLock, comboLockSeconds);
    }
  }

  async recordSuccess(tenantSlug: string, email: string, ip?: string) {
    const keys = this.keys(tenantSlug, email, ip);
    try {
      await this.redis.client.del(keys.account, keys.combo, keys.accountLock, keys.comboLock);
    } catch {
      for (const key of Object.values(keys)) this.fallback.delete(key);
    }
  }
}
