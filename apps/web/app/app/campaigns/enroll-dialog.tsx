'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { leadName } from './format';
import styles from './campaigns.module.css';
import { Campaign, Enrollment, LEAD_STATUS_LABEL, LeadRow } from './types';

type Props = {
  campaign: Campaign;
  onClose: () => void;
  onDone: (message: string) => Promise<void> | void;
};

const LEAD_LIMIT = 500;
const BATCH = 1000;

export function EnrollDialog({ campaign, onClose, onDone }: Props) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const channels = useMemo(() => {
    const used = new Set(campaign.steps.map((step) => step.channel));
    if (!used.size) (campaign.channel === 'MULTICHANNEL' ? ['EMAIL', 'WHATSAPP'] : [campaign.channel]).forEach((channel) => used.add(channel as 'EMAIL' | 'WHATSAPP'));
    return used;
  }, [campaign]);

  useEffect(() => {
    let active = true;
    Promise.all([api('/leads'), api(`/campaigns/${campaign.id}/enrollments?take=500`)])
      .then(([leadRows, enrollmentRows]: [LeadRow[], Enrollment[]]) => {
        if (!active) return;
        setLeads(Array.isArray(leadRows) ? leadRows : []);
        setEnrolled(new Set((Array.isArray(enrollmentRows) ? enrollmentRows : []).map((row) => row.lead.id)));
      })
      .catch((caught: any) => active && setError(caught?.message || 'Não foi possível carregar os leads.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [campaign.id]);

  const reachable = (lead: LeadRow) => (channels.has('EMAIL') && !!lead.email) || (channels.has('WHATSAPP') && !!lead.phone);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return leads.filter((lead) => !term || [leadName(lead), lead.companyName, lead.email, lead.phone].some((value) => value?.toLowerCase().includes(term)));
  }, [leads, query]);
  const selectable = visible.filter((lead) => reachable(lead) && !enrolled.has(lead.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const everySelected = selectable.length > 0 && selectable.every((lead) => selected.has(lead.id));
    setSelected((current) => {
      const next = new Set(current);
      selectable.forEach((lead) => (everySelected ? next.delete(lead.id) : next.add(lead.id)));
      return next;
    });
  }

  async function submit() {
    const ids = [...selected];
    if (!ids.length) return;
    setSaving(true);
    setError('');
    const total = { enrolled: 0, alreadyEnrolled: 0, withoutContact: 0 };
    try {
      for (let index = 0; index < ids.length; index += BATCH) {
        const result = await api(`/campaigns/${campaign.id}/enroll`, { method: 'POST', body: JSON.stringify({ leadIds: ids.slice(index, index + BATCH) }) });
        total.enrolled += result.enrolled ?? 0;
        total.alreadyEnrolled += result.alreadyEnrolled ?? 0;
        total.withoutContact += result.withoutContact ?? 0;
      }
      const parts = [`${total.enrolled} lead(s) adicionado(s)`];
      if (total.alreadyEnrolled) parts.push(`${total.alreadyEnrolled} já estavam na campanha`);
      if (total.withoutContact) parts.push(`${total.withoutContact} sem e-mail/telefone para este canal`);
      await onDone(parts.join(' · ') + (campaign.status === 'ACTIVE' ? '. O envio começa no próximo ciclo.' : '. Eles começam a receber quando você iniciar a campanha.'));
    } catch (caught: any) {
      setError(caught?.message || 'Não foi possível adicionar os leads.');
      setSaving(false);
    }
  }

  const contactNote = [channels.has('EMAIL') && 'e-mail', channels.has('WHATSAPP') && 'telefone'].filter(Boolean).join(' ou ');

  return (
    <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className={`modal ${styles.wide}`} role="dialog" aria-modal="true" aria-label="Adicionar leads">
        <div className="modalhead">
          <div>
            <h3>Adicionar leads · {campaign.name}</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>Só aparecem como selecionáveis leads com {contactNote} que ainda não estão na campanha.</p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>Fechar</button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className={styles.pickerTools}>
          <input type="search" placeholder="Buscar por nome, empresa, e-mail ou telefone" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="button" className="btn small" onClick={toggleAll} disabled={!selectable.length}>
            {selectable.length > 0 && selectable.every((lead) => selected.has(lead.id)) ? 'Limpar seleção' : `Selecionar ${selectable.length} visíveis`}
          </button>
        </div>

        <div className={styles.pickList}>
          {loading ? <p className="muted" style={{ padding: 16 }}>Carregando leads…</p> : visible.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>{leads.length ? 'Nenhum lead encontrado para essa busca.' : 'Você ainda não tem leads. Cadastre ou importe em Leads, ou salve resultados da Prospecção.'}</p>
          ) : visible.map((lead) => {
            const already = enrolled.has(lead.id);
            const blocked = !reachable(lead);
            const off = already || blocked;
            return (
              <label key={lead.id} className={`${styles.pickRow} ${off ? styles.pickRowOff : ''}`}>
                <input type="checkbox" checked={selected.has(lead.id)} disabled={off} onChange={() => toggle(lead.id)} />
                <span className={styles.pickName}><strong>{leadName(lead)}</strong><span>{lead.companyName || '—'}</span></span>
                <span className={styles.pickName}><strong>{lead.email || '—'}</strong><span>{lead.phone || '—'}</span></span>
                <span className={styles.chip}>{already ? 'Já inscrito' : blocked ? 'Sem contato' : LEAD_STATUS_LABEL[lead.status ?? 'NEW'] ?? 'Novo'}</span>
              </label>
            );
          })}
        </div>
        {leads.length >= LEAD_LIMIT && <p className={styles.hint} style={{ marginTop: 8 }}>Mostrando os {LEAD_LIMIT} leads mais recentes.</p>}

        <div className={styles.footer}>
          <span className="muted">{selected.size} selecionado(s)</span>
          <button type="button" className="btn primary" disabled={!selected.size || saving} onClick={() => void submit()}>
            {saving ? 'Adicionando…' : `Adicionar ${selected.size || ''} lead(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
