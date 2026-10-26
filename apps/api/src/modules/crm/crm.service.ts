import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DealDto } from './dto';

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async pipelines(tenantId: string) {
    let rows = await this.prisma.pipeline.findMany({
      where: { tenantId },
      include: {
        stages: {
          orderBy: { position: 'asc' },
          include: {
            deals: {
              where: { status: 'OPEN' },
              include: { company: true, contact: true, owner: { select: { id: true, name: true } } },
              orderBy: { updatedAt: 'desc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!rows.length) {
      await this.prisma.pipeline.create({
        data: {
          tenantId,
          name: 'Pipeline principal',
          isDefault: true,
          stages: {
            create: [
              { name: 'Novo', position: 1, probability: 10 },
              { name: 'Contato', position: 2, probability: 25 },
              { name: 'Qualificado', position: 3, probability: 50 },
              { name: 'Proposta', position: 4, probability: 75 },
              { name: 'Ganho', position: 5, probability: 100 },
            ],
          },
        },
      });
      rows = await this.prisma.pipeline.findMany({
        where: { tenantId },
        include: { stages: { orderBy: { position: 'asc' }, include: { deals: true } } },
      });
    }
    return rows;
  }

  async createDeal(tenantId: string, dto: DealDto) {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: dto.stageId, pipeline: { tenantId, id: dto.pipelineId } },
      select: { id: true },
    });
    if (!stage) throw new BadRequestException('Invalid pipeline stage');

    const [company, contact, owner] = await Promise.all([
      dto.companyId
        ? this.prisma.company.findFirst({ where: { id: dto.companyId, tenantId }, select: { id: true } })
        : Promise.resolve(null),
      dto.contactId
        ? this.prisma.contact.findFirst({ where: { id: dto.contactId, tenantId }, select: { id: true, companyId: true } })
        : Promise.resolve(null),
      dto.ownerId
        ? this.prisma.user.findFirst({ where: { id: dto.ownerId, tenantId, active: true }, select: { id: true } })
        : Promise.resolve(null),
    ]);

    if (dto.companyId && !company) throw new BadRequestException('Company does not belong to this tenant');
    if (dto.contactId && !contact) throw new BadRequestException('Contact does not belong to this tenant');
    if (dto.ownerId && !owner) throw new BadRequestException('Owner does not belong to this tenant');
    if (dto.companyId && contact?.companyId && contact.companyId !== dto.companyId) {
      throw new BadRequestException('Contact is not associated with the selected company');
    }

    return this.prisma.deal.create({
      data: {
        tenantId,
        ...dto,
        value: dto.value ?? 0,
        expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : undefined,
      },
    });
  }

  async move(tenantId: string, id: string, stageId: string) {
    const [deal, stage] = await Promise.all([
      this.prisma.deal.findFirst({ where: { id, tenantId }, select: { id: true } }),
      this.prisma.pipelineStage.findFirst({ where: { id: stageId, pipeline: { tenantId } } }),
    ]);
    if (!deal) throw new BadRequestException('Deal not found in tenant');
    if (!stage) throw new BadRequestException('Invalid pipeline stage');
    return this.prisma.deal.updateMany({
      where: { id, tenantId },
      data: { stageId, pipelineId: stage.pipelineId },
    });
  }

  async close(tenantId: string, id: string, status: 'WON' | 'LOST') {
    return this.prisma.deal.updateMany({
      where: { id, tenantId },
      data: { status, closedAt: new Date() },
    });
  }
}
