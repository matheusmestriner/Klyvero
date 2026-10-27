'use client';

import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { PageTitle } from '../../../components/resource-page';
import { Icon } from '../../../components/icon';

type Deal = {
  id: string; title: string; value: number | string; expectedCloseAt?: string;
  company?: { name?: string }; contact?: { firstName?: string; lastName?: string };
  owner?: { name?: string };
};
type Stage = { id: string; name: string; probability: number; color?: string; deals?: Deal[] };
type Pipeline = { id: string; name: string; stages: Stage[] };

export default function CRM() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [show, setShow] = useState(false);
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api('/crm/pipelines')
    .then((payload: any) => {
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.data)
            ? payload.data
            : payload && typeof payload === 'object'
              ? [payload]
              : [];

      setPipelines(rows.map((row: any) => ({
        ...row,
        stages: Array.isArray(row?.stages)
          ? row.stages.map((stage: any) => ({ ...stage, deals: Array.isArray(stage?.deals) ? stage.deals : [] }))
          : [],
      })));
    })
    .catch(() => setPipelines([]));
  useEffect(() => { load(); }, []);
  const pipeline = pipelines[0];

  const stats = useMemo(() => {
    const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];
    const deals = stages.flatMap((stage) => Array.isArray(stage.deals) ? stage.deals : []);
    const total = deals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
    const weighted = stages.reduce((sum, stage) => sum + (Array.isArray(stage.deals) ? stage.deals : []).reduce((inner, deal) => inner + Number(deal.value || 0) * (Number(stage.probability || 0) / 100), 0), 0);
    return { count: deals.length, total, weighted };
  }, [pipeline]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pipeline) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api('/crm/deals', {
        method: 'POST',
        body: JSON.stringify({
          pipelineId: pipeline.id,
          stageId: String(form.get('stageId') || pipeline.stages?.[0]?.id || ''),
          title: form.get('title'),
          value: Number(form.get('value') || 0),
          expectedCloseAt: form.get('expectedCloseAt') || undefined,
          notes: form.get('notes') || undefined,
        }),
      });
      setShow(false);
      await load();
    } finally { setBusy(false); }
  }

  async function move(id: string, stageId: string) {
    await api(`/crm/deals/${id}/move`, { method: 'PATCH', body: JSON.stringify({ stageId }) });
    setDragging(null);
    load();
  }

  async function close(id: string, status: 'WON' | 'LOST') {
    await api(`/crm/deals/${id}/close?status=${status}`, { method: 'PATCH' });
    load();
  }

  function drop(event: DragEvent, stageId: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/deal-id');
    if (id) move(id, stageId);
  }

  return (
    <>
      <PageTitle
        title="CRM"
        subtitle="Gerencie oportunidades, valor de pipeline e evolução das negociações."
        action={<button className="btn primary" onClick={() => setShow(true)}><Icon name="plus" size={16}/> Nova oportunidade</button>}
      />

      <div className="crm-summary">
        <div><span>Oportunidades abertas</span><strong>{stats.count}</strong></div>
        <div><span>Valor em pipeline</span><strong>{money(stats.total)}</strong></div>
        <div><span>Receita ponderada</span><strong>{money(stats.weighted)}</strong></div>
        <div className="crm-search"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar oportunidade..." /></div>
      </div>

      {pipeline && Array.isArray(pipeline.stages) && pipeline.stages.length > 0 ? (
        <div className="kanban premium-kanban">
          {pipeline.stages.map((stage, stageIndex) => {
            const stageDeals = (stage.deals ?? []).filter((deal) => !query || deal.title.toLowerCase().includes(query.toLowerCase()) || deal.company?.name?.toLowerCase().includes(query.toLowerCase()));
            const stageValue = stageDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
            return (
              <section
                className={`col premium-col ${dragging ? 'drag-active' : ''}`}
                key={stage.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => drop(event, stage.id)}
              >
                <div className="col-head premium-col-head">
                  <div className="stage-title"><span className={`stage-dot stage-${stageIndex % 6}`} /> <b>{stage.name}</b><span className="stage-count">{stageDeals.length}</span></div>
                  <button className="icon-btn tiny" onClick={() => setShow(true)} aria-label={`Adicionar em ${stage.name}`}><Icon name="plus" size={14}/></button>
                </div>
                <div className="stage-value">{money(stageValue)} <span>· {stage.probability}% prob.</span></div>
                <div className="deal-list">
                  {stageDeals.map((deal) => (
                    <article
                      className="deal premium-deal"
                      key={deal.id}
                      draggable
                      onDragStart={(event) => { setDragging(deal.id); event.dataTransfer.setData('text/deal-id', deal.id); event.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => setDragging(null)}
                    >
                      <div className="deal-top"><span className="deal-grip">⠿</span><span className="deal-value">{money(Number(deal.value || 0))}</span></div>
                      <h4>{deal.title}</h4>
                      <div className="deal-meta">
                        {deal.company?.name && <span><Icon name="building" size={13}/>{deal.company.name}</span>}
                        {deal.owner?.name && <span><Icon name="users" size={13}/>{deal.owner.name}</span>}
                        {deal.expectedCloseAt && <span><Icon name="calendar" size={13}/>{shortDate(deal.expectedCloseAt)}</span>}
                      </div>
                      <div className="deal-actions">
                        <select value={stage.id} onChange={(event) => move(deal.id, event.target.value)} aria-label="Mover estágio">
                          {pipeline.stages.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
                        </select>
                        <div>
                          <button className="icon-btn tiny success-soft" onClick={() => close(deal.id, 'WON')} title="Marcar como ganho"><Icon name="check" size={14}/></button>
                          <button className="icon-btn tiny danger-soft" onClick={() => close(deal.id, 'LOST')} title="Marcar como perdido"><Icon name="x" size={14}/></button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {!stageDeals.length && <div className="stage-empty">Solte uma oportunidade aqui</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : <div className="card empty-state"><Icon name="crm" size={30}/><strong>CRM disponível</strong><span>Nenhum estágio de pipeline foi encontrado ainda. A tela permanece acessível e será atualizada quando o pipeline estiver disponível.</span></div>}

      {show && pipeline && Array.isArray(pipeline.stages) && pipeline.stages.length > 0 && (
        <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && setShow(false)}>
          <form className="modal deal-modal" onSubmit={add}>
            <div className="modalhead">
              <div><span className="eyebrow">CRM</span><h3>Nova oportunidade</h3><p className="muted">Adicione uma negociação ao pipeline.</p></div>
              <button type="button" className="icon-btn" onClick={() => setShow(false)} aria-label="Fechar"><Icon name="x"/></button>
            </div>
            <div className="field"><label>Título</label><input name="title" required placeholder="Ex.: Plano Enterprise — Empresa X" /></div>
            <div className="form-grid two">
              <div className="field"><label>Valor</label><input name="value" type="number" min="0" step="0.01" placeholder="0,00" /></div>
              <div className="field"><label>Estágio inicial</label><select name="stageId" defaultValue={pipeline.stages[0]?.id}>{pipeline.stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></div>
            </div>
            <div className="field"><label>Previsão de fechamento</label><input name="expectedCloseAt" type="datetime-local" /></div>
            <div className="field"><label>Observações</label><textarea name="notes" rows={4} placeholder="Contexto da negociação, próximos passos..." /></div>
            <div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setShow(false)}>Cancelar</button><button className="btn primary" disabled={busy}>{busy ? 'Criando...' : 'Criar oportunidade'}</button></div>
          </form>
        </div>
      )}
    </>
  );
}

function money(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value || 0); }
function shortDate(value: string) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value)).replace('.', ''); }
