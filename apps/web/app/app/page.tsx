'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { PageTitle } from '../../components/resource-page';
import { Icon, IconName } from '../../components/icon';
import { useAuth } from '../../components/app-shell';

type DashboardData = {
  summary: {
    leads: number; replied: number; qualified: number; meetings: number; deals: number;
    wonDeals: number; wonRevenue: number; threads: number; campaigns: number;
    replyRate: number; qualificationRate: number;
  };
  leadTrend: Array<{ key: string; label: string; count: number }>;
  recentLeads: Array<{ id: string; firstName?: string; lastName?: string; companyName?: string; email?: string; status: string; score?: number; createdAt: string }>;
  campaigns: Array<{ id: string; name: string; status: string; channel: string; updatedAt: string; _count: { enrollments: number } }>;
  upcomingEvents: Array<{ id: string; title: string; startsAt: string; endsAt: string; attendeeName?: string; attendeeEmail?: string; meetingUrl?: string }>;
  pipeline: null | { id: string; name: string; stages: Array<{ id: string; name: string; probability: number; color?: string; deals: number; value: number }> };
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    api('/analytics/dashboard').then(setData).catch((err) => setError(err.message));
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  }, []);

  if (error) return <><PageTitle title="Dashboard" /><div className="error">{error}</div></>;
  if (!data) return <DashboardSkeleton />;

  const s = data.summary;
  const metrics: Array<{ label: string; value: string | number; detail: string; icon: IconName; tone: string; href: string }> = [
    { label: 'Leads ativos', value: formatNumber(s.leads), detail: `${s.qualified} qualificados`, icon: 'users', tone: 'indigo', href: '/app/leads' },
    { label: 'Taxa de resposta', value: `${s.replyRate}%`, detail: `${s.replied} respostas`, icon: 'message', tone: 'cyan', href: '/app/inbox' },
    { label: 'Reuniões', value: formatNumber(s.meetings), detail: 'agendadas', icon: 'calendar-check', tone: 'amber', href: '/app/calendar' },
    { label: 'Receita ganha', value: money(s.wonRevenue), detail: `${s.wonDeals} negócios ganhos`, icon: 'revenue', tone: 'emerald', href: '/app/crm' },
  ];

  return (
    <>
      <PageTitle
        title={`${greeting}${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        subtitle="Aqui está o desempenho da sua operação comercial hoje."
        action={<Link href="/app/campaigns" className="btn primary"><Icon name="plus" size={16}/> Nova campanha</Link>}
      />

      <div className="metric-grid">
        {metrics.map((metric) => (
          <Link href={metric.href} className="metric-card" key={metric.label}>
            <span className={`metric-icon ${metric.tone}`}><Icon name={metric.icon} /></span>
            <div className="metric-card-copy">
              <span className="metric-label">{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </div>
            <Icon name="arrow-up-right" className="metric-arrow" size={16}/>
          </Link>
        ))}
      </div>

      <div className="dashboard-main-grid spaced-lg">
        <section className="card dashboard-chart-card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Aquisição</span>
              <h3>Novos leads</h3>
              <p>Volume capturado nos últimos 14 dias.</p>
            </div>
            <Link className="text-link" href="/app/analytics">Ver analytics <Icon name="arrow-up-right" size={14}/></Link>
          </div>
          <TrendChart data={data.leadTrend} />
          <div className="chart-footer">
            <span><i className="legend-dot primary"/> Leads capturados</span>
            <strong>{data.leadTrend.reduce((sum, item) => sum + item.count, 0)} no período</strong>
          </div>
        </section>

        <section className="card funnel-card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Pipeline</span>
              <h3>Funil comercial</h3>
              <p>{data.pipeline?.name || 'Pipeline principal'}</p>
            </div>
            <Link className="icon-btn subtle" href="/app/crm" aria-label="Abrir CRM"><Icon name="arrow-up-right" size={16}/></Link>
          </div>
          {data.pipeline?.stages.length ? (
            <div className="funnel-list">
              {data.pipeline.stages.map((stage, index) => {
                const maxDeals = Math.max(...data.pipeline!.stages.map((item) => item.deals), 1);
                const width = stage.deals <= 0 ? 0 : Math.max(18, Math.round((stage.deals / maxDeals) * 100));
                return (
                  <div className="funnel-row" key={stage.id}>
                    <div className="funnel-meta"><span>{stage.name}</span><strong>{stage.deals}</strong></div>
                    <div className="funnel-track"><span style={{ width: `${width}%`, opacity: Math.max(.45, 1 - index * .1) }}/></div>
                    <small>{money(stage.value)}</small>
                  </div>
                );
              })}
            </div>
          ) : <EmptyMini icon="crm" title="Pipeline vazio" text="Crie oportunidades para visualizar o funil." />}
          <div className="rate-strip">
            <div><span>Resposta</span><strong>{s.replyRate}%</strong></div>
            <div><span>Qualificação</span><strong>{s.qualificationRate}%</strong></div>
            <div><span>Negócios</span><strong>{s.deals}</strong></div>
          </div>
        </section>
      </div>

      <div className="dashboard-lower-grid spaced-lg">
        <section className="card table-section">
          <div className="card-head">
            <div><span className="eyebrow">Leads</span><h3>Entradas recentes</h3></div>
            <Link className="text-link" href="/app/leads">Ver todos <Icon name="arrow-up-right" size={14}/></Link>
          </div>
          {data.recentLeads.length ? (
            <div className="compact-table">
              {data.recentLeads.map((lead) => (
                <div className="compact-row" key={lead.id}>
                  <span className="contact-avatar">{initials(lead.firstName, lead.lastName, lead.companyName)}</span>
                  <div className="compact-main">
                    <strong>{[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.companyName || lead.email || 'Lead'}</strong>
                    <span>{lead.companyName || lead.email || 'Sem empresa informada'}</span>
                  </div>
                  {typeof lead.score === 'number' && <span className="score-pill">{lead.score}</span>}
                  <span className={`status-pill status-${lead.status.toLowerCase()}`}>{statusLabel(lead.status)}</span>
                </div>
              ))}
            </div>
          ) : <EmptyMini icon="users" title="Nenhum lead ainda" text="Inicie uma prospecção ou importe sua primeira base." />}
        </section>

        <section className="card dashboard-side-card">
          <div className="card-head"><div><span className="eyebrow">Agenda</span><h3>Próximas reuniões</h3></div><Link className="icon-btn subtle" href="/app/calendar"><Icon name="arrow-up-right" size={16}/></Link></div>
          {data.upcomingEvents.length ? (
            <div className="agenda-list">
              {data.upcomingEvents.map((event) => (
                <div className="agenda-row" key={event.id}>
                  <div className="date-tile"><strong>{new Date(event.startsAt).getDate()}</strong><span>{monthShort(event.startsAt)}</span></div>
                  <div><strong>{event.title}</strong><span>{event.attendeeName || event.attendeeEmail || 'Sem participante'} · {timeShort(event.startsAt)}</span></div>
                </div>
              ))}
            </div>
          ) : <EmptyMini icon="calendar" title="Agenda livre" text="Nenhuma reunião futura agendada." />}
        </section>

        <section className="card dashboard-side-card">
          <div className="card-head"><div><span className="eyebrow">Outreach</span><h3>Campanhas</h3></div><Link className="icon-btn subtle" href="/app/campaigns"><Icon name="arrow-up-right" size={16}/></Link></div>
          {data.campaigns.length ? (
            <div className="campaign-mini-list">
              {data.campaigns.map((campaign) => (
                <div className="campaign-mini-row" key={campaign.id}>
                  <span className="channel-icon"><Icon name={campaign.channel === 'WHATSAPP' ? 'whatsapp' : 'mail'} size={16}/></span>
                  <div><strong>{campaign.name}</strong><span>{campaign._count.enrollments} leads · {campaign.channel}</span></div>
                  <span className={`status-dot ${campaign.status.toLowerCase()}`} title={campaign.status}/>
                </div>
              ))}
            </div>
          ) : <EmptyMini icon="campaigns" title="Sem campanhas" text="Crie sua primeira cadência de prospecção." />}
        </section>
      </div>
    </>
  );
}

function TrendChart({ data }: { data: DashboardData['leadTrend'] }) {
  const max = Math.max(...data.map((item) => item.count), 1);
  const width = 720;
  const height = 220;
  const padX = 18;
  const padY = 24;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;
  const points = data.map((item, index) => {
    const x = padX + (data.length <= 1 ? 0 : (index / (data.length - 1)) * usableW);
    const y = padY + usableH - (item.count / max) * usableH;
    return { ...item, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${padX},${height - padY} ${line} ${width - padX},${height - padY}`;

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Novos leads nos últimos 14 dias">
        {[0, 1, 2, 3].map((row) => <line key={row} x1={padX} x2={width - padX} y1={padY + row * (usableH / 3)} y2={padY + row * (usableH / 3)} className="chart-grid-line" />)}
        <polygon points={area} className="chart-area" />
        <polyline points={line} className="chart-line" />
        {points.map((point) => <circle key={point.key} cx={point.x} cy={point.y} r="4" className="chart-point"><title>{point.label}: {point.count} lead(s)</title></circle>)}
      </svg>
      <div className="trend-labels">{data.filter((_, index) => index % 3 === 0 || index === data.length - 1).map((item) => <span key={item.key}>{item.label}</span>)}</div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="page-title skeleton-title"><div><span className="skeleton w-220"/><span className="skeleton w-320 small"/></div></div>
      <div className="metric-grid">{Array.from({ length: 4 }).map((_, index) => <div className="metric-card skeleton-card" key={index}><span className="skeleton square"/><div><span className="skeleton w-100 small"/><span className="skeleton w-140 large"/></div></div>)}</div>
      <div className="dashboard-main-grid spaced-lg"><div className="card skeleton-panel"/><div className="card skeleton-panel"/></div>
    </>
  );
}

function EmptyMini({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return <div className="empty-state compact"><span className="empty-icon"><Icon name={icon} size={22}/></span><strong>{title}</strong><span>{text}</span></div>;
}

function money(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value || 0); }
function formatNumber(value: number) { return new Intl.NumberFormat('pt-BR').format(value || 0); }
function initials(first?: string, last?: string, company?: string) { const source = [first, last].filter(Boolean).join(' ') || company || 'L'; return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(''); }
function monthShort(value: string) { return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(value)).replace('.', '').toUpperCase(); }
function timeShort(value: string) { return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function statusLabel(value: string) { return ({ NEW: 'Novo', CONTACTED: 'Contatado', REPLIED: 'Respondeu', QUALIFIED: 'Qualificado', MEETING: 'Reunião', WON: 'Ganho', LOST: 'Perdido', BLOCKED: 'Bloqueado' } as Record<string, string>)[value] || value; }
