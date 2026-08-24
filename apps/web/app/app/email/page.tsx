'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { PageTitle } from '../../../components/resource-page';
import { Icon } from '../../../components/icon';
import styles from './email.module.css';

type Message = {
  id: string;
  direction?: string;
  text?: string;
  subject?: string;
  createdAt?: string;
};

type Thread = {
  id: string;
  channel?: string;
  externalKey?: string;
  subject?: string;
  updatedAt?: string;
  contact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  messages?: Message[];
};

type Mailbox = {
  id: string;
  name?: string;
  fromAddress?: string;
};

export default function EmailPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [inboxPayload, mailboxPayload] = await Promise.all([
        api('/inbox'),
        api('/email/mailboxes').catch(() => []),
      ]);
      const inboxRows = normalizeList<Thread>(inboxPayload, ['threads', 'items', 'data']);
      setThreads(inboxRows.filter(isEmailThread));
      setMailboxes(normalizeList<Mailbox>(mailboxPayload, ['mailboxes', 'items', 'data']));
      setError('');
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível carregar os e-mails.');
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return threads
      .filter((thread) => {
        if (!needle) return true;
        return [threadName(thread), thread.contact?.email, thread.subject, lastText(thread)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
  }, [query, threads]);

  const selected = visible.find((thread) => thread.id === selectedId) || visible[0] || null;
  const messages = useMemo(
    () => (Array.isArray(selected?.messages) ? [...selected!.messages!] : []).sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt)),
    [selected],
  );

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  async function deleteStoredMessage(messageId: string) {
    const encoded = encodeURIComponent(messageId);
    try {
      await api(`/inbox/messages/${encoded}`, { method: 'DELETE' });
    } catch {
      await api(`/inbox/${encoded}`, { method: 'DELETE' });
    }
  }

  async function deleteMessage(item: Message) {
    if (!selected || deletingId) return;
    if (!window.confirm('Excluir este e-mail do histórico do Klyvero? Esta ação não pode ser desfeita.')) return;

    setDeletingId(`message:${item.id}`);
    setError('');
    setNotice('');
    try {
      await deleteStoredMessage(item.id);
      setThreads((rows) => rows.map((thread) => thread.id === selected.id
        ? { ...thread, messages: (thread.messages || []).filter((message) => message.id !== item.id) }
        : thread));
      setNotice('E-mail excluído do histórico.');
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível excluir o e-mail.');
    } finally {
      setDeletingId('');
    }
  }

  async function deleteConversation(thread: Thread) {
    if (deletingId) return;
    const items = Array.isArray(thread.messages) && thread.messages.length ? thread.messages : [{ id: thread.id }];
    if (!window.confirm(`Excluir a conversa de e-mail com “${threadName(thread)}”? Esta ação não pode ser desfeita.`)) return;

    setDeletingId(`thread:${thread.id}`);
    setError('');
    setNotice('');
    try {
      for (const item of items) await deleteStoredMessage(item.id);
      setThreads((rows) => rows.filter((row) => row.id !== thread.id));
      if (selectedId === thread.id) setSelectedId('');
      setNotice('Conversa de e-mail excluída.');
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível excluir a conversa.');
      await load();
    } finally {
      setDeletingId('');
    }
  }

  async function sendEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = new FormData(event.currentTarget);
    const mailboxId = String(form.get('mailboxId') || '');
    const to = String(form.get('to') || '').trim().toLowerCase();
    const subject = String(form.get('subject') || '').trim();
    const text = String(form.get('text') || '').trim();

    if (!mailboxId || !to || !subject || !text) {
      setError('Preencha caixa de envio, destinatário, assunto e mensagem.');
      return;
    }

    setSending(true);
    setError('');
    setNotice('');
    try {
      await api('/email/send', {
        method: 'POST',
        body: JSON.stringify({ mailboxId, to, subject, text }),
      });
      setComposeOpen(false);
      setNotice('E-mail enviado com sucesso.');
      await load();
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível enviar o e-mail.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageTitle
        title="E-mail"
        subtitle="Envie, consulte e gerencie conversas de e-mail do workspace."
        action={<button className="btn primary" type="button" onClick={() => setComposeOpen(true)}><Icon name="plus" size={16} /> Novo e-mail</button>}
      />

      {error && <div className={`error ${styles.banner}`}>{error}</div>}
      {notice && <div className={`notice ${styles.banner}`}>{notice}</div>}

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHead}>
            <div>
              <span className={styles.eyebrow}>Caixa de entrada</span>
              <strong>{visible.length} conversa{visible.length === 1 ? '' : 's'}</strong>
            </div>
            <button className="icon-btn" type="button" onClick={() => void load()} disabled={loading} aria-label="Atualizar e-mails"><Icon name="refresh" size={16} /></button>
          </div>

          <label className={styles.search}>
            <Icon name="search" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar remetente ou assunto..." />
          </label>

          <div className={styles.threadList}>
            {loading ? (
              <div className={styles.empty}><span className="auth-runtime-spinner" /><span>Carregando e-mails…</span></div>
            ) : visible.length ? visible.map((thread) => (
              <div key={thread.id} className={`${styles.threadRow} ${selected?.id === thread.id ? styles.threadRowActive : ''}`}>
                <button type="button" className={styles.thread} onClick={() => setSelectedId(thread.id)}>
                  <span className={styles.avatar}>{initials(threadName(thread))}</span>
                  <span className={styles.threadCopy}>
                    <span className={styles.threadTop}><strong>{threadName(thread)}</strong><small>{shortDate(thread.updatedAt)}</small></span>
                    <span>{thread.subject || '(sem assunto)'}</span>
                    <small>{lastText(thread) || 'Sem conteúdo de texto'}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.deleteThread}
                  disabled={Boolean(deletingId)}
                  onClick={() => void deleteConversation(thread)}
                  aria-label={`Excluir conversa com ${threadName(thread)}`}
                  title="Excluir conversa"
                ><Icon name="x" size={14} /></button>
              </div>
            )) : <div className={styles.empty}><Icon name="mail" size={28} /><strong>Nenhum e-mail</strong><span>As conversas aparecerão aqui.</span></div>}
          </div>
        </aside>

        <section className={styles.content}>
          {selected ? (
            <>
              <header className={styles.messageHead}>
                <div>
                  <span className={styles.eyebrow}>Conversa</span>
                  <strong>{selected.subject || '(sem assunto)'}</strong>
                  <span>{threadName(selected)} · {selected.contact?.email || selected.externalKey || 'e-mail não informado'}</span>
                </div>
                <button className={`${styles.danger} icon-btn`} type="button" disabled={Boolean(deletingId)} onClick={() => void deleteConversation(selected)} title="Excluir conversa" aria-label="Excluir conversa"><Icon name="x" size={15} /></button>
              </header>

              <div className={styles.messages}>
                {messages.length ? messages.map((item) => {
                  const outgoing = String(item.direction || '').toUpperCase() === 'OUTBOUND';
                  return (
                    <article key={item.id} className={`${styles.message} ${outgoing ? styles.messageOut : ''}`}>
                      <div className={styles.messageTitle}>
                        <strong>{item.subject || selected.subject || '(sem assunto)'}</strong>
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                      <p>{item.text || '[conteúdo sem texto]'}</p>
                      <div className={styles.messageFooter}>
                        <span>{outgoing ? 'Enviado' : 'Recebido'}</span>
                        <button type="button" className={styles.deleteMessage} disabled={Boolean(deletingId)} onClick={() => void deleteMessage(item)} title="Excluir e-mail" aria-label="Excluir e-mail"><Icon name="x" size={12} /></button>
                      </div>
                    </article>
                  );
                }) : <div className={styles.empty}><Icon name="mail" size={28} /><strong>Sem mensagens</strong><span>O histórico desta conversa está vazio.</span></div>}
              </div>
            </>
          ) : <div className={styles.empty}><Icon name="mail" size={34} /><strong>Selecione uma conversa</strong><span>Escolha um e-mail para visualizar o histórico.</span></div>}
        </section>
      </div>

      {composeOpen && (
        <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && setComposeOpen(false)}>
          <form className={`modal ${styles.compose}`} onSubmit={sendEmail}>
            <div className={styles.composeHead}><div><span className={styles.eyebrow}>Compor</span><h3>Novo e-mail</h3></div><button className="icon-btn" type="button" onClick={() => setComposeOpen(false)} aria-label="Fechar"><Icon name="x" size={16} /></button></div>
            <label>Caixa de envio<select name="mailboxId" required defaultValue={mailboxes[0]?.id || ''}><option value="">Selecione a caixa SMTP</option>{mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.name || mailbox.fromAddress || 'Caixa SMTP'}</option>)}</select></label>
            <label>Destinatário<input name="to" type="email" required placeholder="contato@empresa.com" /></label>
            <label>Assunto<input name="subject" required maxLength={200} /></label>
            <label>Mensagem<textarea name="text" required rows={8} maxLength={20000} /></label>
            <div className={styles.composeActions}><button className="btn ghost" type="button" onClick={() => setComposeOpen(false)}>Cancelar</button><button className="btn primary" type="submit" disabled={sending}><Icon name="send" size={15} /> {sending ? 'Enviando…' : 'Enviar e-mail'}</button></div>
          </form>
        </div>
      )}
    </>
  );
}

function normalizeList<T>(payload: any, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function isEmailThread(thread: Thread) {
  return String(thread.channel || '').toUpperCase().includes('EMAIL');
}

function threadName(thread: Thread) {
  const name = [thread.contact?.firstName, thread.contact?.lastName].filter(Boolean).join(' ').trim();
  return name || thread.contact?.email || thread.externalKey || 'Contato';
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'E';
}

function lastText(thread: Thread) {
  const rows = Array.isArray(thread.messages) ? thread.messages : [];
  const last = [...rows].sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt)).at(-1);
  return last?.text || last?.subject || '';
}

function timestamp(value?: string) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortDate(value?: string) {
  const time = timestamp(value);
  if (!time) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(time));
}

function formatDate(value?: string) {
  const time = timestamp(value);
  if (!time) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(time));
}
