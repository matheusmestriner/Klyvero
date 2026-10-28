'use client';

import { FormEvent, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { describeDelay, DelayUnit, previewTemplate, splitDelay, toMinutes } from './format';
import styles from './campaigns.module.css';
import { Campaign, CHANNEL_LABEL, Step, StepChannel, TEMPLATE_VARIABLES } from './types';

type Props = {
  campaign: Campaign;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

const UNIT_LABEL: Record<DelayUnit, string> = { minutes: 'minutos', hours: 'horas', days: 'dias' };

export function StepsDialog({ campaign, canManage, onClose, onChanged }: Props) {
  const [editing, setEditing] = useState<Step | 'new' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const steps = [...campaign.steps].sort((a, b) => a.position - b.position);
  const running = campaign.status === 'ACTIVE';

  async function remove(step: Step) {
    if (!window.confirm(`Remover o passo ${step.position}?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/campaigns/${campaign.id}/steps/${step.id}`, { method: 'DELETE' });
      await onChanged();
    } catch (caught: any) {
      setError(caught?.message || 'Não foi possível remover o passo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${styles.wide}`} role="dialog" aria-modal="true" aria-label={`Passos de ${campaign.name}`}>
        <div className="modalhead">
          <div>
            <h3>Passos · {campaign.name}</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Canal: {CHANNEL_LABEL[campaign.channel]}. O primeiro passo conta a partir do início da campanha; os demais, a partir do envio do anterior.
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
        </div>

        {error && <div className="error">{error}</div>}
        {running && <div className="notice">A campanha está ativa: mudanças valem para os próximos envios e passos só podem ser removidos com a campanha pausada.</div>}

        <div className={styles.steps}>
          {steps.length === 0 && <p className="muted">Nenhum passo ainda. Adicione o primeiro abaixo.</p>}
          {steps.map((step) => (
            <div className={styles.step} key={step.id}>
              <span className={styles.stepNumber}>{step.position}</span>
              <div className={styles.stepBody}>
                <strong>{step.channel === 'EMAIL' ? 'E-mail' : 'WhatsApp'}{step.subject ? ` · ${step.subject}` : ''}</strong>
                <small>{describeDelay(step.delayMinutes, step === steps[0])}</small>
                <p>{step.body}</p>
              </div>
              {canManage && (
                <div className={styles.stepActions}>
                  <button type="button" className="btn small" disabled={busy} onClick={() => setEditing(step)}>Editar</button>
                  <button type="button" className="btn small danger" disabled={busy || running} onClick={() => void remove(step)}>Remover</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {canManage && editing === null && (
          <button type="button" className="btn primary" onClick={() => setEditing('new')}>+ Novo passo</button>
        )}

        {canManage && editing !== null && (
          <StepEditor
            key={editing === 'new' ? 'new' : editing.id}
            campaign={campaign}
            step={editing === 'new' ? null : editing}
            nextPosition={(steps[steps.length - 1]?.position ?? 0) + 1}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await onChanged();
            }}
          />
        )}
      </div>
    </div>
  );
}

function StepEditor({ campaign, step, nextPosition, onCancel, onSaved }: {
  campaign: Campaign;
  step: Step | null;
  nextPosition: number;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const initialDelay = splitDelay(step?.delayMinutes ?? (nextPosition === 1 ? 0 : 2880));
  const allowed: StepChannel[] = campaign.channel === 'MULTICHANNEL' ? ['EMAIL', 'WHATSAPP'] : [campaign.channel];
  const [channel, setChannel] = useState<StepChannel>(step?.channel ?? allowed[0]);
  const [delayValue, setDelayValue] = useState(String(initialDelay.value));
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(initialDelay.unit);
  const [subject, setSubject] = useState(step?.subject ?? '');
  const [body, setBody] = useState(step?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const caretAfterInsert = useRef<number | null>(null);

  // Put the cursor right after an inserted variable once React has rendered the new text.
  useLayoutEffect(() => {
    const field = bodyRef.current;
    if (caretAfterInsert.current === null || !field) return;
    field.focus();
    field.setSelectionRange(caretAfterInsert.current, caretAfterInsert.current);
    caretAfterInsert.current = null;
  }, [body]);

  function insertVariable(key: string) {
    const field = bodyRef.current;
    const token = `{{${key}}}`;
    if (!field) return setBody((current) => current + token);
    const start = field.selectionStart ?? body.length;
    const end = field.selectionEnd ?? body.length;
    caretAfterInsert.current = start + token.length;
    setBody(body.slice(0, start) + token + body.slice(end));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(delayValue);
    if (!Number.isFinite(amount) || amount < 0) return setError('Informe um tempo de espera válido.');
    if (!body.trim()) return setError('Escreva a mensagem do passo.');

    setSaving(true);
    setError('');
    try {
      await api(`/campaigns/${campaign.id}/steps`, {
        method: 'POST',
        body: JSON.stringify({
          position: step?.position ?? nextPosition,
          delayMinutes: toMinutes(amount, delayUnit),
          channel,
          ...(channel === 'EMAIL' && subject.trim() ? { subject: subject.trim() } : {}),
          body,
        }),
      });
      await onSaved();
    } catch (caught: any) {
      setError(caught?.message || 'Não foi possível salvar o passo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.editor} onSubmit={submit}>
      <h4>{step ? `Editar passo ${step.position}` : `Novo passo ${nextPosition}`}</h4>
      {error && <div className="error">{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="step-channel">Canal</label>
          <select id="step-channel" value={channel} onChange={(event) => setChannel(event.target.value as StepChannel)} disabled={allowed.length === 1 || Boolean(step)}>
            {allowed.map((option) => <option key={option} value={option}>{option === 'EMAIL' ? 'E-mail' : 'WhatsApp'}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="step-delay">{(step?.position ?? nextPosition) === 1 ? 'Enviar após' : 'Esperar depois do passo anterior'}</label>
          <div className={styles.delayRow}>
            <input id="step-delay" type="number" min="0" step="1" value={delayValue} onChange={(event) => setDelayValue(event.target.value)} />
            <select aria-label="Unidade" value={delayUnit} onChange={(event) => setDelayUnit(event.target.value as DelayUnit)}>
              {(Object.keys(UNIT_LABEL) as DelayUnit[]).map((unit) => <option key={unit} value={unit}>{UNIT_LABEL[unit]}</option>)}
            </select>
          </div>
        </div>
      </div>
      {channel === 'EMAIL' && (
        <div className="field">
          <label htmlFor="step-subject">Assunto</label>
          <input id="step-subject" value={subject} maxLength={998} onChange={(event) => setSubject(event.target.value)} placeholder="Ex.: {{firstName}}, uma ideia para a {{companyName}}" />
        </div>
      )}
      <div className="field">
        <label htmlFor="step-body">Mensagem</label>
        <textarea id="step-body" ref={bodyRef} rows={7} value={body} maxLength={50000} onChange={(event) => setBody(event.target.value)} placeholder="Olá {{firstName}}, ..." required />
        <div className={styles.vars} aria-label="Variáveis">
          {TEMPLATE_VARIABLES.map((variable) => (
            <button key={variable.key} type="button" className={styles.var} onClick={() => insertVariable(variable.key)} title={`Exemplo: ${variable.sample}`}>
              {`{{${variable.key}}}`}
            </button>
          ))}
        </div>
        {channel === 'EMAIL' && <p className={styles.hint}>Os e-mails saem com um link de descadastro no final, automaticamente.</p>}
      </div>
      {body.trim() && (
        <div className={styles.preview}>
          <b>Pré-visualização com dados de exemplo</b>
          {channel === 'EMAIL' && subject.trim() ? `${previewTemplate(subject)}\n\n` : ''}
          {previewTemplate(body)}
        </div>
      )}
      <div className={styles.footer}>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="btn primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar passo'}</button>
      </div>
    </form>
  );
}
