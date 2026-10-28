import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<string, Queue>();
  private readonly prefix: string;

  constructor(private readonly redis: RedisService, config: ConfigService) {
    this.prefix = config.get<string>('QUEUE_PREFIX') ?? 'klyvero';
  }

  get(name: string) {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.redis.client, prefix: this.prefix });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }
}
