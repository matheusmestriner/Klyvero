import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { NetworkSafetyService } from '../../infra/security/network-safety.service';

@Injectable()
export class WebhookWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private readonly logger = new Logger(WebhookWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly network: NetworkSafetyService,
  ) {}

  onModuleInit() {
    if (this.config.get('RUN_QUEUE_WORKERS') === 'false') return;
    this.worker = new Worker('webhooks', (job) => this.process(job), {
      connection: this.redis.client,
      prefix: this.config.get('QUEUE_PREFIX') ?? 'klyvero',
      concurrency: 12,
    });
  }

  private signingSecret(value: string) {
    if (!value.startsWith('enc:v1:')) return value; // migration compatibility
    const encoded = value.slice('enc:v1:'.length);
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { ciphertext: string; iv: string; authTag: string };
    return this.crypto.decrypt(payload);
  }

  private async process(job: Job<{ deliveryId: string }>) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: job.data.deliveryId },
      include: { endpoint: true },
    });
    if (!delivery || !delivery.endpoint.active) return;

    const body = JSON.stringify(delivery.requestBody);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = this.signingSecret(delivery.endpoint.secret);
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

    let attemptRecorded = false;
    try {
      const response = await this.network.postWebhook(delivery.endpoint.url, {
        'content-type': 'application/json',
        'user-agent': 'Klyvero-Webhooks/2.3',
        'x-klyvero-event': delivery.event,
        'x-klyvero-timestamp': timestamp,
        'x-klyvero-signature': `v1=${signature}`,
      }, body, 12_000);

      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts: { increment: 1 },
          responseStatus: response.status,
          responseBody: response.body,
          status: response.ok ? 'DELIVERED' : 'FAILED',
          deliveredAt: response.ok ? new Date() : null,
        },
      });
      attemptRecorded = true;
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
    } catch (error) {
      this.logger.warn(`Webhook delivery ${delivery.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      if (!attemptRecorded) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { attempts: { increment: 1 }, status: 'FAILED', responseBody: 'Delivery failed' },
        });
      }
      throw error;
    }
  }

  async onModuleDestroy() { await this.worker?.close(); }
}
