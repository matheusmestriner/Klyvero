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

type Contact = {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  createdAt?: string;
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
  direction?: string;
  to?: string;
  body?: string;
  status?: string;
  createdAt?: string;
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showPairing, setShowPairing] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const pollGeneration = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const whatsappThreads = useMemo(() => {
    const normalized = mergeWhatsAppThreads(threads, contacts);
    const needle = query.trim().toLowerCase();
    if (!needle) return normalized;
    return normalized.filter((thread) => {
      const haystack = [thread.contact?.firstName, thread.contact?.lastName, thread.contact?.phone, thread.externalKey, thread.to, lastText(thread)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [contacts, query, threads]);

  const filteredContacts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return contacts
      .filter((contact) => Boolean(contactPhone(contact)))
      .filter((contact) => {
        if (!needle) return true;
        return [contactName(contact), contact.phone, contact.email].filter(Boolean).join(' ').toLowerCase().includes(needle);
      });
  }, [contacts, query]);

  const selected = selectedId ? whatsappThreads.find((thread) => thread.id === selectedId) || null : null;
  const selectedContact = selectedContactId ? contacts.find((contact) => contact.id === selectedContactId) || null : null;
  const target = threadPhone(selected) || contactPhone(selectedContact) || normalizePhone(newNumber);
  const activeThread = selected || (target ? whatsappThreads.find((thread) => threadPhone(thread) === target) || null : null);
  const displayName = selected ? threadName(selected) : selectedContact ? contactName(selectedContact) : newNumber || 'Nova conversa';
  const messages = Array.isArray(activeThread?.messages) ? activeThread!.messages! : [];

  useEffect(() => {
    void loadInbox();
    void loadContacts();
    void checkStatus();
    const timer = setInterval(() => void loadInbox(true), 7000);
    return () => {
      clearInterval(timer);
      stopPolling();
    };
  }, []);

  useEffect(() => {
    if (!selectedId && !selectedContactId && whatsappThreads[0] && !showContactModal) {
      setSelectedId(whatsappThreads[0].id);
    }
  }, [selectedContactId, selectedId, showContactModal, whatsappThreads]);

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

  async function loadContacts(silent = false) {
    try {
      const payload = await api('/contacts');
      const rows = Array.isArray(payload) ? payload : [];
      setContacts(rows);
      if (!silent) setError('');
    } catch (cause: any) {
      if (!silent) setError(cause?.message || 'Não foi possível carregar os contatos.');
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

  function openContactModal() {
    setError('');
    setShowContactModal(true);
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingContact) return;

    const form = new FormData(event.currentTarget);
    const firstName = String(form.get('firstName') || '').trim();
    const lastName = String(form.get('lastName') || '').trim();
    const email = String(form.get('email') || '').trim().toLowerCase();
    const phone = normalizePhone(String(form.get('phone') || ''));

    if (!firstName || phone.length < 8 || phone.length > 20) {
      setError('Informe um nome e um número de WhatsApp válido com DDI e DDD.');
      return;
    }

    const duplicate = contacts.find((contact) => contactPhone(contact) === phone);
    if (duplicate) {
      setSelectedId('');
      setSelectedContactId(duplicate.id);
      setNewNumber(phone);
      setShowContactModal(false);
      setMobileChat(true);
      setError('');
      return;
    }

    setSavingContact(true);
    setError('');
    try {
      const created = await api('/contacts', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          lastName,
          email: email || undefined,
          phone,
          source: 'WHATSAPP',
          status: 'ACTIVE',
        }),
      }) as Contact;
      setContacts((rows) => [...rows, created]);
      setSelectedId('');
      setSelectedContactId(created.id);
      setNewNumber(phone);
      setShowContactModal(false);
      setMobileChat(true);
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível adicionar o contato.');
    } finally {
      setSavingContact(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const destination = target;
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
      const optimistic: InboxThread = {
        id: `local-${Date.now()}`,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        to: destination,
        body: text,
        status: 'SENT',
        createdAt: new Date().toISOString(),
      };
      setThreads((rows) => [...rows, optimistic]);
      setDraft('');
      setNewNumber(destination);
      await loadInbox(true);
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  function selectThread(thread: InboxThread) {
    setSelectedContactId('');
    setSelectedId(thread.id);
    setNewNumber(threadPhone(thread));
    setMobileChat(true);
  }

  function selectContact(contact: Contact) {
    setSelectedId('');
    setSelectedContactId(contact.id);
    setNewNumber(contactPhone(contact));
    setMobileChat(true);
  }

  return (
    <>
      <PageTitle
        title="WhatsApp"
        subtitle="Conversas, contatos e mensagens do WhatsApp dentro do Klyvero."
        action={<button className="btn primary" type="button" onClick={openContactModal}><Icon name="plus" size={16} /> Adicionar contato</button>}
      />
      {error && <div className={`error ${styles.error}`}>{error}</div>}

      <div className={styles.workspace}>
        <aside className={`${styles.sidebar} ${mobileChat ? styles.hideMobile : ''}`}>
          <div className={styles.sidebarHead}>
            <div className={styles.sidebarTitle}>
              <strong>Conversas</strong>
              <div className={styles.toolbar}>
                <button className={styles.toolButton} type="button" onClick={openContactModal} aria-label="Adicionar contato" title="Adicionar contato"><Icon name="plus" size={17} /></button>
                <button className={styles.toolButton} type="button" onClick={() => { void loadInbox(); void loadContacts(true); }} aria-label="Atualizar conversas"><Icon name="refresh" size={16} /></button>
              </div>
            </div>
            <div className={styles.status}><span className={`${styles.statusDot} ${status?.loggedIn ? styles.online : ''}`} />{status?.loggedIn ? 'WhatsApp conectado' : 'WhatsApp desconectado'}</div>
            <label className={styles.search}><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar contato ou conversa" /></label>
          </div>

          <div className={styles.threadList}>
            {whatsappThreads.length > 0 && <div className={styles.sectionLabel}>Conversas recentes</div>}
            {whatsappThreads.map((thread) => (
              <button key={thread.id} type="button" className={`${styles.thread} ${selected?.id === thread.id ? styles.threadActive : ''}`} onClick={() => selectThread(thread)}>
                <div className={styles.avatar}>{initials(threadName(thread))}</div>
                <div className={styles.threadMain}>
                  <div className={styles.threadTop}><span className={styles.threadName}>{threadName(thread)}</span><span className={styles.time}>{lastTime(thread)}</span></div>
                  <div className={styles.preview}><span>{lastText(thread) || threadPhone(thread) || 'Sem mensagens'}</span></div>
                </div>
              </button>
            ))}

            {filteredContacts.length > 0 && <div className={styles.sectionLabel}>Contatos</div>}
            {filteredContacts.map((contact) => (
              <button key={contact.id} type="button" className={`${styles.thread} ${selectedContact?.id === contact.id ? styles.threadActive : ''}`} onClick={() => selectContact(contact)}>
                <div className={styles.avatar}>{initials(contactName(contact))}</div>
                <div className={styles.threadMain}>
                  <div className={styles.threadTop}><span className={styles.threadName}>{contactName(contact)}</span></div>
                  <div className={styles.preview}><span>{formatPhone(contactPhone(contact))}</span>{contact.email && <span>• {contact.email}</span>}</div>
                </div>
              </button>
            ))}

            {!whatsappThreads.length && !filteredContacts.length && (
              <div className={styles.emptyList}>
                <Icon name="whatsapp" size={28} />
                <strong>Nenhum contato</strong>
                <span>Use “Adicionar contato” para cadastrar uma pessoa e iniciar uma conversa.</span>
                <button className="btn primary" type="button" onClick={openContactModal}>Adicionar contato</button>
              </div>
            )}
          </div>
        </aside>

        <section className={`${styles.chat} ${!mobileChat ? styles.hideMobile : ''}`}>
          {!status?.loggedIn && (
            <div className={styles.pairing}>
              <div className={styles.pairingText}><strong>Conecte seu WhatsApp</strong><span>Use o QR Code para vincular uma sessão ao Klyvero.</span></div>
              <button className="btn primary" type="button" disabled={connecting} onClick={connect}>{connecting ? 'Preparando…' : 'Conectar'}</button>
            </div>
          )}

          {selected || selectedContact || newNumber ? (
            <>
              <header className={styles.chatHead}>
                <button className={`${styles.toolButton} ${styles.showMobile}`} type="button" onClick={() => setMobileChat(false)} aria-label="Voltar às conversas"><Icon name="chevron-left" size={18} /></button>
                <div className={styles.avatar}>{initials(displayName)}</div>
                <div className={styles.chatIdentity}><strong>{displayName}</strong><span>{formatPhone(target) || 'Informe um número para iniciar a conversa'}</span></div>
                <div className={styles.chatActions}>
                  <button className={styles.toolButton} type="button" onClick={() => void loadInbox()} aria-label="Atualizar"><Icon name="refresh" size={16} /></button>
                  <button className={styles.toolButton} type="button" aria-label="Mais opções"><Icon name="more" size={17} /></button>
                </div>
              </header>

              {!selected && !selectedContact && (
                <div className={styles.numberEntry}>
                  <label className="field" style={{ margin: 0 }}><span>Número do WhatsApp</span><input value={newNumber} onChange={(event) => setNewNumber(normalizePhone(event.target.value))} placeholder="5511999999999" maxLength={20} inputMode="tel" /></label>
                </div>
              )}

              <div className={styles.messages}>
                {messages.length > 0 && <div className={styles.dayLabel}>Histórico da conversa</div>}
                {messages.map((message) => {
                  const outgoing = String(message.direction || '').toUpperCase() === 'OUTBOUND';
                  return <div key={message.id} className={`${styles.bubble} ${outgoing ? styles.bubbleOut : ''}`}><div>{message.text || message.subject || '[conteúdo sem texto]'}</div><div className={styles.bubbleMeta}><span>{messageTime(message.createdAt)}</span>{outgoing && <Icon name="check" size={12} />}</div></div>;
                })}
                {!messages.length && <div className={styles.welcome}><div className={styles.welcomeInner}><div className={styles.welcomeIcon}><Icon name="whatsapp" size={34} /></div><h3>Nova conversa</h3><span>Envie a primeira mensagem para {displayName}.</span></div></div>}
              </div>

              <form className={styles.composer} onSubmit={send}>
                <button className={styles.toolButton} type="button" title="Anexos serão habilitados quando a API de mídia do whatsmeow estiver exposta"><Icon name="plus" size={19} /></button>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Digite uma mensagem" maxLength={10000} rows={1} />
                <button className={styles.send} type="submit" disabled={sending || !draft.trim() || !target || !status?.loggedIn} aria-label="Enviar mensagem"><Icon name="send" size={18} /></button>
              </form>
            </>
          ) : (
            <div className={styles.welcome}>
              <div className={styles.welcomeInner}>
                <div className={styles.welcomeIcon}><Icon name="whatsapp" size={36} /></div>
                <h3>WhatsApp no Klyvero</h3>
                <span>Selecione uma conversa, escolha um contato ou adicione uma nova pessoa.</span>
                <button className="btn primary" type="button" onClick={openContactModal}>Adicionar contato</button>
                {!status?.loggedIn && <button className="btn ghost" type="button" onClick={connect}>Conectar WhatsApp</button>}
              </div>
            </div>
          )}
        </section>
      </div>

      {showContactModal && (
        <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && !savingContact && setShowContactModal(false)}>
          <form className="modal" onSubmit={createContact}>
            <div className="modalhead">
              <div><span className="eyebrow">WhatsApp</span><h3>Adicionar contato</h3></div>
              <button type="button" className="btn ghost" disabled={savingContact} onClick={() => setShowContactModal(false)}>Fechar</button>
            </div>
            <div className="field"><label>Nome</label><input name="firstName" minLength={2} maxLength={100} autoComplete="given-name" required /></div>
            <div className="field"><label>Sobrenome</label><input name="lastName" maxLength={100} autoComplete="family-name" /></div>
            <div className="field"><label>Número do WhatsApp</label><input name="phone" type="tel" inputMode="tel" placeholder="+55 11 99999-9999" maxLength={32} autoComplete="tel" required /><small className="muted">Informe DDI + DDD + número. O Klyvero salva somente os dígitos necessários para o envio.</small></div>
            <div className="field"><label>E-mail <span className="muted">(opcional)</span></label><input name="email" type="email" maxLength={254} autoComplete="email" /></div>
            <div className="modal-actions"><button className="btn ghost" type="button" disabled={savingContact} onClick={() => setShowContactModal(false)}>Cancelar</button><button className="btn primary" type="submit" disabled={savingContact}>{savingContact ? 'Salvando…' : 'Salvar contato'}</button></div>
          </form>
        </div>
      )}

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

function mergeWhatsAppThreads(rows: InboxThread[], contacts: Contact[]) {
  const contactsByPhone = new Map<string, Contact>();
  contacts.forEach((contact) => {
    const phone = contactPhone(contact);
    if (phone) contactsByPhone.set(phone, contact);
  });

  const grouped = new Map<string, InboxThread>();
  rows.forEach((row) => {
    if (!String(row.channel || '').toUpperCase().includes('WHATSAPP')) return;
    const phone = threadPhone(row);
    const key = phone || row.externalKey || row.id;
    const savedContact = phone ? contactsByPhone.get(phone) : undefined;
    let target = grouped.get(key);
    if (!target) {
      target = {
        ...row,
        externalKey: row.externalKey || phone,
        contact: row.contact || (savedContact ? toThreadContact(savedContact) : phone ? { phone } : undefined),
        messages: [],
      };
      grouped.set(key, target);
    } else if (!target.contact && savedContact) {
      target.contact = toThreadContact(savedContact);
    }

    const nested = Array.isArray(row.messages) ? row.messages : [];
    if (nested.length) target.messages!.push(...nested);
    else if (row.body || row.subject) {
      target.messages!.push({ id: row.id, direction: row.direction, text: row.body, subject: row.subject, createdAt: row.createdAt });
    }
  });

  return [...grouped.values()]
    .map((thread) => ({ ...thread, messages: [...(thread.messages || [])].sort((a, b) => timeValue(a.createdAt) - timeValue(b.createdAt)) }))
    .sort((a, b) => timeValue(lastMessage(b)?.createdAt || b.createdAt) - timeValue(lastMessage(a)?.createdAt || a.createdAt));
}

function toThreadContact(contact: Contact) {
  return { firstName: contact.firstName || contact.name, lastName: contact.lastName, email: contact.email, phone: contactPhone(contact) };
}

function contactName(contact: Contact | null | undefined) {
  if (!contact) return 'Contato';
  const name = [contact.firstName || contact.name, contact.lastName].filter(Boolean).join(' ').trim();
  return name || contactPhone(contact) || 'Contato';
}

function contactPhone(contact: Contact | null | undefined) {
  return normalizePhone(contact?.phone || '');
}

function threadPhone(thread: InboxThread | null | undefined) {
  if (!thread) return '';
  return normalizePhone(thread.contact?.phone || thread.externalKey || thread.to || '');
}

function threadName(thread: InboxThread) {
  const name = [thread.contact?.firstName, thread.contact?.lastName].filter(Boolean).join(' ').trim();
  return name || formatPhone(threadPhone(thread)) || thread.externalKey || 'Contato';
}

function normalizePhone(value: string) {
  return String(value || '').replace(/\D/g, '').slice(0, 20);
}

function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    const split = local.length === 9 ? 5 : 4;
    return `+55 (${ddd}) ${local.slice(0, split)}-${local.slice(split)}`;
  }
  return `+${digits}`;
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
  return message?.text || message?.subject || thread.body || thread.subject || '';
}

function lastTime(thread: InboxThread) {
  const date = lastMessage(thread)?.createdAt || thread.createdAt;
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

function timeValue(value?: string) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}
