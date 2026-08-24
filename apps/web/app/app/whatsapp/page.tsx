'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../../lib/api';
import { PageTitle } from '../../../components/resource-page';
import { Icon } from '../../../components/icon';
import styles from './whatsapp.module.css';

type PairingStatus = {
  sessionId?: string;
  connected?: boolean;
  loggedIn?: boolean;
  qr?: string;
  pairingState?: string;
  qrUpdatedAt?: string;
};

type InboxMessage = {
  id: string;
  direction?: string;
  text?: string;
  subject?: string;
  createdAt?: string;
};

type InboxThread = {
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
  messages?: InboxMessage[];
};

const POLL_MS = 1800;

export default function WhatsAppPage() {
  const [sessionId] = useState('principal');
  const [status, setStatus] = useState<PairingStatus | null>(null);
  const [qr, setQr] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPairing, setShowPairing] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const pollGeneration = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const whatsappThreads = useMemo(() => {
    const normalized = threads.filter((thread) => String(thread.channel || '').toUpperCase().includes('WHATSAPP'));
    const needle = query.trim().toLowerCase();
    if (!needle) return normalized;
    return normalized.filter((thread) => {
      const haystack = [thread.contact?.firstName, thread.contact?.lastName, thread.contact?.phone, thread.externalKey, lastText(thread)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [threads, query]);

  const selected = whatsappThreads.find((thread) => thread.id === selectedId) || whatsappThreads[0] || null;

  useEffect(() => {
    void loadInbox();
    void checkStatus();
    const timer = setInterval(() => void loadInbox(true), 7000);
    return () => {
      clearInterval(timer);
      stopPolling();
    };
  }, []);

  useEffect(() => {
    if (!selectedId && whatsappThreads[0]) setSelectedId(whatsappThreads[0].id);
  }, [selectedId, whatsappThreads]);

  useEffect(() => {
    let active = true;
    if (!qr) {
      setQrImage('');
      return () => { active = false; };
    }
    QRCode.toDataURL(qr, { width: 280, margin: 2, errorCorrectionLevel: 'M' })
      .then((value) => { if (active) setQrImage(value); })
      .catch(() => { if (active) setError('Não foi possível renderizar o QR Code. Gere um novo código.'); });
    return () => { active = false; };
  }, [qr]);

  async function loadInbox(silent = false) {
    try {
      const payload = await api('/inbox');
      const rows = Array.isArray(payload) ? payload : [];
      setThreads(rows);
      if (!silent) setError('');
    } catch (cause: any) {
      if (!silent) setError(cause?.message || 'Não foi possível carregar as conversas.');
    }
  }

  function stopPolling() {
    pollGeneration.current += 1;
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function applyPairing(next: PairingStatus | null | undefined) {
    if (!next) return false;
    setStatus((current) => ({ ...current, ...next }));
    if (typeof next.qr === 'string') setQr(next.qr);
    if (next.loggedIn) {
      setQr('');
      setShowPairing(false);
      stopPolling();
      return true;
    }
    return false;
  }

  async function readPairing() {
    const safeId = encodeURIComponent(sessionId);
    const [nextStatus, nextQR] = await Promise.all([
      api(`/whatsapp/${safeId}/status`).catch(() => null),
      api(`/whatsapp/${safeId}/qr`).catch(() => null),
    ]);
    const loggedIn = applyPairing(nextStatus);
    if (!loggedIn) applyPairing(nextQR);
    return Boolean(nextStatus?.loggedIn || nextQR?.loggedIn);
  }

  async function checkStatus() {
    try {
      await readPairing();
    } catch {
      setStatus(null);
    }
  }

  function startPolling() {
    stopPolling();
    const generation = pollGeneration.current;
    const run = async () => {
      if (generation !== pollGeneration.current) return;
      try {
        const loggedIn = await readPairing();
        if (loggedIn || generation !== pollGeneration.current) return;
      } catch {}
      if (generation === pollGeneration.current) pollTimer.current = setTimeout(run, POLL_MS);
    };
    void run();
  }

  async function connect() {
    setConnecting(true);
    setError('');
    setQr('');
    stopPolling();
    try {
      const response = await api('/whatsapp/connect', {
        method: 'POST',
        body: JSON.stringify({ sessionId, displayName: 'Principal' }),
      }) as PairingStatus;
      applyPairing(response);
      if (!response?.loggedIn) {
        setShowPairing(true);
        startPolling();
      }
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível iniciar a conexão com o WhatsApp.');
    } finally {
      setConnecting(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const destination = selected?.contact?.phone || selected?.externalKey || newNumber;
    const text = draft.trim();
    if (!status?.loggedIn) {
      setShowPairing(true);
      setError('Conecte o WhatsApp antes de enviar mensagens.');
      return;
    }
    if (!destination || !text) return;

    setSending(true);
    setError('');
    try {
      await api('/whatsapp/messages/text', {
        method: 'POST',
        body: JSON.stringify({ sessionId, to: destination, text }),
      });
      setDraft('');
      setNewNumber('');
      await loadInbox(true);
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  function selectThread(thread: InboxThread) {
    setSelectedId(thread.id);
    setNewNumber('');
    setMobileChat(true);
  }

  const target = selected?.contact?.phone || selected?.externalKey || newNumber;
  const displayName = selected ? threadName(selected) : newNumber || 'Nova conversa';
  const messages = Array.isArray(selected?.messages) ? selected!.messages! : [];

  return (
    <>
      <PageTitle title="WhatsApp" subtitle="Conversas, contatos e mensagens do WhatsApp dentro do Klyvero." />
      {error && <div className={`error ${styles.error}`}>{error}</div>}

      <div className={styles.workspace}>
        <aside className={`${styles.sidebar} ${mobileChat ? styles.hideMobile : ''}`}>
          <div className={styles.sidebarHead}>
            <div className={styles.sidebarTitle}>
              <strong>Conversas</strong>
              <div className={styles.toolbar}>
                <button className={styles.toolButton} type="button" onClick={() => { setSelectedId(''); setNewNumber(''); setMobileChat(true); }} aria-label="Nova conversa"><Icon name="plus" size={17} /></button>
                <button className={styles.toolButton} type="button" onClick={() => void loadInbox()} aria-label="Atualizar conversas"><Icon name="refresh" size={16} /></button>
              </div>
            </div>
            <div className={styles.status}><span className={`${styles.statusDot} ${status?.loggedIn ? styles.online : ''}`} />{status?.loggedIn ? 'WhatsApp conectado' : 'WhatsApp desconectado'}</div>
            <label className={styles.search}><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar ou iniciar conversa" /></label>
          </div>

          <div className={styles.threadList}>
            {whatsappThreads.map((thread) => (
              <button key={thread.id} type="button" className={`${styles.thread} ${selected?.id === thread.id ? styles.threadActive : ''}`} onClick={() => selectThread(thread)}>
                <div className={styles.avatar}>{initials(threadName(thread))}</div>
                <div className={styles.threadMain}>
                  <div className={styles.threadTop}><span className={styles.threadName}>{threadName(thread)}</span><span className={styles.time}>{lastTime(thread)}</span></div>
                  <div className={styles.preview}><span>{lastText(thread) || 'Sem mensagens'}</span></div>
                </div>
              </button>
            ))}
            {!whatsappThreads.length && <div className={styles.emptyList}><Icon name="whatsapp" size={28} /><strong>Nenhuma conversa</strong><span>As conversas aparecerão aqui quando houver mensagens recebidas ou enviadas.</span></div>}
          </div>
        </aside>

        <section className={`${styles.chat} ${!mobileChat ? styles.hideMobile : ''}`}>
          {!status?.loggedIn && (
            <div className={styles.pairing}>
              <div className={styles.pairingText}><strong>Conecte seu WhatsApp</strong><span>Use o QR Code para vincular uma sessão ao Klyvero.</span></div>
              <button className="btn primary" type="button" disabled={connecting} onClick={connect}>{connecting ? 'Preparando…' : 'Conectar'}</button>
            </div>
          )}

          {selected || newNumber ? (
            <>
              <header className={styles.chatHead}>
                <button className={`${styles.toolButton} ${styles.showMobile}`} type="button" onClick={() => setMobileChat(false)} aria-label="Voltar às conversas"><Icon name="chevron-left" size={18} /></button>
                <div className={styles.avatar}>{initials(displayName)}</div>
                <div className={styles.chatIdentity}><strong>{displayName}</strong><span>{target || 'Informe um número para iniciar a conversa'}</span></div>
                <div className={styles.chatActions}>
                  <button className={styles.toolButton} type="button" onClick={() => void loadInbox()} aria-label="Atualizar"><Icon name="refresh" size={16} /></button>
                  <button className={styles.toolButton} type="button" aria-label="Mais opções"><Icon name="more" size={17} /></button>
                </div>
              </header>

              {!selected && (
                <div style={{ padding: 14, borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-surface)' }}>
                  <label className="field" style={{ margin: 0 }}><span>Número do WhatsApp</span><input value={newNumber} onChange={(event) => setNewNumber(event.target.value)} placeholder="5511999999999" maxLength={32} /></label>
                </div>
              )}

              <div className={styles.messages}>
                {messages.length > 0 && <div className={styles.dayLabel}>Histórico da conversa</div>}
                {messages.map((message) => {
                  const outgoing = String(message.direction || '').toUpperCase() === 'OUTBOUND';
                  return <div key={message.id} className={`${styles.bubble} ${outgoing ? styles.bubbleOut : ''}`}><div>{message.text || message.subject || '[conteúdo sem texto]'}</div><div className={styles.bubbleMeta}><span>{messageTime(message.createdAt)}</span>{outgoing && <Icon name="check" size={12} />}</div></div>;
                })}
                {!messages.length && <div className={styles.welcome}><div className={styles.welcomeInner}><div className={styles.welcomeIcon}><Icon name="whatsapp" size={34} /></div><h3>{selected ? 'Conversa sem mensagens' : 'Nova conversa'}</h3><span>{selected ? 'O histórico aparecerá aqui conforme as mensagens forem sincronizadas.' : 'Informe o número e envie a primeira mensagem.'}</span></div></div>}
              </div>

              <form className={styles.composer} onSubmit={send}>
                <button className={styles.toolButton} type="button" title="Anexos serão habilitados quando a API de mídia do whatsmeow estiver exposta"><Icon name="plus" size={19} /></button>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Digite uma mensagem" maxLength={10000} rows={1} />
                <button className={styles.send} type="submit" disabled={sending || !draft.trim() || !target || !status?.loggedIn} aria-label="Enviar mensagem"><Icon name="send" size={18} /></button>
              </form>
            </>
          ) : (
            <div className={styles.welcome}><div className={styles.welcomeInner}><div className={styles.welcomeIcon}><Icon name="whatsapp" size={36} /></div><h3>WhatsApp no Klyvero</h3><span>Selecione uma conversa à esquerda ou inicie uma nova conversa. Nenhum contato de demonstração é inserido.</span>{!status?.loggedIn && <button className="btn primary" type="button" onClick={connect}>Conectar WhatsApp</button>}</div></div>
          )}
        </section>
      </div>

      {showPairing && !status?.loggedIn && (
        <div className={styles.qrPanel} role="dialog" aria-modal="true" aria-label="Conectar WhatsApp">
          <div className={styles.qrCard}>
            <div className={styles.qrHead}><div><strong>Conectar WhatsApp</strong><div className="muted small">Dispositivos conectados → Conectar dispositivo</div></div><button className={styles.toolButton} type="button" onClick={() => setShowPairing(false)} aria-label="Fechar"><Icon name="x" size={17} /></button></div>
            {qrImage ? <img className={styles.qrImage} src={qrImage} width={280} height={280} alt="QR Code para conectar o WhatsApp" /> : <div className="empty-state compact"><Icon name="refresh" size={28} /><strong>{connecting ? 'Gerando QR Code…' : 'Aguardando QR Code'}</strong><span>O código será atualizado automaticamente.</span></div>}
            <button className="btn ghost" type="button" onClick={connect} disabled={connecting}>{connecting ? 'Preparando…' : 'Gerar novo QR'}</button>
          </div>
        </div>
      )}
    </>
  );
}

function threadName(thread: InboxThread) {
  const name = [thread.contact?.firstName, thread.contact?.lastName].filter(Boolean).join(' ').trim();
  return name || thread.contact?.phone || thread.externalKey || 'Contato';
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'WA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function lastMessage(thread: InboxThread) {
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  return messages[messages.length - 1];
}

function lastText(thread: InboxThread) {
  const message = lastMessage(thread);
  return message?.text || message?.subject || thread.subject || '';
}

function lastTime(thread: InboxThread) {
  const date = lastMessage(thread)?.createdAt;
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function messageTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
