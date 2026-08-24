'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../components/app-shell';
import { PageTitle } from '../../../components/resource-page';
import { Icon, type IconName } from '../../../components/icon';

type BillingStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' | 'NONE' | string;

type UsageItem = {
  key: string;
  label: string;
  used?: number;
  limit?: number | null;
  icon: IconName;
};

type Invoice = {
  id?: string;
  number?: string;
  status?: string;
  amount?: number;
  amountCents?: number;
  currency?: string;
  createdAt?: string;
  dueAt?: string;
  hostedUrl?: string;
};

type BillingSnapshot = {
  configured: boolean;
  planName: string;
  status: BillingStatus;
  amount?: number;
  currency: string;
  interval?: string;
  renewsAt?: string | null;
  cancelsAtPeriodEnd?: boolean;
  paymentMethod?: {
    brand?: string;
    last4?: string;
    expMonth?: number;
    expYear?: number;
  } | null;
  usage: UsageItem[];
  invoices: Invoice[];
  features: string[];
};

const EMPTY_SNAPSHOT: BillingSnapshot = {
  configured: false,
  planName: 'Não configurado',
  status: 'NONE',
  currency: 'BRL',
  usage: [],
  invoices: [],
  features: [],
};

const BILLING_READ_ENDPOINTS = ['/billing', '/billing/subscription'];
const BILLING_PORTAL_ENDPOINTS = ['/billing/portal', '/billing/customer-portal'];

