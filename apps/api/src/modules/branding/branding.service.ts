import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BrandingDto } from './dto';

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService) {}

  update(tenantId: string, dto: BrandingDto) {
    return this.prisma.tenantBranding.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: dto,
    });
  }

  async resolveByDomain(hostname: string) {
    const normalized = hostname.trim().toLowerCase().split(':')[0];
    const domain = await this.prisma.tenantDomain.findUnique({
      where: { hostname: normalized },
      include: {
        tenant: { select: { id: true, name: true, slug: true, type: true, status: true } },
      },
    });

    if (!domain || domain.status !== 'VERIFIED' || domain.tenant.status !== 'ACTIVE') {
      throw new NotFoundException('Brand domain not found');
    }

    const resolved = await this.resolveTenantBranding(domain.tenantId);
    return {
      ...resolved,
      tenant: {
        id: domain.tenant.id,
        name: domain.tenant.name,
        slug: domain.tenant.slug,
        type: domain.tenant.type,
      },
      domain: { hostname: domain.hostname, isPrimary: domain.isPrimary },
    };
  }

  async resolveTenantBranding(tenantId: string) {
    const target = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, type: true, status: true, parentTenantId: true },
    });
    if (!target) throw new NotFoundException('Tenant not found');

    const chain: Array<{ id: string; parentTenantId: string | null }> = [];
    let current: { id: string; parentTenantId: string | null } | null = {
      id: target.id,
      parentTenantId: target.parentTenantId,
    };

    while (current) {
      chain.unshift(current);
      if (!current.parentTenantId) break;
      current = await this.prisma.tenant.findUnique({
        where: { id: current.parentTenantId },
        select: { id: true, parentTenantId: true },
      });
    }

    const tenantIds = chain.map((node) => node.id);
    const [layers, featureRows] = await Promise.all([
      this.prisma.tenantBranding.findMany({ where: { tenantId: { in: tenantIds } } }),
      this.prisma.tenantFeature.findMany({ where: { tenantId: { in: tenantIds } } }),
    ]);

    const layerByTenant = new Map(layers.map((layer) => [layer.tenantId, layer]));
    let branding: Record<string, unknown> = {
      productName: process.env.PLATFORM_DEFAULT_NAME ?? 'Klyvero',
      themeMode: 'SYSTEM',
    };

    for (const node of chain) {
      const layer = layerByTenant.get(node.id);
      if (!layer) continue;
      if (!layer.inheritFromParent) branding = {};

      for (const [key, value] of Object.entries(layer)) {
        if (
          !['id', 'tenantId', 'inheritFromParent', 'createdAt', 'updatedAt', 'customCss'].includes(key) &&
          value !== null &&
          value !== undefined
        ) {
          branding[key] = value;
        }
      }
    }

    // A disabled feature at any ancestor cannot be re-enabled by a descendant.
    const features: Record<string, { enabled: boolean; config?: unknown }> = {};
    for (const node of chain) {
      for (const row of featureRows.filter((item) => item.tenantId === node.id)) {
        const existing = features[row.key];
        if (existing?.enabled === false) continue;
        features[row.key] = { enabled: row.enabled, config: row.config ?? undefined };
      }
    }

    return {
      tenantId,
      tenant: { id: target.id, name: target.name, slug: target.slug, type: target.type },
      branding,
      features,
    };
  }
}
