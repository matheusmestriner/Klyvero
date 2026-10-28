import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UsageService } from '../usage/usage.service';
import { NetworkSafetyService } from '../../infra/security/network-safety.service';
import { IcpDto, ImportProspectsDto, ProspectRowDto, ProviderSearchDto } from './dto';

@Injectable()
export class ProspectingService {
  private readonly logger = new Logger(ProspectingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly usage: UsageService,
    private readonly network: NetworkSafetyService,
  ) {}

  listIcp(tenantId: string) {
    return this.prisma.icpProfile.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  createIcp(tenantId: string, dto: IcpDto) {
    return this.prisma.icpProfile.create({ data: { tenantId, ...dto } });
  }

  listProspects(tenantId: string, status?: string) {
    return this.prisma.prospect.findMany({
      where: { tenantId, ...(status ? { status: status as any } : {}) },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
  }

  listJobs(tenantId: string) {
    return this.prisma.prospectingJob.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  private normalizeEmail(value?: string) {
    const v = value?.trim().toLowerCase();
    return v || undefined;
  }

  private normalizePhone(value?: string) {
    const v = value?.replace(/\D/g, '');
    return v || undefined;
  }

  private async score(tenantId: string, row: ProspectRowDto, icpId?: string) {
    if (typeof row.score === 'number') return row.score;
    const icp = icpId ? await this.prisma.icpProfile.findFirst({ where: { id: icpId, tenantId } }) : null;
    if (!icp) return 50;
    let points = 30;
    if (row.industry && icp.industries.some((v) => v.toLowerCase() === row.industry!.toLowerCase())) points += 20;
    if (row.country && icp.countries.some((v) => v.toLowerCase() === row.country!.toLowerCase())) points += 10;
    if (row.state && icp.states.some((v) => v.toLowerCase() === row.state!.toLowerCase())) points += 10;
    if (row.city && icp.cities.some((v) => v.toLowerCase() === row.city!.toLowerCase())) points += 10;
    if (row.jobTitle && icp.jobTitles.some((v) => row.jobTitle!.toLowerCase().includes(v.toLowerCase()))) points += 20;
    return Math.min(100, points);
  }

  private async upsertProspect(tenantId: string, row: ProspectRowDto, jobId?: string, icpId?: string) {
    const email = this.normalizeEmail(row.email);
    const phone = this.normalizePhone(row.phone);
    const existing = await this.prisma.prospect.findFirst({
      where: {
        tenantId,
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
          ...(!email && !phone && row.companyName && row.firstName
            ? [{ companyName: row.companyName, firstName: row.firstName, lastName: row.lastName }]
            : []),
        ],
      },
    });
    if (existing) {
      return this.prisma.prospect.update({
        where: { id: existing.id },
        data: { status: existing.status === 'CONVERTED' ? 'CONVERTED' : 'DUPLICATE', raw: row.raw as any },
      });
    }
    return this.prisma.prospect.create({
      data: {
        tenantId,
        jobId,
        firstName: row.firstName,
        lastName: row.lastName,
        companyName: row.companyName,
        jobTitle: row.jobTitle,
        email,
        phone,
        website: row.website,
        linkedinUrl: row.linkedinUrl,
        industry: row.industry,
        city: row.city,
        state: row.state,
        country: row.country,
        score: await this.score(tenantId, row, icpId),
        source: row.source ?? 'import',
        raw: row.raw as any,
      },
    });
  }

  async import(tenantId: string, dto: ImportProspectsDto, icpId?: string) {
    if (!dto.rows.length) throw new BadRequestException('No prospect rows supplied');
    if (icpId) {
      const icp = await this.prisma.icpProfile.findFirst({ where: { id: icpId, tenantId }, select: { id: true } });
      if (!icp) throw new NotFoundException('ICP profile not found');
    }
    await this.usage.assertAndIncrement(tenantId, 'prospects', dto.rows.length);
    const job = await this.prisma.prospectingJob.create({
      data: { tenantId, icpProfileId: icpId, provider: 'IMPORT', status: 'RUNNING', query: { name: dto.jobName ?? 'Import' } },
    });
    let resultCount = 0;
    try {
      for (const row of dto.rows) {
        await this.upsertProspect(tenantId, row, job.id, icpId);
        resultCount += 1;
      }
      await this.prisma.prospectingJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', resultCount, startedAt: job.createdAt, finishedAt: new Date() },
      });
      return { jobId: job.id, received: dto.rows.length, processed: resultCount };
    } catch (error) {
      await this.prisma.prospectingJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: error instanceof Error ? error.message : String(error), finishedAt: new Date() } });
      throw error;
    }
  }

  async providerSearch(tenantId: string, dto: ProviderSearchDto) {
    const url = this.config.get<string>('PROSPECT_PROVIDER_URL');
    const key = this.config.get<string>('PROSPECT_PROVIDER_API_KEY');
    if (!url || !key) throw new ServiceUnavailableException('Prospecting provider is not configured');
    const icp = dto.icpProfileId ? await this.prisma.icpProfile.findFirst({ where: { id: dto.icpProfileId, tenantId } }) : null;
    if (dto.icpProfileId && !icp) throw new NotFoundException('ICP profile not found');
    const job = await this.prisma.prospectingJob.create({ data: { tenantId, icpProfileId: dto.icpProfileId, provider: 'HTTP', status: 'RUNNING', query: dto.query as any, startedAt: new Date() } });
    try {
      const safe = await this.network.validateHttpUrl(url, 'webhook');
      const response = await fetch(safe.url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ icp, query: dto.query ?? {} }),
      });
      if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
      const payload: any = await response.json();
      const rows: ProspectRowDto[] = Array.isArray(payload) ? payload : payload.results;
      if (!Array.isArray(rows)) throw new Error('Provider response must be an array or {results: []}');
      const accepted = rows.slice(0, 5000);
      await this.usage.assertAndIncrement(tenantId, 'prospects', accepted.length);
      for (const row of accepted) await this.upsertProspect(tenantId, row, job.id, dto.icpProfileId);
      await this.prisma.prospectingJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', resultCount: accepted.length, finishedAt: new Date() } });
      return { jobId: job.id, resultCount: accepted.length, truncated: rows.length > accepted.length };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.prisma.prospectingJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: 'provider-request-failed', finishedAt: new Date() },
      });
      this.logger.warn(`Prospecting provider failed: ${detail}`);
      throw new ServiceUnavailableException('Prospecting provider failed');
    }
  }

  async convert(tenantId: string, prospectId: string) {
    const prospect = await this.prisma.prospect.findFirst({ where: { id: prospectId, tenantId } });
    if (!prospect) throw new NotFoundException('Prospect not found');
    if (prospect.convertedLeadId) return this.prisma.lead.findUnique({ where: { id: prospect.convertedLeadId } });
    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        firstName: prospect.firstName,
        lastName: prospect.lastName,
        companyName: prospect.companyName,
        jobTitle: prospect.jobTitle,
        email: prospect.email,
        phone: prospect.phone,
        linkedinUrl: prospect.linkedinUrl,
        website: prospect.website,
        source: prospect.source ?? 'prospecting',
        score: prospect.score,
        metadata: { prospectId: prospect.id },
      },
    });
    await this.prisma.prospect.update({ where: { id: prospect.id }, data: { status: 'CONVERTED', convertedLeadId: lead.id } });
    await this.prisma.leadActivity.create({ data: { tenantId, leadId: lead.id, type: 'prospect.converted', title: 'Prospect convertido em lead' } });
    return lead;
  }
}
