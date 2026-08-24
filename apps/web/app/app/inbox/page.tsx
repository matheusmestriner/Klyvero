'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { PageTitle } from '../../../components/resource-page';
import { Icon } from '../../../components/icon';
import styles from './inbox.module.css';

type Channel = 'WHATSAPP' | 'EMAIL';

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
  contact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  messages?: Message[];
};

type Mailbox = { id: string; name?: string; fromAddress?: string };

export default function InboxPage() {
  const [channel, setChannel] = useState<Channel>('WHATSAPP');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [mailboxId, setMailboxId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 8000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelectedId('');
    setMessage('');
    setSubject('');
    setNotice('');
  }, [channel]);

  async function load(silent = false) {
    try {
      const [inboxPayload, mailboxPayload] = await Promise.all([
        api('/inbox'),
        api('/email/mailboxes').catch(() => []),
      ]);
      setThreads(Array.isArray(inboxPayload) ? inboxPayload : []);
      const boxes = Array.isArray(mailboxPayload) ? mailboxPayload : [];
      setMailboxes(boxes);
      if (!mailboxId && boxes[0]?.id) setMailboxId(boxes[0].id);
      if (!silent) setError('');
    } catch (cause: any) {
      if (!silent) setError(cause?.message || 'Não foi possível carregar o Inbox.');
    }
  }

  const visibleThreads = useMemo(() => {
    const desired = channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL';
    const filtered = threads.filter((thread) => String(thread.channel || '').toUpperCase().includes(desired));
    const needle = query.trim().toLowerCase();
    if (!needle) return filtered;
    return filtered.filter((thread) => [threadName(thread), thread.contact?.email, thread.contact?.phone, thread.subject, lastText(thread)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle));
  }, [channel, query, threads]);

  const selected = visibleThreads.find((thread) => thread.id === selectedId) || visibleThreads[0] || null;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !message.trim()) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      if (channel === 'WHATSAPP') {
        const to = selected.contact?.phone || selected.externalKey;
        if (!to) throw new Error('A conversa não possui um número de destino válido.');
        await api('/whatsapp/messages/text', {
          method: 'POST',
          body: JSON.stringify({ sessionId: 'principal', to, text: message.trim() }),
        });
      } else {
        const to = selected.contact?.email || selected.externalKey;
        if (!to) throw new Error('A conversa não possui um e-mail de destino válido.');
        if (!mailboxId) throw new Error('Configure uma caixa SMTP antes de responder por e-mail.');
        await api('/email/send', {
          method: 'POST',
          body: JSON.stringify({ mailboxId, to, subject: subject.trim() || selected.subject || 'Resposta', text: message.trim() }),
        });
      }
      setMessage('');
      if (channel === 'EMAIL') setSubject('');
      setNotice(channel === 'WHATSAPP' ? 'Mensagem enviada pelo WhatsApp.' : 'E-mail enviado com sucesso.');
      await load(true);
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  const messages = Array.isArray(selected?.messages) ? selected!.messages! : [];

  return (
    <>
      <PageTitle title="Inbox" subtitle="Central omnichannel para WhatsApp e e-mail." />

      <div className={styles.channelTabs} role="tablist" aria-label="Canal do Inbox">
        <button type="button" className={`${styles.tab} ${channel === 'WHATSAPP' ? styles.tabActive : ''}`} onClick={() => setChannel('WHATSAPP')}><Icon name="whatsapp" size={16} /> WhatsApp</button>
        <button type="button" className={`${styles.tab} ${channel === 'EMAIL' ? styles.tabActive : ''}`} onClick={() => setChannel('EMAIL')}><Icon name="mail" size={16} /> E-mail</button>
      </div>

      {error && <div className={`error ${styles.notice}`}>{error}</div>}
      {notice && <div className={`notice ${styles.notice}`}>{notice}</div>}

      <div className={styles.layout}>
        <aside className={styles.list}>
          <div className={styles.listHead}>
            <strong>{channel === 'WHATSAPP' ? 'Conversas do WhatsApp' : 'Caixa de entrada'}</strong>
            <label className={styles.search}><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={channel === 'WHATSAPP' ? 'Buscar contato ou número' : 'Buscar remetente ou assunto'} /></label>
          </div>
          <div className={styles.rows}>
            {visibleThreads.map((thread) => (
              <button type="button" key={thread.id} className={`${styles.row} ${selected?.id === thread.id ? styles.rowActive : ''}`} onClick={() => setSelectedId(thread.id)}>
                <div className={styles.rowTop}><strong>{threadName(thread)}</strong><span className={styles.rowMeta}>{lastTime(thread)}</span></div>
                <div className={styles.rowMeta}>{channel === 'WHATSAPP' ? (thread.contact?.phone || thread.externalKey || 'WhatsApp') : (thread.subject || thread.contact?.email || 'E-mail')}</div>
                <div className={styles.rowPreview}>{lastText(thread) || 'Sem conteúdo de texto'}</div>
              </button>
            ))}
            {!visibleThreads.length && <div className={styles.empty}><div><Icon name={channel === 'WHATSAPP' ? 'whatsapp' : 'mail'} size={28} /><strong>Nenhuma conversa</strong><span>Não há dados fictícios. As conversas reais aparecerão aqui quando forem recebidas ou enviadas.</span></div></div>}
          </div>
        </aside>

        <section className={styles.content}>
          {selected ? (
            <>
              <header className={styles.head}>
                <Icon name={channel === 'WHATSAPP' ? 'whatsapp' : 'mail'} size={22} />
                <div className={styles.identity}><strong>{threadName(selected)}</strong><span>{channel === 'WHATSAPP' ? (selected.contact?.phone || selected.externalKey) : (selected.contact?.email || selected.externalKey || selected.subject)}</span></div>
                <button className="icon-btn" type="button" onClick={() => void load()} aria-label="Atualizar Inbox"><Icon name="refresh" size={16} /></button>
              </header>

              <div className={styles.body}>
                {messages.map((item) => {
                  const outgoing = String(item.direction || '').toUpperCase() === 'OUTBOUND';
                  return <div key={item.id} className={`${styles.bubble} ${outgoing ? styles.out : ''}`}><div>{item.text || item.subject || '[conteúdo sem texto]'}</div><div className={styles.meta}>{messageDate(item.createdAt)} · {outgoing ? 'Enviado' : 'Recebido'}</div></div>;
                })}
                {!messages.length && <div className={styles.empty}><div><Icon name="message" size={30} /><strong>Sem mensagens</strong><span>O histórico desta conversa ainda está vazio.</span></div></div>}
              </div>

              <form className={styles.composer} onSubmit={send}>
                {channel === 'EMAIL' && <div className={styles.emailFields}><select value={mailboxId} onChange={(event) => setMailboxId(event.target.value)} required><option value="">Selecione a caixa SMTP</option>{mailboxes.map((box) => <option key={box.id} value={box.id}>{box.name || box.fromAddress || 'Caixa SMTP'}</option>)}</select><input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={selected.subject ? `Re: ${selected.subject}` : 'Assunto'} /></div>}
                <div className={styles.composerRow}><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={channel === 'WHATSAPP' ? 'Digite uma mensagem' : 'Escreva sua resposta'} rows={2} maxLength={10000} /><button className={styles.send} type="submit" disabled={sending || !message.trim() || (channel === 'EMAIL' && !mailboxId)}><Icon name="send" size={16} />{sending ? 'Enviando…' : 'Enviar'}</button></div>
              </form>
            </>
          ) : <div className={styles.empty}><div><Icon name={channel === 'WHATSAPP' ? 'whatsapp' : 'mail'} size={34} /><strong>{channel === 'WHATSAPP' ? 'WhatsApp no Inbox' : 'E-mail no Inbox'}</strong><span>Selecione uma conversa na coluna à esquerda para visualizar o histórico e responder.</span></div></div>}
        </section>
      </div>
    </>
  );
}

function threadName(thread: Thread) {
  const name = [thread.contact?.firstName, thread.contact?.lastName].filter(Boolean).join(' ').trim();
  return name || thread.contact?.email || thread.contact?.phone || thread.externalKey || 'Contato';
}

function lastMessage(thread: Thread) {
  const rows = Array.isArray(thread.messages) ? thread.messages : [];
  return rows[rows.length - 1];
}

function lastText(thread: Thread) {
  const item = lastMessage(thread);
  return item?.text || item?.subject || thread.subject || '';
}

function lastTime(thread: Thread) {
  const value = lastMessage(thread)?.createdAt;
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function messageDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
