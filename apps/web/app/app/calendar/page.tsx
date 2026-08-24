'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PageTitle } from '../../../components/resource-page';
import { Icon } from '../../../components/icon';
import { api } from '../../../lib/api';

type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  source?: 'KLYVERO' | 'GOOGLE' | string;
  syncStatus?: string;
  htmlLink?: string;
};

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  connectedAt?: string | null;
  lastSyncAt?: string | null;
  lastSyncCount?: number;
};

type ViewMode = 'month' | 'agenda';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [google, setGoogle] = useState<GoogleStatus>({ configured: false, connected: false });
  const [cursor, setCursor] = useState(() => firstOfMonth(new Date()));
  const [view, setView] = useState<ViewMode>('month');
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [status, rows] = await Promise.all([
        api('/calendar/google/status').catch(() => ({ configured: false, connected: false })),
        api('/calendar'),
      ]);
      setGoogle(status as GoogleStatus);
      setEvents(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar a agenda.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const query = new URLSearchParams(window.location.search);
    const googleResult = query.get('google');
    if (googleResult === 'connected') setMessage('Google Calendar conectado e sincronizado.');
    if (googleResult === 'failed') setError('Não foi possível concluir a conexão com o Google Calendar.');
    if (googleResult === 'invalid-state') setError('A autorização do Google expirou. Tente conectar novamente.');
    if (googleResult) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const monthDays = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dayKey(new Date(event.startsAt));
      const list = map.get(key) || [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return map;
  }, [events]);

  const upcoming = useMemo(() => {
    const floor = new Date();
    floor.setHours(0, 0, 0, 0);
    return [...events]
      .filter((event) => new Date(event.endsAt || event.startsAt) >= floor)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 40);
  }, [events]);

  function openCreate(date = new Date()) {
    const start = new Date(date);
    start.setHours(9, 0, 0, 0);
    setSelected(null);
    setDraftStart(start);
    setModalOpen(true);
    setMessage('');
    setError('');
  }

  function openEdit(event: CalendarEvent) {
    setSelected(event);
    setDraftStart(null);
    setModalOpen(true);
    setMessage('');
    setError('');
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const body = {
      title: String(form.get('title') || '').trim(),
      startsAt: new Date(String(form.get('startsAt') || '')).toISOString(),
      endsAt: new Date(String(form.get('endsAt') || '')).toISOString(),
      location: String(form.get('location') || '').trim(),
      description: String(form.get('description') || '').trim(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    };

    if (!body.title) {
      setError('Informe um título para o evento.');
      return;
    }
    if (new Date(body.endsAt) <= new Date(body.startsAt)) {
      setError('O término precisa ser posterior ao início.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (selected) {
        await api(`/calendar/${selected.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        setMessage('Evento atualizado.');
      } else {
        await api('/calendar', { method: 'POST', body: JSON.stringify(body) });
        setMessage(google.connected ? 'Evento criado e enviado para o Google Calendar.' : 'Evento criado na agenda do Klyvero.');
      }
      setModalOpen(false);
      setSelected(null);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o evento.');
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent() {
    if (!selected || saving) return;
    if (!window.confirm(`Excluir o evento “${selected.title}”?`)) return;
    setSaving(true);
    try {
      await api(`/calendar/${selected.id}`, { method: 'DELETE' });
      setModalOpen(false);
      setSelected(null);
      setMessage('Evento excluído.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível excluir o evento.');
    } finally {
      setSaving(false);
    }
  }

  async function connectGoogle() {
    setError('');
    try {
      const result = await api('/calendar/google/url');
      if (!result?.configured || !result?.url) {
        setError('A integração do Google Calendar ainda não foi configurada pelo administrador da plataforma.');
        return;
      }
      window.location.href = result.url;
    } catch (err: any) {
      setError(err?.message || 'Não foi possível iniciar a conexão com o Google Calendar.');
    }
  }

  async function syncGoogle() {
    if (!google.connected || syncing) return;
    setSyncing(true);
    setError('');
    try {
      const result = await api('/calendar/google/sync', { method: 'POST' });
      setMessage(`${Number(result?.synced || 0)} evento(s) sincronizado(s) com o Google Calendar.`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível sincronizar o Google Calendar.');
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectGoogle() {
    if (!window.confirm('Desconectar o Google Calendar deste workspace?')) return;
    try {
      await api('/calendar/google/disconnect', { method: 'POST' });
      setMessage('Google Calendar desconectado. Os eventos já importados permanecem visíveis até serem removidos.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível desconectar o Google Calendar.');
    }
  }

  return (
    <>
      <PageTitle
        title="Agenda"
        subtitle="Compromissos do Klyvero e do Google Calendar em um único lugar."
        action={<button className="btn primary" onClick={() => openCreate()}><Icon name="plus" size={16} /> Novo evento</button>}
      />

      {error && <div className="error calendar-feedback">{error}</div>}
      {message && <div className="notice calendar-feedback">{message}</div>}

      <section className="calendar-google card">
        <div className="calendar-google-copy">
          <span className={`calendar-google-dot ${google.connected ? 'connected' : ''}`} />
          <div>
            <strong>Google Calendar</strong>
            <span>
              {google.connected
                ? `Conectado${google.lastSyncAt ? ` · sincronizado ${relativeTime(google.lastSyncAt)}` : ''}`
                : google.configured
                  ? 'Pronto para conectar'
                  : 'Integração aguardando configuração'}
            </span>
          </div>
        </div>
        <div className="calendar-google-actions">
          {google.connected ? (
            <>
              <button className="btn" onClick={syncGoogle} disabled={syncing}>{syncing ? 'Sincronizando…' : 'Sincronizar agora'}</button>
              <button className="btn ghost" onClick={disconnectGoogle}>Desconectar</button>
            </>
          ) : (
            <button className="btn" onClick={connectGoogle}>Conectar Google Calendar</button>
          )}
        </div>
      </section>

      <div className="calendar-shell">
        <section className="card calendar-main">
          <div className="calendar-toolbar">
            <div className="calendar-navigation">
              <button className="calendar-nav-button" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Mês anterior">‹</button>
              <button className="calendar-nav-button" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Próximo mês">›</button>
              <button className="btn small" onClick={() => setCursor(firstOfMonth(new Date()))}>Hoje</button>
              <h2>{monthLabel(cursor)}</h2>
            </div>
            <div className="calendar-view-switch">
              <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Mês</button>
              <button className={view === 'agenda' ? 'active' : ''} onClick={() => setView('agenda')}>Lista</button>
            </div>
          </div>

          {loading ? (
            <div className="calendar-loading"><span className="auth-runtime-spinner" /><span>Carregando agenda…</span></div>
          ) : view === 'month' ? (
            <div className="calendar-grid-wrap">
              <div className="calendar-weekdays">{WEEKDAYS.map((day) => <div key={day}>{day}</div>)}</div>
              <div className="calendar-grid">
                {monthDays.map((date) => {
                  const key = dayKey(date);
                  const rows = eventsByDay.get(key) || [];
                  const outside = date.getMonth() !== cursor.getMonth();
                  const today = sameDay(date, new Date());
                  return (
                    <div key={key} className={`calendar-day ${outside ? 'outside' : ''} ${today ? 'today' : ''}`} onDoubleClick={() => openCreate(date)}>
                      <button className="calendar-day-number" onClick={() => openCreate(date)} aria-label={`Criar evento em ${formatDate(date)}`}>{date.getDate()}</button>
                      <div className="calendar-day-events">
                        {rows.slice(0, 3).map((calendarEvent) => (
                          <button key={calendarEvent.id} className={`calendar-event-chip ${calendarEvent.source === 'GOOGLE' ? 'google' : 'klyvero'}`} onClick={() => openEdit(calendarEvent)}>
                            <span>{calendarEvent.allDay ? 'Dia todo' : formatTime(calendarEvent.startsAt)}</span>
                            <strong>{calendarEvent.title}</strong>
                          </button>
                        ))}
                        {rows.length > 3 && <span className="calendar-more">+{rows.length - 3} evento(s)</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="calendar-agenda-list">
              {upcoming.length ? upcoming.map((calendarEvent) => (
                <button key={calendarEvent.id} className="calendar-agenda-row" onClick={() => openEdit(calendarEvent)}>
                  <div className="calendar-agenda-date"><strong>{new Date(calendarEvent.startsAt).getDate()}</strong><span>{shortMonth(calendarEvent.startsAt)}</span></div>
                  <div className="calendar-agenda-info"><strong>{calendarEvent.title}</strong><span>{eventRange(calendarEvent)}{calendarEvent.location ? ` · ${calendarEvent.location}` : ''}</span></div>
                  <span className={`calendar-source ${calendarEvent.source === 'GOOGLE' ? 'google' : 'klyvero'}`}>{calendarEvent.source === 'GOOGLE' ? 'Google' : 'Klyvero'}</span>
                </button>
              )) : <div className="empty-state"><Icon name="calendar" size={30} /><strong>Nenhum compromisso futuro</strong><span>Crie seu primeiro evento para começar a organizar a agenda.</span></div>}
            </div>
          )}
        </section>

        <aside className="card calendar-upcoming">
          <div className="calendar-upcoming-head"><div><span className="eyebrow">Próximos</span><h3>Compromissos</h3></div><Icon name="calendar" size={20} /></div>
          <div className="calendar-upcoming-list">
            {upcoming.slice(0, 8).map((calendarEvent) => (
              <button key={calendarEvent.id} onClick={() => openEdit(calendarEvent)}>
                <span className={`calendar-upcoming-marker ${calendarEvent.source === 'GOOGLE' ? 'google' : ''}`} />
                <div><strong>{calendarEvent.title}</strong><span>{eventRange(calendarEvent)}</span></div>
              </button>
            ))}
            {!upcoming.length && <p className="muted">Sem compromissos futuros.</p>}
          </div>
          <div className="calendar-legend"><span><i className="klyvero" />Klyvero</span><span><i className="google" />Google Calendar</span></div>
        </aside>
      </div>

      {modalOpen && (
        <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && setModalOpen(false)}>
          <form className="modal calendar-modal" onSubmit={saveEvent}>
            <div className="modalhead">
              <div><span className="eyebrow">{selected ? 'Editar compromisso' : 'Novo compromisso'}</span><h3>{selected ? selected.title : 'Criar evento'}</h3></div>
              <button type="button" className="btn ghost" onClick={() => setModalOpen(false)}><Icon name="x" size={15} /> Fechar</button>
            </div>

            <div className="field"><label>Título</label><input name="title" defaultValue={selected?.title || ''} required autoFocus /></div>
            <div className="form-grid">
              <div className="field"><label>Início</label><input name="startsAt" type="datetime-local" defaultValue={toLocalInput(selected?.startsAt || draftStart || new Date())} required /></div>
              <div className="field"><label>Término</label><input name="endsAt" type="datetime-local" defaultValue={toLocalInput(selected?.endsAt || addHours(draftStart || new Date(), 1))} required /></div>
            </div>
            <div className="field"><label>Local</label><input name="location" defaultValue={selected?.location || ''} placeholder="Sala, endereço ou link da reunião" /></div>
            <div className="field"><label>Descrição</label><textarea name="description" rows={4} defaultValue={selected?.description || ''} placeholder="Notas e contexto do compromisso" /></div>

            {selected && <div className="calendar-event-meta"><span className={`calendar-source ${selected.source === 'GOOGLE' ? 'google' : 'klyvero'}`}>{selected.source === 'GOOGLE' ? 'Google Calendar' : 'Klyvero'}</span>{selected.htmlLink && <a href={selected.htmlLink} target="_blank" rel="noreferrer">Abrir no Google</a>}</div>}

            <div className="calendar-modal-actions">
              {selected ? <button type="button" className="btn danger" onClick={removeEvent} disabled={saving}>Excluir evento</button> : <span />}
              <button className="btn primary" disabled={saving}>{saving ? 'Salvando…' : selected ? 'Salvar alterações' : 'Criar evento'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function firstOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function addMonths(date: Date, months: number) { return new Date(date.getFullYear(), date.getMonth() + months, 1); }
function addHours(date: Date, hours: number) { return new Date(date.getTime() + hours * 60 * 60 * 1000); }
function buildMonthGrid(date: Date) {
  const start = firstOfMonth(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}
function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function sameDay(a: Date, b: Date) { return dayKey(a) === dayKey(b); }
function monthLabel(date: Date) { return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date).replace(/^./, (value) => value.toUpperCase()); }
function shortMonth(value: string) { return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(value)).replace('.', '').toUpperCase(); }
function formatDate(date: Date) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(date); }
function formatTime(value: string) { return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function eventRange(event: CalendarEvent) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const day = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(start);
  return `${day} · ${formatTime(event.startsAt)}–${formatTime(event.endsAt)}`;
}
function toLocalInput(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'agora';
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `há ${Math.floor(diff / 3_600_000)} h`;
  return `há ${Math.floor(diff / 86_400_000)} d`;
}
