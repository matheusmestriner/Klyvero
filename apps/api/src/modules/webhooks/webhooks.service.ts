import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QueueService } from '../../infra/queue/queue.service';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { NetworkSafetyService } from '../../infra/security/network-safety.service';
import { WebhookDto } from './dto';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly crypto: CryptoService,
    private readonly network: NetworkSafetyService,
  ) {}

  list(tenantId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      select: { id: true, name: true, url: true, events: true, active: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: WebhookDto) {
    await this.network.validateHttpUrl(dto.url, 'webhook');
    const rawSecret = randomBytes(32).toString('base64url');
    const encrypted = this.crypto.encrypt(rawSecret);
    const storedSecret = `enc:v1:${Buffer.from(JSON.stringify(encrypted), 'utf8').toString('base64url')}`;
    const row = await this.prisma.webhookEndpoint.create({
      data: { tenantId, ...dto, secret: storedSecret },
      select: { id: true, name: true, url: true, events: true, active: true },
    });
    // The signing secret is shown exactly once. Only the encrypted form is retained.
    return { ...row, secret: rawSecret };
  }

  async dispatch(tenantId: string, event: string, data: unknown) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId, active: true, OR: [{ events: { has: event } }, { events: { has: '*' } }] },
      select: { id: true },
    });
    const payload = { id: randomBytes(12).toString('hex'), event, createdAt: new Date().toISOString(), data };
    for (const endpoint of endpoints) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: { endpointId: endpoint.id, event, requestBody: payload as never, attempts: 0 },
      });
      await this.queues.get('webhooks').add('deliver', { deliveryId: delivery.id }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        jobId: `webhook-${delivery.id}`,
        removeOnComplete: 1000,
        removeOnFail: 2000,
      });
    }
    return { queued: endpoints.length, event, payloadId: payload.id };
  }

  deliveries(tenantId: string) {
    return this.prisma.webhookDelivery.findMany({
      where: { endpoint: { tenantId } },
      include: { endpoint: { select: { name: true, url: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async test(tenantId: string, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id, tenantId } });
    if (!endpoint) throw new NotFoundException();
    await this.network.validateHttpUrl(endpoint.url, 'webhook');
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        event: 'webhook.test',
        requestBody: { id: randomBytes(12).toString('hex'), event: 'webhook.test', createdAt: new Date().toISOString(), data: { message: 'Klyvero webhook test' } },
        attempts: 0,
      },
    });
    await this.queues.get('webhooks').add('deliver', { deliveryId: delivery.id }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      jobId: `webhook-${delivery.id}`,
    });
    return { queued: true, deliveryId: delivery.id };
  }
}
