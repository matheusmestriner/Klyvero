'use client';

import { FormEvent, useState } from 'react';
import { api } from '../../../lib/api';
import { Campaign, CampaignChannel, CHANNEL_LABEL, Mailbox } from './types';

type Props = {
  campaign?: Campaign;
  mailboxes: Mailbox[];
  onClose: () => void;
  onSaved: (campaignId: string, created: boolean) => Promise<void> | void;
};

export function CampaignFormDialog({ campaign, mailboxes, onClose, onSaved }: Props) {
  const [name, setName] = useState(campaign?.name ?? '');
  const [channel, setChannel] = useState<CampaignChannel>(campaign?.channel ?? 'EMAIL');
  const [mailboxId, setMailboxId] = useState(campaign?.emailMailboxId ?? '');
  const [description, setDescription] = useState(campaign?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const usesEmail = channel !== 'WHATSAPP';
  const locked = campaign?.status === 'ACTIVE';
  const usable = mailboxes.filter((mailbox) => mailbox.active);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (campaign) {
        await api(`/campaigns/${campaign.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            ...(usesEmail && mailboxId && mailboxId !== campaign.emailMailboxId ? { emailMailboxId: mailboxId } : {}),
          }),
        });
        await onSaved(campaign.id, false);
      } else {
        const created = await api('/campaigns', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            channel,
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(usesEmail && mailboxId ? { emailMailboxId: mailboxId } : {}),
          }),
        });
        await onSaved(created.id, true);
      }
    } catch (caught: any) {
      setError(caught?.message || 'Não foi possível salvar a campanha.');
      setSaving(false);
    }
  }

  return (
    <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={campaign ? 'Editar campanha' : 'Nova campanha'}>
        <div className="modalhead">
          <h3>{campaign ? 'Editar campanha' : 'Nova campanha'}</h3>
          <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>Fechar</button>
        </div>
        {error && <div className="error">{error}</div>}

        <div className="field">
          <label htmlFor="campaign-name">Nome</label>
          <input id="campaign-name" value={name} minLength={2} maxLength={160} onChange={(event) => setName(event.target.value)} required autoFocus />
        </div>

        <div className="field">
          <label htmlFor="campaign-channel">Canal</label>
          <select id="campaign-channel" value={channel} onChange={(event) => setChannel(event.target.value as CampaignChannel)} disabled={Boolean(campaign)}>
            {(Object.keys(CHANNEL_LABEL) as CampaignChannel[]).map((option) => <option key={option} value={option}>{CHANNEL_LABEL[option]}</option>)}
          </select>
        </div>

        {usesEmail && (
          <div className="field">
            <label htmlFor="campaign-mailbox">Caixa de e-mail de envio</label>
            <select id="campaign-mailbox" value={mailboxId} onChange={(event) => setMailboxId(event.target.value)} disabled={locked}>
              <option value="">Selecione…</option>
              {usable.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.name} · {mailbox.fromAddress}</option>)}
            </select>
            {usable.length === 0 && <span className="muted" style={{ fontSize: 12 }}>Nenhuma caixa cadastrada. Configure uma em E-mail antes de iniciar a campanha.</span>}
            {locked && <span className="muted" style={{ fontSize: 12 }}>Pause a campanha para trocar a caixa.</span>}
          </div>
        )}

        <div className="field">
          <label htmlFor="campaign-description">Descrição (opcional)</label>
          <textarea id="campaign-description" rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>

        <button className="btn primary spaced" disabled={saving}>{saving ? 'Salvando…' : campaign ? 'Salvar' : 'Criar e definir passos'}</button>
      </form>
    </div>
  );
}
