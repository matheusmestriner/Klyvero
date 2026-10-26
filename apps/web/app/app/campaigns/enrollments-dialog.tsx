'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { formatDateTime, leadName } from './format';
import styles from './campaigns.module.css';
import { Campaign, Enrollment, ENROLLMENT_LABEL, EnrollmentStatus } from './types';

type Props = { campaign: Campaign; canManage: boolean; onClose: () => void; onChanged: () => Promise<void> | void };

const CHIP: Partial<Record<EnrollmentStatus, string>> = {
  ACTIVE: styles.chipActive,
  PAUSED: styles.chipPaused,
  FAILED: styles.chipFailed,
  REPLIED: styles.chipReplied,
};

export function EnrollmentsDialog({ campaign, canManage, onClose, onChanged }: Props) {
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [status, setStatus] = useState<'' | EnrollmentStatus>('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const steps = [...campaign.steps].sort((a, b) => a.position - b.position);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await api(`/campaigns/${campaign.id}/enrollments?take=200${status ? `&status=${status}` : ''}`);
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (caught: any) {
      if (!quiet) setError(caught?.message || 'Não foi possível carregar os leads da campanha.');
    } finally {
      setLoading(false);
    }
  }, [campaign.id, status]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => !document.hidden && void load(true), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function act(row: Enrollment, action: 'stop' | 'retry') {
    if (action === 'stop' && !window.confirm(`Parar a cadência para ${leadName(row.lead)}? Os próximos passos não serão enviados.`)) return;
    setBusyId(row.id);
    setError('');
    try {
      if (action === 'stop') await api(`/campaigns/${campaign.id}/enrollments/${row.id}/stop`, { method: 'POST' });
      else await api(`/campaigns/${campaign.id}/enrollments/${row.id}/retry`, { method: 'POST' });
      await Promise.all([load(true), onChanged()]);
    } catch (caught: any) {
      setError(caught?.message || 'Não foi possível concluir a ação.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${styles.wide}`} role="dialog" aria-modal="true" aria-label="Leads da campanha">
        <div className="modalhead">
          <div>
            <h3>Leads · {campaign.name}</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>Atualiza sozinho a cada 10 segundos.</p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
        </div>

        <div className={styles.pickerTools}>
          <select aria-label="Filtrar por situação" value={status} onChange={(event) => setStatus(event.target.value as '' | EnrollmentStatus)} style={{ maxWidth: 220 }}>
            <option value="">Todas as situações</option>
            {(Object.keys(ENROLLMENT_LABEL) as EnrollmentStatus[]).map((option) => <option key={option} value={option}>{ENROLLMENT_LABEL[option]}</option>)}
          </select>
          <button type="button" className="btn small" onClick={() => void load()}>Atualizar</button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="card table-card">
          <table className="table">
            <thead>
              <tr><th>Lead</th><th>Situação</th><th>Passos</th><th>Próximo envio</th><th /></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="empty">Carregando…</td></tr> : rows.length === 0 ? (
                <tr><td colSpan={5} className="empty">Nenhum lead {status ? 'nessa situação' : 'na campanha ainda'}.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{leadName(row.lead)}</strong>
                    <div className="muted" style={{ fontSize: 11 }}>{row.lead.email || row.lead.phone || '—'}</div>
                  </td>
                  <td>
                    <span className={`${styles.chip} ${CHIP[row.status] ?? ''}`}>{ENROLLMENT_LABEL[row.status]}</span>
                    {row.status === 'REPLIED' && row.repliedAt && <div className="muted" style={{ fontSize: 11 }}>{formatDateTime(row.repliedAt)}</div>}
                    {row.lastError && row.status !== 'COMPLETED' && <span className={styles.err} title={row.lastError}>{row.lastError}</span>}
                  </td>
                  <td>
                    <span className={styles.runs} aria-label="Andamento dos passos">
                      {steps.map((step) => {
                        const run = row.runs.find((item) => item.step.id === step.id);
                        const state = run?.status ?? 'NONE';
                        return <span key={step.id} className={`${styles.dot} ${styles[`dot${state}`] ?? ''}`} title={`Passo ${step.position}: ${run ? runLabel(run.status) : 'ainda não agendado'}${run?.error ? ` — ${run.error}` : ''}`} />;
                      })}
                    </span>
                  </td>
                  <td>{row.status === 'ACTIVE' ? formatDateTime(row.nextRunAt) : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {canManage && (row.status === 'ACTIVE' || row.status === 'PAUSED') && (
                      <button type="button" className="btn small" disabled={busyId === row.id} onClick={() => void act(row, 'stop')}>Parar</button>
                    )}
                    {canManage && row.status === 'FAILED' && (
                      <button type="button" className="btn small" disabled={busyId === row.id} onClick={() => void act(row, 'retry')}>Tentar de novo</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function runLabel(status: string) {
  return ({ QUEUED: 'na fila', RUNNING: 'enviando', SENT: 'enviado', SKIPPED: 'pulado', FAILED: 'falhou', CANCELED: 'cancelado' } as Record<string, string>)[status] ?? status;
}