export default function BillingPage() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<BillingSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const canManageBilling = user?.role === 'OWNER' || user?.role === 'ADMIN';

  async function loadBilling() {
    if (!user) return;
    setLoading(true);
    setError('');
    setNotice('');

    let lastError: unknown = null;
    for (const path of BILLING_READ_ENDPOINTS) {
      try {
        const payload = await api(path);
        setSnapshot(normalizeBilling(payload));
        setLoading(false);
        return;
      } catch (caught) {
        lastError = caught;
      }
    }

    setSnapshot(EMPTY_SNAPSHOT);
    setNotice('A cobrança ainda não foi configurada para este workspace. A página permanece disponível sem expor ou inventar dados financeiros.');
    if (lastError instanceof Error && !isMissingEndpointError(lastError.message)) {
      setError('Não foi possível consultar os dados de cobrança agora. Tente novamente em alguns instantes.');
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  async function openBillingPortal() {
    if (!canManageBilling || portalLoading) return;
    setPortalLoading(true);
    setError('');
    setNotice('');

    let lastError: unknown = null;
    for (const path of BILLING_PORTAL_ENDPOINTS) {
      try {
        const payload = await api(path, { method: 'POST' });
        const rawUrl = typeof payload?.url === 'string' ? payload.url : typeof payload?.portalUrl === 'string' ? payload.portalUrl : '';
        const safeUrl = validateExternalHttpsUrl(rawUrl);
        if (!safeUrl) throw new Error('invalid_billing_portal_url');
        window.location.assign(safeUrl);
        return;
      } catch (caught) {
        lastError = caught;
      }
    }

    if (lastError instanceof Error && isMissingEndpointError(lastError.message)) {
      setNotice('O portal de cobrança ainda não está habilitado neste ambiente. Nenhuma alteração financeira foi realizada.');
    } else {
      setError('Não foi possível abrir o portal de cobrança. Tente novamente mais tarde.');
    }
    setPortalLoading(false);
  }

  if (user && !canManageBilling) {
    return (
      <div className="billing-access-denied card">
        <Icon name="shield" size={34} />
        <h2>Acesso restrito</h2>
        <p>Somente proprietário e administradores podem visualizar ou administrar cobrança.</p>
      </div>
    );
  }

  return (
    <>
      <PageTitle
        title="Plano e cobrança"
        subtitle="Acompanhe plano, consumo, método de pagamento e histórico financeiro do workspace."
        action={
          <button className="btn ghost" onClick={loadBilling} disabled={loading}>
            <Icon name="refresh" size={15} /> {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        }
      />

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <section className="billing-hero card">
        <div className="billing-plan-copy">
          <span className="eyebrow">Plano atual</span>
          <div className="billing-plan-title">
            <div className="billing-plan-icon"><Icon name="billing" size={22} /></div>
            <div>
              <h2>{loading ? 'Carregando…' : snapshot.planName}</h2>
              <span className={`billing-status ${statusTone(snapshot.status)}`}>{statusLabel(snapshot.status)}</span>
            </div>
          </div>
          <p>
            {snapshot.configured
              ? billingDescription(snapshot)
              : 'Conecte a camada de cobrança para acompanhar assinatura e faturas reais deste workspace.'}
          </p>
        </div>

        <div className="billing-price-panel">
          <span>Valor recorrente</span>
          <strong>{snapshot.amount == null ? '—' : formatMoney(snapshot.amount, snapshot.currency)}</strong>
          <small>{snapshot.interval ? `por ${intervalLabel(snapshot.interval)}` : 'sem ciclo informado'}</small>
          <button
            className="btn primary"
            onClick={openBillingPortal}
            disabled={!snapshot.configured || portalLoading || loading}
          >
            {portalLoading ? 'Abrindo…' : 'Gerenciar cobrança'}
            {!portalLoading && <Icon name="arrow-up-right" size={15} />}
          </button>
        </div>
      </section>

      <section className="billing-summary-grid">
        <SummaryCard
          icon="calendar-check"
          label="Próxima renovação"
          value={snapshot.renewsAt ? formatDate(snapshot.renewsAt) : '—'}
          detail={snapshot.cancelsAtPeriodEnd ? 'Cancelamento programado ao final do ciclo' : 'Renovação automática quando aplicável'}
        />
        <SummaryCard
          icon="shield"
          label="Status da assinatura"
          value={statusLabel(snapshot.status)}
          detail={snapshot.configured ? 'Sincronizado com a camada de cobrança' : 'Cobrança ainda não conectada'}
        />
        <SummaryCard
          icon="billing"
          label="Método de pagamento"
          value={paymentMethodLabel(snapshot.paymentMethod)}
          detail={paymentMethodDetail(snapshot.paymentMethod)}
        />
      </section>

      <section className="billing-layout-grid">
        <div className="card billing-section-card">
          <div className="billing-section-head">
            <div>
              <span className="eyebrow">Consumo</span>
              <h3>Uso incluído no plano</h3>
              <p className="muted">Os indicadores aparecem somente quando a API fornece limites reais.</p>
            </div>
          </div>

          {loading ? (
            <div className="billing-loading"><span className="auth-runtime-spinner" /> Carregando consumo…</div>
          ) : snapshot.usage.length ? (
            <div className="billing-usage-list">
              {snapshot.usage.map((item) => <UsageRow item={item} key={item.key} />)}
            </div>
          ) : (
            <div className="billing-empty-state">
              <Icon name="activity" size={28} />
              <strong>Nenhum limite informado</strong>
              <span>Não exibimos números fictícios. O consumo aparecerá aqui assim que o backend disponibilizar métricas do plano.</span>
            </div>
          )}
        </div>

        <div className="card billing-section-card">
          <div className="billing-section-head">
            <div>
              <span className="eyebrow">Recursos</span>
              <h3>O que está liberado</h3>
              <p className="muted">Benefícios efetivamente retornados para a assinatura atual.</p>
            </div>
          </div>

          {snapshot.features.length ? (
            <div className="billing-feature-list">
              {snapshot.features.map((feature) => (
                <div className="billing-feature" key={feature}>
                  <span><Icon name="check" size={14} /></span>
                  <strong>{feature}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="billing-empty-state compact">
              <Icon name="sparkles" size={28} />
              <strong>Recursos ainda não sincronizados</strong>
              <span>A lista será preenchida quando o plano estiver conectado ao backend de cobrança.</span>
            </div>
          )}
        </div>
      </section>

      <section className="card billing-section-card billing-invoices-card">
        <div className="billing-section-head billing-section-head-inline">
          <div>
            <span className="eyebrow">Histórico</span>
            <h3>Faturas</h3>
            <p className="muted">Valores e links só são exibidos quando vierem da API.</p>
          </div>
        </div>

        {snapshot.invoices.length ? (
          <div className="billing-table-wrap">
            <table className="table billing-table">
              <thead><tr><th>Fatura</th><th>Data</th><th>Status</th><th>Valor</th><th></th></tr></thead>
              <tbody>
                {snapshot.invoices.map((invoice, index) => {
                  const url = validateExternalHttpsUrl(invoice.hostedUrl || '');
                  return (
                    <tr key={invoice.id || invoice.number || index}>
                      <td><strong>{invoice.number || invoice.id || `Fatura ${index + 1}`}</strong></td>
                      <td>{formatDate(invoice.createdAt || invoice.dueAt)}</td>
                      <td><span className={`billing-status ${statusTone(invoice.status || '')}`}>{invoiceStatusLabel(invoice.status)}</span></td>
                      <td>{formatMoney(invoiceAmount(invoice), invoice.currency || snapshot.currency)}</td>
                      <td>{url ? <a className="text-link" href={url} target="_blank" rel="noreferrer">Visualizar</a> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="billing-empty-state invoices">
            <Icon name="billing" size={30} />
            <strong>Nenhuma fatura disponível</strong>
            <span>Quando houver documentos financeiros reais, eles serão listados aqui.</span>
          </div>
        )}
      </section>
    </>
  );
}

function SummaryCard({ icon, label, value, detail }: { icon: IconName; label: string; value: string; detail: string }) {
  return (
    <div className="card billing-summary-card">
      <div className="billing-summary-icon"><Icon name={icon} size={18} /></div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function UsageRow({ item }: { item: UsageItem }) {
  const hasLimit = typeof item.limit === 'number' && item.limit > 0;
  const used = Number.isFinite(item.used) ? Number(item.used) : 0;
  const percentage = hasLimit ? Math.min(100, Math.max(0, Math.round((used / Number(item.limit)) * 100))) : 0;

  return (
    <div className="billing-usage-row">
      <div className="billing-usage-icon"><Icon name={item.icon} size={17} /></div>
      <div className="billing-usage-content">
        <div className="billing-usage-copy">
          <strong>{item.label}</strong>
          <span>{item.used == null ? '—' : formatNumber(used)}{hasLimit ? ` de ${formatNumber(Number(item.limit))}` : ''}</span>
        </div>
        {hasLimit && <div className="billing-progress"><span style={{ width: `${percentage}%` }} /></div>}
      </div>
    </div>
  );
}

function normalizeBilling(payload: any): BillingSnapshot {
  const root = payload && typeof payload === 'object' ? payload : {};
  const subscription = root.subscription && typeof root.subscription === 'object' ? root.subscription : root;
  const rawPlan = subscription.plan && typeof subscription.plan === 'object' ? subscription.plan : root.plan && typeof root.plan === 'object' ? root.plan : {};
  const planName = String(rawPlan.name || rawPlan.label || subscription.planName || root.planName || (typeof root.plan === 'string' ? root.plan : '') || 'Plano atual');
  const status = String(subscription.status || root.status || 'ACTIVE').toUpperCase();
  const amount = firstNumber(rawPlan.amount, rawPlan.price, subscription.amount, root.amount, centsToMoney(rawPlan.amountCents), centsToMoney(subscription.amountCents), centsToMoney(root.amountCents));
  const currency = String(rawPlan.currency || subscription.currency || root.currency || 'BRL').toUpperCase();
  const interval = String(rawPlan.interval || subscription.interval || root.interval || '') || undefined;
  const renewsAt = subscription.currentPeriodEnd || subscription.renewsAt || root.renewsAt || root.currentPeriodEnd || null;
  const cancelsAtPeriodEnd = Boolean(subscription.cancelAtPeriodEnd ?? root.cancelAtPeriodEnd ?? false);
  const paymentMethodSource = root.paymentMethod || subscription.paymentMethod || null;
  const usageSource = root.usage && typeof root.usage === 'object' ? root.usage : root.limits && typeof root.limits === 'object' ? root.limits : {};
  const invoices = Array.isArray(root.invoices) ? root.invoices : Array.isArray(root.history) ? root.history : [];
  const featuresSource = Array.isArray(root.features) ? root.features : Array.isArray(rawPlan.features) ? rawPlan.features : [];

  return {
    configured: Boolean(root.configured ?? root.billingConfigured ?? subscription.id ?? subscription.subscriptionId ?? rawPlan.id ?? false),
    planName,
    status,
    amount,
    currency,
    interval,
    renewsAt: renewsAt ? String(renewsAt) : null,
    cancelsAtPeriodEnd,
    paymentMethod: paymentMethodSource && typeof paymentMethodSource === 'object' ? {
      brand: stringOrUndefined(paymentMethodSource.brand || paymentMethodSource.cardBrand),
      last4: stringOrUndefined(paymentMethodSource.last4),
      expMonth: numberOrUndefined(paymentMethodSource.expMonth || paymentMethodSource.exp_month),
      expYear: numberOrUndefined(paymentMethodSource.expYear || paymentMethodSource.exp_year),
    } : null,
    usage: normalizeUsage(usageSource),
    invoices: invoices.map((invoice: any) => ({
      id: stringOrUndefined(invoice?.id),
      number: stringOrUndefined(invoice?.number || invoice?.invoiceNumber),
      status: stringOrUndefined(invoice?.status),
      amount: numberOrUndefined(invoice?.amount || invoice?.total),
      amountCents: numberOrUndefined(invoice?.amountCents || invoice?.amount_cents || invoice?.totalCents),
      currency: stringOrUndefined(invoice?.currency),
      createdAt: stringOrUndefined(invoice?.createdAt || invoice?.created || invoice?.date),
      dueAt: stringOrUndefined(invoice?.dueAt || invoice?.due_date),
      hostedUrl: stringOrUndefined(invoice?.hostedUrl || invoice?.hosted_invoice_url || invoice?.url),
    })),
    features: featuresSource.map((feature: any) => typeof feature === 'string' ? feature : String(feature?.label || feature?.name || '')).filter(Boolean),
  };
}

function normalizeUsage(source: Record<string, any>): UsageItem[] {
  const definitions: Array<{ keys: string[]; key: string; label: string; icon: IconName }> = [
    { keys: ['users', 'seats', 'members'], key: 'users', label: 'Usuários', icon: 'users' },
    { keys: ['contacts', 'contactLimit'], key: 'contacts', label: 'Contatos', icon: 'contacts' },
    { keys: ['emails', 'emailSends'], key: 'emails', label: 'Envios de e-mail', icon: 'mail' },
    { keys: ['aiCredits', 'ai', 'credits'], key: 'ai', label: 'Créditos de IA', icon: 'sparkles' },
  ];

  const items: UsageItem[] = [];
  for (const definition of definitions) {
    const raw = definition.keys.map((key) => source?.[key]).find((value) => value != null);
    if (raw == null) continue;

    if (typeof raw === 'number') {
      items.push({ key: definition.key, label: definition.label, used: raw, limit: null, icon: definition.icon });
      continue;
    }

    if (typeof raw === 'object') {
      items.push({
        key: definition.key,
        label: String(raw.label || definition.label),
        used: numberOrUndefined(raw.used ?? raw.current ?? raw.value),
        limit: raw.limit == null && raw.max == null ? null : numberOrUndefined(raw.limit ?? raw.max),
        icon: definition.icon,
      });
    }
  }
  return items;
}

function billingDescription(snapshot: BillingSnapshot) {
  if (snapshot.cancelsAtPeriodEnd && snapshot.renewsAt) return `A assinatura permanece ativa até ${formatDate(snapshot.renewsAt)} e não será renovada automaticamente.`;
  if (snapshot.renewsAt) return `Próxima renovação prevista para ${formatDate(snapshot.renewsAt)}.`;
  return 'Assinatura conectada. O ciclo de renovação ainda não foi informado.';
}

function paymentMethodLabel(method: BillingSnapshot['paymentMethod']) {
  if (!method?.last4) return 'Não informado';
  const brand = method.brand ? method.brand.toUpperCase() : 'Cartão';
  return `${brand} •••• ${method.last4}`;
}

function paymentMethodDetail(method: BillingSnapshot['paymentMethod']) {
  if (!method?.expMonth || !method?.expYear) return 'Dados protegidos pelo provedor de pagamentos';
  return `Expira em ${String(method.expMonth).padStart(2, '0')}/${String(method.expYear).slice(-2)}`;
}

function statusLabel(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'ACTIVE') return 'Ativo';
  if (normalized === 'TRIALING' || normalized === 'TRIAL') return 'Período de teste';
  if (normalized === 'PAST_DUE') return 'Pagamento pendente';
  if (normalized === 'CANCELED' || normalized === 'CANCELLED') return 'Cancelado';
  if (normalized === 'INCOMPLETE') return 'Incompleto';
  if (normalized === 'NONE') return 'Não configurado';
  return normalized ? normalized.replaceAll('_', ' ') : 'Não informado';
}

function invoiceStatusLabel(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PAID') return 'Pago';
  if (normalized === 'OPEN') return 'Em aberto';
  if (normalized === 'VOID') return 'Cancelado';
  if (normalized === 'UNCOLLECTIBLE') return 'Não cobrável';
  return statusLabel(status);
}

function statusTone(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (['ACTIVE', 'PAID', 'TRIALING', 'TRIAL'].includes(normalized)) return 'success';
  if (['PAST_DUE', 'OPEN', 'INCOMPLETE'].includes(normalized)) return 'warning';
  if (['CANCELED', 'CANCELLED', 'VOID', 'UNCOLLECTIBLE'].includes(normalized)) return 'danger';
  return 'neutral';
}

function intervalLabel(interval: string) {
  const normalized = interval.toLowerCase();
  if (['month', 'monthly', 'mensal'].includes(normalized)) return 'mês';
  if (['year', 'yearly', 'annual', 'anual'].includes(normalized)) return 'ano';
  return interval;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatMoney(value: number, currency = 'BRL') {
  if (!Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function invoiceAmount(invoice: Invoice) {
  if (typeof invoice.amountCents === 'number') return invoice.amountCents / 100;
  return typeof invoice.amount === 'number' ? invoice.amount : 0;
}

function centsToMoney(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value / 100 : undefined;
}

function firstNumber(...values: unknown[]) {
  return values.find((value) => typeof value === 'number' && Number.isFinite(value)) as number | undefined;
}

function stringOrUndefined(value: unknown) {
  if (value == null || value === '') return undefined;
  return String(value);
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validateExternalHttpsUrl(value: string) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function isMissingEndpointError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('404') || normalized.includes('not found') || normalized.includes('cannot post') || normalized.includes('cannot get');
}
