import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { resolveTxt } from 'dns/promises';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantAccessService } from '../../common/tenant.service';
import { AuthUser } from '../../common/auth.types';
import {
  CreateDomainDto,
  CreateTenantDto,
  CreateUserDto,
  UpdateFeatureDto,
  UpdateTenantDto,
} from './dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TenantAccessService,
  ) {}

  async list(user: AuthUser) {
    const output: Array<Record<string, unknown>> = [];
    let frontier = [user.tenantId];
    const seen = new Set<string>();

    while (frontier.length > 0) {
      const ids = frontier;
      frontier = [];

      const rows = await this.prisma.tenant.findMany({
        where: {
          OR: [{ id: { in: ids } }, { parentTenantId: { in: ids } }],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          status: true,
          parentTenantId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        output.push(row);
        if (row.id !== user.tenantId) frontier.push(row.id);
      }
    }

    return output;
  }

  async create(user: AuthUser, dto: CreateTenantDto) {
    const parentTenantId = dto.parentTenantId ?? user.tenantId;
    await this.access.assertTenant(user, parentTenantId);

    const parent = await this.prisma.tenant.findUnique({
      where: { id: parentTenantId },
      select: { type: true },
    });
    if (!parent) throw new BadRequestException('Parent tenant not found');

    const invalidHierarchy =
      dto.type === 'PLATFORM' ||
      parent.type === 'CUSTOMER' ||
      (parent.type === 'RESELLER' && dto.type !== 'CUSTOMER');
    if (invalidHierarchy) {
      throw new BadRequestException('Invalid tenant hierarchy');
    }

    return this.prisma.tenant.create({
      data: {
        name: dto.name.trim(),
        slug: dto.slug.trim().toLowerCase(),
        type: dto.type,
        parentTenantId,
        branding: { create: { inheritFromParent: true } },
      },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateTenantDto) {
    await this.access.assertTenant(user, id);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async users(user: AuthUser, tenantId: string) {
    await this.access.assertTenant(user, tenantId);
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUser(user: AuthUser, tenantId: string, dto: CreateUserDto) {
    await this.access.assertTenant(user, tenantId);
    if (dto.role === 'OWNER' && user.role !== 'OWNER') {
      throw new ForbiddenException('Only an OWNER can create another OWNER');
    }
    if (tenantId === user.tenantId && dto.role === 'OWNER' && user.role !== 'OWNER') {
      throw new ForbiddenException('Role escalation denied');
    }

    return this.prisma.user.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        passwordHash: await argon2.hash(dto.password),
        role: dto.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });
  }

  async features(user: AuthUser, tenantId: string) {
    await this.access.assertTenant(user, tenantId);
    return this.prisma.tenantFeature.findMany({
      where: { tenantId },
      orderBy: { key: 'asc' },
    });
  }

  async feature(
    user: AuthUser,
    tenantId: string,
    key: string,
    dto: UpdateFeatureDto,
  ) {
    await this.access.assertTenant(user, tenantId);
    const allowedKeys = new Set([
      'ai_agents', 'analytics', 'billing', 'calendar', 'campaigns', 'companies',
      'contacts', 'crm', 'email', 'integrations', 'leads', 'prospecting',
      'whatsapp', 'white_label',
    ]);
    if (!allowedKeys.has(key)) throw new BadRequestException('Unknown feature key');

    const target = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, type: true, parentTenantId: true },
    });
    if (!target) throw new NotFoundException('Tenant not found');

    // Customers/resellers cannot grant themselves product entitlements. A feature
    // is granted by an ancestor; only the platform tenant can govern its own flags.
    if (tenantId === user.tenantId && target.type !== 'PLATFORM') {
      throw new ForbiddenException('Self-service feature grants are not allowed');
    }

    if (dto.enabled) {
      const ancestors: string[] = [];
      let parentId = target.parentTenantId;
      while (parentId) {
        ancestors.push(parentId);
        const parent = await this.prisma.tenant.findUnique({
          where: { id: parentId },
          select: { parentTenantId: true },
        });
        parentId = parent?.parentTenantId ?? null;
      }
      const blocked = await this.prisma.tenantFeature.findFirst({
        where: { tenantId: { in: ancestors }, key, enabled: false },
        select: { id: true },
      });
      if (blocked) throw new ForbiddenException('Feature is disabled by an ancestor tenant');

      const subscription = await this.prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      });
      const planFeatures = subscription?.plan?.features as Record<string, unknown> | null | undefined;
      if (planFeatures && planFeatures[key] === false) {
        throw new ForbiddenException('Feature is not included in the active plan');
      }
    }

    return this.prisma.tenantFeature.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, enabled: dto.enabled, config: dto.config },
      update: { enabled: dto.enabled, config: dto.config },
    });
  }

  async domains(user: AuthUser, tenantId: string) {
    await this.access.assertTenant(user, tenantId);
    return this.prisma.tenantDomain.findMany({
      where: { tenantId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createDomain(user: AuthUser, tenantId: string, dto: CreateDomainDto) {
    await this.access.assertTenant(user, tenantId);
    const hostname = dto.hostname.trim().toLowerCase().replace(/\.$/, '');

    const existing = await this.prisma.tenantDomain.findUnique({
      where: { hostname },
    });
    if (existing) throw new ConflictException('Domain already registered');

    const verificationToken = randomBytes(24).toString('hex');
    const domain = await this.prisma.tenantDomain.create({
      data: { tenantId, hostname, verificationToken },
    });

    return {
      ...domain,
      dns: {
        type: 'TXT',
        name: `_klyvero-verification.${hostname}`,
        value: `klyvero-verification=${verificationToken}`,
      },
    };
  }

  async verifyDomain(user: AuthUser, tenantId: string, domainId: string) {
    await this.access.assertTenant(user, tenantId);
    const domain = await this.prisma.tenantDomain.findFirst({
      where: { id: domainId, tenantId },
    });
    if (!domain) throw new NotFoundException('Domain not found');

    const recordName = `_klyvero-verification.${domain.hostname}`;
    let records: string[][];
    try {
      records = await resolveTxt(recordName);
    } catch {
      await this.prisma.tenantDomain.update({
        where: { id: domain.id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException(`TXT record not found at ${recordName}`);
    }

    const expected = `klyvero-verification=${domain.verificationToken}`;
    const verified = records.map((parts) => parts.join('')).includes(expected);
    if (!verified) {
      await this.prisma.tenantDomain.update({
        where: { id: domain.id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException('DNS verification token does not match');
    }

    const hasPrimary = await this.prisma.tenantDomain.count({
      where: { tenantId, isPrimary: true },
    });

    return this.prisma.tenantDomain.update({
      where: { id: domain.id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
        isPrimary: hasPrimary === 0,
      },
    });
  }

  async setPrimaryDomain(user: AuthUser, tenantId: string, domainId: string) {
    await this.access.assertTenant(user, tenantId);
    const domain = await this.prisma.tenantDomain.findFirst({
      where: { id: domainId, tenantId, status: 'VERIFIED' },
    });
    if (!domain) throw new BadRequestException('Verified domain not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.tenantDomain.updateMany({
        where: { tenantId },
        data: { isPrimary: false },
      });
      return tx.tenantDomain.update({
        where: { id: domainId },
        data: { isPrimary: true },
      });
    });
  }
}
