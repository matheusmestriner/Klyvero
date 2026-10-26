import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
      // Without a Redis deployment, commands must reject fast (not queue forever)
      // so the auth guards' try/catch can fall back to in-memory limiting.
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }
}
