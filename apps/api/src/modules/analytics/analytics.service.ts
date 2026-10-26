import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string) {
    const [leads, replied, qualified, meetings, deals, won, threads, campaigns] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId } }),
      this.prisma.lead.count({ where: { tenantId, status: 'REPLIED' } }),
      this.prisma.lead.count({ where: { tenantId, status: 'QUALIFIED' } }),
      this.prisma.calendarEvent.count({ where: { tenantId, status: 'SCHEDULED' } }),
      this.prisma.deal.count({ where: { tenantId } }),
      this.prisma.deal.aggregate({ where: { tenantId, status: 'WON' }, _sum: { value: true }, _count: true }),
      this.prisma.messageThread.count({ where: { tenantId } }),
      this.prisma.campaign.count({ where: { tenantId } }),
    ]);

    return {
      leads,
      replied,
      qualified,
      meetings,
      deals,
      wonDeals: won._count,
      wonRevenue: Number(won._sum.value ?? 0),
      threads,
      campaigns,
      replyRate: leads ? Math.round((replied / leads) * 10000) / 100 : 0,
      qualificationRate: leads ? Math.round((qualified / leads) * 10000) / 100 : 0,
    };
  }

  async dashboard(tenantId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 13);

    const [summary, recentLeadRows, recentLeads, campaigns, upcomingEvents, pipelines] = await Promise.all([
      this.summary(tenantId),
      this.prisma.lead.findMany({
        where: { tenantId, createdAt: { gte: start } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.lead.findMany({
        where: { tenantId },
        select: { id: true, firstName: true, lastName: true, companyName: true, email: true, status: true, score: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.campaign.findMany({
        where: { tenantId },
        select: { id: true, name: true, status: true, channel: true, updatedAt: true, _count: { select: { enrollments: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.calendarEvent.findMany({
        where: { tenantId, status: 'SCHEDULED', startsAt: { gte: new Date() } },
        select: { id: true, title: true, startsAt: true, endsAt: true, attendeeName: true, attendeeEmail: true, meetingUrl: true },
        orderBy: { startsAt: 'asc' },
        take: 5,
      }),
      this.prisma.pipeline.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          isDefault: true,
          stages: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              name: true,
              probability: true,
              color: true,
              deals: {
                where: { status: 'OPEN' },
                select: { value: true },
              },
            },
          },
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        take: 1,
      }),
    ]);

    const dayKeys: string[] = [];
    const counts = new Map<string, number>();
    for (let i = 0; i < 14; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = this.dayKey(date);
      dayKeys.push(key);
      counts.set(key, 0);
    }
    for (const lead of recentLeadRows) {
      const key = this.dayKey(lead.createdAt);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const leadTrend = dayKeys.map((key) => {
      const [year, month, day] = key.split('-');
      return { key, label: `${day}/${month}`, count: counts.get(key) ?? 0, year };
    });

    const pipeline = pipelines[0];
    const funnel = (pipeline?.stages ?? []).map((stage) => ({
      id: stage.id,
      name: stage.name,
      probability: stage.probability,
      color: stage.color,
      deals: stage.deals.length,
      value: stage.deals.reduce((total, deal) => total + Number(deal.value), 0),
    }));

    return {
      summary,
      leadTrend,
      recentLeads,
      campaigns,
      upcomingEvents,
      pipeline: pipeline ? { id: pipeline.id, name: pipeline.name, stages: funnel } : null,
    };
  }

  private dayKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
