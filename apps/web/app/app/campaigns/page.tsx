'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageTitle } from '../../../components/resource-page';
import { useAuth } from '../../../components/app-shell';
import { api } from '../../../lib/api';
import { CampaignFormDialog } from './campaign-form-dialog';
import { EnrollDialog } from './enroll-dialog';
import { EnrollmentsDialog } from './enrollments-dialog';
import { StepsDialog } from './steps-dialog';
import styles from './campaigns.module.css';
import { Campaign, CAMPAIGN_STATUS_LABEL, CHANNEL_LABEL, Mailbox } from './types';

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit' | 'steps' | 'enroll' | 'leads'; id: string }
  | null;

const MANAGE_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SDR'];
const RUN_ROLES = ['OWNER', 'ADMIN', 'MANAGER'];

export default function CampaignsPage() {
  const { user } = useAuth();
  const canManage = MANAGE_ROLES.includes(user?.role ?? '');
  const canRun = RUN_ROLES.includes(user?.role ?? '');

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async (quiet = false) => {
    try {
      const [rows, boxes] = await Promise.all([api('/campaigns'), api('/email/mailboxes').catch(() => [])]);
      setCampaigns(Array.isArray(rows) ? rows : []);
      setMailboxes(Array.isArray(boxes) ? boxes : []);
      if (!quiet) setError('');
    } catch (caught: any) {
      if (!quiet) setError(caught?.message || 'Não foi possível carregar as campanhas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Status and counters change while the scheduler runs; keep the cards fresh without a reload.
    const timer = window.setInterval(() => !document.hidden && void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const current = useMemo(
    () => (dialog && 'id' in dialog ? campaigns.find((campaign) => campaign.id === dialog.id) ?? null : null),
    [campaigns, dialog],
  );

  async function run(campaign: Campaign, action: () => Promise<void>) {
    setBusyId(campaign.id);
    setError('');
    setNotice('');
    setWarnings([]);
    try {
      await action();
      await load(true);
    } catch (caught: any) {
      setError(caught?.message || 'Não foi possível concluir a ação.');
    } finally {
      setBusyId('');
    }
  }

  const start = (campaign: Campaign) => {
    const waiting = campaign.stats.active + campaign.stats.paused;
    if (!waiting) {
      setError('Adicione leads antes de iniciar a campanha.');
      return;
    }
    const verb = campaign.status === 'PAUSED' ? 'Retomar' : 'Iniciar';
    if (!window.confirm(`${verb} "${campaign.name}"? Mensagens reais serão enviadas para ${waiting} lead(s) conforme os tempos definidos.`)) return;
    return run(campaign, async () => {
      const result = await api(`/campaigns/${campaign.id}/start`, { method: 'POST' });
      setNotice(`${campaign.status === 'PAUSED' ? 'Campanha retomada' : 'Campanha iniciada'}: ${result.scheduled} lead(s) na fila${result.completed ? `, ${result.completed} já concluído(s)` : ''}.`);
      setWarnings(Array.isArray(result.warnings) ? result.warnings : []);
    });
  };

  const pause = (campaign: Campaign) =>
    run(campaign, async () => {
      await api(`/campaigns/${campaign.id}/pause`, { method: 'POST' });
      setNotice('Campanha pausada. Nenhuma mensagem nova será enviada até você retomar.');
    });

  const remove = (campaign: Campaign) => {
    if (!window.confirm(`Excluir "${campaign.name}" e todo o histórico de envios? Esta ação não pode ser desfeita.`)) return;
    return run(campaign, async () => {
      await api(`/campaigns/${campaign.id}`, { method: 'DELETE' });
      setNotice('Campanha excluída.');
    });
  };

  const refreshAfter = async (message?: string) => {
    if (message) setNotice(message);
    await load(true);
  };

  return (
    <>
      <PageTitle
        title="Campanhas"
        subtitle="Cadências automáticas de e-mail e WhatsApp. Quem responde sai da sequência; quem se descadastra nunca mais recebe."
        action={canManage ? <button className="btn primary" type="button" onClick={() => setDialog({ kind: 'create' })}>Nova campanha</button> : undefined}
      />

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      {warnings.length > 0 && (
        <div className="warning" role="status">
          <ul className={styles.warnings}>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}

      {loading ? (
        <p className="muted">Carregando campanhas…</p>
      ) : campaigns.length === 0 ? (
        <div className={styles.empty}>
          <strong>Nenhuma campanha ainda</strong>
          <span>Crie uma cadência, defina os passos, adicione leads e inicie.</span>
          {canManage && <button className="btn primary" type="button" onClick={() => setDialog({ kind: 'create' })}>Criar a primeira campanha</button>}
        </div>
      ) : (
        <div className={styles.grid}>
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              busy={busyId === campaign.id}
              canManage={canManage}
              canRun={canRun}
              onOpen={(kind) => setDialog({ kind, id: campaign.id })}
              onStart={() => void start(campaign)}
              onPause={() => void pause(campaign)}
              onRemove={() => void remove(campaign)}
            />
          ))}
        </div>
      )}

      {dialog?.kind === 'create' && (
        <CampaignFormDialog
          mailboxes={mailboxes}
          onClose={() => setDialog(null)}
          onSaved={async (id) => {
            await load(true);
            setNotice('Campanha criada. Defina agora os passos da cadência.');
            setDialog({ kind: 'steps', id });
          }}
        />
      )}
      {dialog?.kind === 'edit' && current && (
        <CampaignFormDialog
          campaign={current}
          mailboxes={mailboxes}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await refreshAfter('Campanha atualizada.');
          }}
        />
      )}
      {dialog?.kind === 'steps' && current && (
        <StepsDialog campaign={current} canManage={canManage} onClose={() => setDialog(null)} onChanged={() => load(true)} />
      )}
      {dialog?.kind === 'enroll' && current && (
        <EnrollDialog
          campaign={current}
          onClose={() => setDialog(null)}
          onDone={async (message) => {
            setDialog(null);
            await refreshAfter(message);
          }}
        />
      )}
      {dialog?.kind === 'leads' && current && (
        <EnrollmentsDialog campaign={current} canManage={canManage} onClose={() => setDialog(null)} onChanged={() => load(true)} />
      )}
    </>
  );
}

