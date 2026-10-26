import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateApiKeyDto } from './dto';

const API_KEY_SCOPES = new Set([
  'ai_agents', 'analytics', 'billing', 'calendar', 'campaigns', 'companies',
  'contacts', 'crm', 'email', 'integrations', 'leads', 'prospecting',
  'whatsapp', 'white_label',
]);

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.apiKey.findMany({
      where: { tenantId },
      select: { id: true, name: true, prefix: true, scopes: true, active: true, lastUsedAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateApiKeyDto) {
    const scopes = [...new Set(dto.scopes.map((scope) => scope.trim()))];
    if (!scopes.length || scopes.some((scope) => !API_KEY_SCOPES.has(scope))) throw new BadRequestException('Invalid API key scope');
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('API key expiration must be in the future');
    const raw = `kly_${randomBytes(32).toString('base64url')}`;
    const keyHash = createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, 12);
    const record = await this.prisma.apiKey.create({ data: { tenantId, name: dto.name.trim(), prefix, keyHash, scopes, expiresAt } });
    return { id: record.id, name: record.name, prefix, scopes: record.scopes, apiKey: raw, warning: 'This key is shown only once.' };
  }

  revoke(tenantId: string, id: string) {
    return this.prisma.apiKey.updateMany({ where: { id, tenantId }, data: { active: false } });
  }
}
