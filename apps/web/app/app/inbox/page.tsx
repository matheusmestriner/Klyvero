'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  status?: string;
  unreadCount?: number;
  updatedAt?: string;
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedId('');
    setMessage('');
    setSubject('');
    setNotice('');
    setDetailOpen(false);
  }, [channel]);

  async function load(silent = false) {
    if (!silent) {
      if (loading) setLoading(true);
      else setRefreshing(true);
    }

    try {
      const [inboxPayload, mailboxPayload] = await Promise.all([
        api('/inbox'),
        api('/email/mailboxes').catch(() => []),
      ]);

      const nextThreads = normalizeList<Thread>(inboxPayload, ['threads', 'items', 'data']);
      const nextMailboxes = normalizeList<Mailbox>(mailboxPayload, ['mailboxes', 'items', 'data']);
      setThreads(nextThreads);
      setMailboxes(nextMailboxes);
      setMailboxId((current) => current || nextMailboxes[0]?.id || '');
      if (!silent) setError('');
    } catch (cause: any) {
      if (!silent) setError(cause?.message || 'Não foi possível carregar o Inbox.');
    } finally {
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  const counts = useMemo(() => ({
    whatsapp: threads.filter((thread) => matchesChannel(thread, 'WHATSAPP')).length,
    email: threads.filter((thread) => matchesChannel(thread, 'EMAIL')).length,
    unread: threads.reduce((total, thread) => total + Math.max(Number(thread.unreadCount || 0), 0), 0),
  }), [threads]);

  const visibleThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return threads
      .filter((thread) => matchesChannel(thread, channel))
      .filter((thread) => {
        if (!needle) return true;
        return [threadName(thread), thread.contact?.email, thread.contact?.phone, thread.subject, lastText(thread)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => threadTimestamp(b) - threadTimestamp(a));
  }, [channel, query, threads]);

  const selected = visibleThreads.find((thread) => thread.id === selectedId) || visibleThreads[0] || null;
  const messages = useMemo(
    () => (Array.isArray(selected?.messages) ? [...selected!.messages!] : []).sort((a, b) => messageTimestamp(a) - messageTimestamp(b)),
    [selected],
  );

  useEffect(() => {
    if (!selected) return;
    setSelectedId((current) => current || selected.id);
  }, [selected]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [selected?.id, messages.length]);

  function chooseThread(id: string) {
    setSelectedId(id);
    setDetailOpen(true);
    setNotice('');
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !message.trim() || sending) return;

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
          body: JSON.stringify({
            mailboxId,
            to,
            subject: subject.trim() || replySubject(selected.subject),
            text: message.trim(),
          }),
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

  return (
    <>
      <PageTitle title="Inbox" subtitle="Atenda WhatsApp e e-mail em uma única central de conversas." />

      <div className={styles.topline}>
        <div className={styles.channelTabs} role="tablist" aria-label="Canal do Inbox">
          <button type="button" className={`${styles.tab} ${channel === 'WHATSAPP' ? styles.tabActive : ''}`} onClick={() => setChannel('WHATSAPP')}>
            <Icon name="whatsapp" size={16} />
            <span>WhatsApp</span>
            <b>{counts.whatsapp}</b>
          </button>
          <button type="button" className={`${styles.tab} ${channel === 'EMAIL' ? styles.tabActive : ''}`} onClick={() => setChannel('EMAIL')}>
            <Icon name="mail" size={16} />
            <span>E-mail</span>
            <b>{counts.email}</b>
          </button>
        </div>
        <div className={styles.inboxStatus}>
          <span className={styles.liveDot} />
          Sincronização automática
          {counts.unread > 0 && <strong>{counts.unread} não lida{counts.unread === 1 ? '' : 's'}</strong>}
        </div>
      </div>

      {error && <div className={`error ${styles.notice}`}>{error}</div>}
      {notice && <div className={`notice ${styles.notice}`}>{notice}</div>}

      <div className={`${styles.layout} ${detailOpen ? styles.detailOpen : ''}`}>
        <aside className={styles.list}>
          <div className={styles.listHead}>
            <div className={styles.listTitleRow}>
              <div>
                <span className={styles.eyebrow}>{channel === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}</span>
                <strong>{visibleThreads.length} conversa{visibleThreads.length === 1 ? '' : 's'}</strong>
              </div>
              <button className="icon-btn" type="button" onClick={() => void load()} disabled={refreshing} aria-label="Atualizar Inbox" title="Atualizar">
                <Icon name="refresh" size={16} />
              </button>
            </div>
            <label className={styles.search}>
              <Icon name="search" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={channel === 'WHATSAPP' ? 'Buscar nome ou número...' : 'Buscar remetente ou assunto...'} />
            </label>
          </div>

          <div className={styles.rows}>
            {loading ? (
              <div className={styles.loadingState}><span className="auth-runtime-spinner" /><span>Carregando conversas…</span></div>
            ) : visibleThreads.length ? visibleThreads.map((thread) => (
              <button type="button" key={thread.id} className={`${styles.row} ${selected?.id === thread.id ? styles.rowActive : ''}`} onClick={() => chooseThread(thread.id)}>
                <span className={styles.avatar}>{initials(threadName(thread))}</span>
                <span className={styles.rowCopy}>
                  <span className={styles.rowTop}>
                    <strong>{threadName(thread)}</strong>
                    <span className={styles.rowMeta}>{lastTime(thread)}</span>
                  </span>
                  <span className={styles.rowPreview}>{lastText(thread) || 'Sem conteúdo de texto'}</span>
                  <span className={styles.rowBottom}>
                    <span>{channel === 'WHATSAPP' ? (thread.contact?.phone || thread.externalKey || 'WhatsApp') : (thread.subject || thread.contact?.email || 'E-mail')}</span>
                    {Number(thread.unreadCount || 0) > 0 && <b className={styles.unread}>{thread.unreadCount}</b>}
                  </span>
                </span>
              </button>
            )) : (
              <Empty icon={channel === 'WHATSAPP' ? 'whatsapp' : 'mail'} title={query ? 'Nenhum resultado' : 'Nenhuma conversa'} text={query ? 'Tente outro nome, número, e-mail ou assunto.' : 'As conversas reais aparecerão aqui assim que forem recebidas ou enviadas.'} />
            )}
          </div>
        </aside>

        <section className={styles.content}>
          {selected ? (
            <>
              <header className={styles.head}>
                <button className={`${styles.back} icon-btn`} type="button" onClick={() => setDetailOpen(false)} aria-label="Voltar para conversas"><Icon name="chevron-left" size={18} /></button>
                <span className={styles.headAvatar}>{initials(threadName(selected))}</span>
                <div className={styles.identity}>
                  <strong>{threadName(selected)}</strong>
                  <span>{contactLine(selected, channel)}</span>
                </div>
                <span className={styles.channelPill}><Icon name={channel === 'WHATSAPP' ? 'whatsapp' : 'mail'} size={14} />{channel === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}</span>
                <button className="icon-btn" type="button" onClick={() => void load()} disabled={refreshing} aria-label="Atualizar conversa"><Icon name="refresh" size={16} /></button>
              </header>

              <div className={styles.body} ref={bodyRef}>
                <div className={styles.conversationStart}>
                  <span>{channel === 'WHATSAPP' ? 'Conversa pelo WhatsApp' : 'Conversa por e-mail'}</span>
                  <strong>{threadName(selected)}</strong>
                </div>
                {messages.map((item) => {
                  const outgoing = String(item.direction || '').toUpperCase() === 'OUTBOUND';
                  return (
                    <div key={item.id} className={`${styles.messageLine} ${outgoing ? styles.messageLineOut : ''}`}>
                      <div className={`${styles.bubble} ${outgoing ? styles.out : ''}`}>
                        <div>{item.text || item.subject || '[conteúdo sem texto]'}</div>
                        <div className={styles.meta}>{messageDate(item.createdAt)} · {outgoing ? 'Enviado' : 'Recebido'}</div>
                      </div>
                    </div>
                  );
                })}
                {!messages.length && <Empty icon="message" title="Sem mensagens" text="O histórico desta conversa ainda está vazio." />}
              </div>

              <form className={styles.composer} onSubmit={send}>
                {channel === 'EMAIL' && (
                  <div className={styles.emailFields}>
                    <label><span>Enviar por</span><select value={mailboxId} onChange={(event) => setMailboxId(event.target.value)} required><option value="">Selecione a caixa SMTP</option>{mailboxes.map((box) => <option key={box.id} value={box.id}>{box.name || box.fromAddress || 'Caixa SMTP'}</option>)}</select></label>
                    <label><span>Assunto</span><input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={replySubject(selected.subject)} /></label>
                  </div>
                )}
                <div className={styles.composerRow}>
                  <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={channel === 'WHATSAPP' ? 'Digite uma mensagem...' : 'Escreva sua resposta...'} rows={2} maxLength={10000} />
                  <button className={styles.send} type="submit" disabled={sending || !message.trim() || (channel === 'EMAIL' && !mailboxId)}>
                    <Icon name="send" size={16} />{sending ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>
                <div className={styles.composerMeta}><span>{message.length.toLocaleString('pt-BR')} / 10.000</span><span>{channel === 'WHATSAPP' ? 'Envio pela sessão principal' : 'Resposta pelo SMTP configurado'}</span></div>
              </form>
            </>
          ) : (
            <Empty icon={channel === 'WHATSAPP' ? 'whatsapp' : 'mail'} title={channel === 'WHATSAPP' ? 'WhatsApp no Inbox' : 'E-mail no Inbox'} text="Selecione uma conversa para visualizar o histórico e responder." />
          )}
        </section>
      </div>
    </>
  );
}

function Empty({ icon, title, text }: { icon: 'whatsapp' | 'mail' | 'message'; title: string; text: string }) {
  return <div className={styles.empty}><div><span className={styles.emptyIcon}><Icon name={icon} size={28} /></span><strong>{title}</strong><span>{text}</span></div></div>;
}

function normalizeList<T>(payload: any, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function matchesChannel(thread: Thread, channel: Channel) {
  return String(thread.channel || '').toUpperCase().includes(channel);
}

function threadName(thread: Thread) {
  const name = [thread.contact?.firstName, thread.contact?.lastName].filter(Boolean).join(' ').trim();
  return name || thread.contact?.email || thread.contact?.phone || thread.externalKey || 'Contato';
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C';
}

function lastMessage(thread: Thread) {
  const rows = Array.isArray(thread.messages) ? thread.messages : [];
  return [...rows].sort((a, b) => messageTimestamp(a) - messageTimestamp(b)).at(-1);
}

function lastText(thread: Thread) {
  const item = lastMessage(thread);
  return item?.text || item?.subject || thread.subject || '';
}

function messageTimestamp(message?: Message) {
  const time = new Date(message?.createdAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function threadTimestamp(thread: Thread) {
  return messageTimestamp(lastMessage(thread)) || new Date(thread.updatedAt || 0).getTime() || 0;
}

function lastTime(thread: Thread) {
  const value = lastMessage(thread)?.createdAt || thread.updatedAt;
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function messageDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function contactLine(thread: Thread, channel: Channel) {
  if (channel === 'WHATSAPP') return thread.contact?.phone || thread.externalKey || 'Número não identificado';
  return thread.contact?.email || thread.externalKey || thread.subject || 'E-mail não identificado';
}

function replySubject(value?: string) {
  const subject = String(value || '').trim();
  if (!subject) return 'Resposta';
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}