function CampaignCard({ campaign, busy, canManage, canRun, onOpen, onStart, onPause, onRemove }: {
  campaign: Campaign;
  busy: boolean;
  canManage: boolean;
  canRun: boolean;
  onOpen: (kind: 'edit' | 'steps' | 'enroll' | 'leads') => void;
  onStart: () => void;
  onPause: () => void;
  onRemove: () => void;
}) {
  const { stats } = campaign;
  const running = campaign.status === 'ACTIVE';
  const hasEmailStep = campaign.steps.some((step) => step.channel === 'EMAIL');
  const missingMailbox = hasEmailStep && !campaign.emailMailboxId;
  const enrolled = campaign._count.enrollments;

  // Why starting is not possible yet, in the order the user should fix it.
  const blocker = !campaign.steps.length ? 'Adicione ao menos um passo.'
    : missingMailbox ? 'Escolha a caixa de e-mail de envio (Editar).'
    : !stats.active && !stats.paused ? 'Adicione leads para começar.'
    : '';

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div style={{ minWidth: 0 }}>
          <h3>{campaign.name}</h3>
          <p className={styles.meta}>
            {CHANNEL_LABEL[campaign.channel]} · {campaign.steps.length} passo(s)
            {campaign.emailMailbox ? ` · ${campaign.emailMailbox.fromAddress}` : ''}
          </p>
        </div>
        <span className={`${styles.chip} ${running ? styles.chipActive : campaign.status === 'PAUSED' ? styles.chipPaused : ''}`}>
          {CAMPAIGN_STATUS_LABEL[campaign.status]}
        </span>
      </div>

      <div className={styles.stats}>
        <Stat label="Leads" value={enrolled} />
        <Stat label="Enviados" value={stats.sent} />
        <Stat label="Responderam" value={stats.replied} />
        <Stat label="Concluídos" value={stats.completed} />
      </div>
      {(stats.failed > 0 || stats.stopped > 0) && (
        <p className={`${styles.hint} ${stats.failed ? styles.hintWarn : ''}`}>
          {[stats.failed && `${stats.failed} com falha`, stats.stopped && `${stats.stopped} interrompido(s)`].filter(Boolean).join(' · ')}
        </p>
      )}
      {!running && blocker && canRun && <p className={`${styles.hint} ${styles.hintWarn}`}>{blocker}</p>}

      <div className={styles.actions}>
        <button type="button" className="btn small" onClick={() => onOpen('steps')}>Passos</button>
        {canManage && <button type="button" className="btn small" onClick={() => onOpen('enroll')}>Adicionar leads</button>}
        <button type="button" className="btn small" onClick={() => onOpen('leads')} disabled={!enrolled}>Ver leads</button>
        {canManage && <button type="button" className="btn small" onClick={() => onOpen('edit')}>Editar</button>}
        {canRun && (running
          ? <button type="button" className="btn small" disabled={busy} onClick={onPause}>Pausar</button>
          : <button type="button" className="btn primary small" disabled={busy || Boolean(blocker)} title={blocker || undefined} onClick={onStart}>{campaign.status === 'PAUSED' ? 'Retomar' : 'Iniciar'}</button>)}
        {canRun && !running && <button type="button" className="btn small danger" disabled={busy} onClick={onRemove}>Excluir</button>}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className={styles.stat}><b>{value}</b><span>{label}</span></div>;
}
