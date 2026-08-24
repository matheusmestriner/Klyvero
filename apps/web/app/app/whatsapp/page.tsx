'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../../lib/api';
import { PageTitle } from '../../../components/resource-page';
import { Icon } from '../../../components/icon';

type PairingStatus = {
  sessionId?: string;
  connected?: boolean;
  loggedIn?: boolean;
  qr?: string;
  pairingState?: string;
  qrUpdatedAt?: string;
};

const POLL_MS = 1800;

export default function WhatsAppPage() {
  const [sessionId, setSessionId] = useState('principal');
  const [status, setStatus] = useState<PairingStatus | null>(null);
  const [qr, setQr] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const pollGeneration = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    if (!qr) {
      setQrImage('');
      return () => {
        active = false;
      };
    }

    QRCode.toDataURL(qr, { width: 280, margin: 2, errorCorrectionLevel: 'M' })
      .then((value) => {
        if (active) setQrImage(value);
      })
      .catch(() => {
        if (active) setError('Não foi possível renderizar o QR Code recebido. Gere um novo código.');
      });

    return () => {
      active = false;
    };
  }, [qr]);

  useEffect(() => {
    return () => stopPolling();
  }, []);

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
      setMessage('WhatsApp conectado e pronto para uso.');
      setError('');
      stopPolling();
      return true;
    }
    return false;
  }

  async function readPairing(id: string) {
    const safeId = encodeURIComponent(id);
    const [nextStatus, nextQR] = await Promise.all([
      api(`/whatsapp/${safeId}/status`).catch(() => null),
      api(`/whatsapp/${safeId}/qr`).catch(() => null),
    ]);

    const loggedIn = applyPairing(nextStatus);
    if (!loggedIn) applyPairing(nextQR);
    return Boolean(nextStatus?.loggedIn || nextQR?.loggedIn);
  }

  function startPolling(id: string) {
    stopPolling();
    const generation = pollGeneration.current;

    const run = async () => {
      if (generation !== pollGeneration.current) return;
      try {
        const loggedIn = await readPairing(id);
        if (loggedIn || generation !== pollGeneration.current) return;
      } catch {
        // A transient poll failure must not destroy an active pairing flow.
      }
      if (generation === pollGeneration.current) {
        pollTimer.current = setTimeout(run, POLL_MS);
      }
    };

    void run();
  }

  async function connect() {
    const id = sessionId.trim();
    if (!id) {
      setError('Informe um identificador para a sessão.');
      return;
    }

    setConnecting(true);
    setError('');
    setMessage('Preparando uma sessão segura de pareamento…');
    setQr('');
    stopPolling();

    try {
      const response = (await api('/whatsapp/connect', {
        method: 'POST',
        body: JSON.stringify({ sessionId: id, displayName: 'Principal' }),
      })) as PairingStatus;

      applyPairing(response);
      if (!response?.loggedIn) {
        setMessage('Abra o WhatsApp no celular e escaneie o QR Code. O código será atualizado automaticamente.');
        startPolling(id);
      }
    } catch (cause: any) {
      setMessage('');
      setError(cause?.message || 'Não foi possível iniciar a conexão com o WhatsApp.');
    } finally {
      setConnecting(false);
    }
  }

  async function check() {
    const id = sessionId.trim();
    if (!id) return;
    setChecking(true);
    setError('');
    try {
      const loggedIn = await readPairing(id);
      if (!loggedIn) {
        setMessage('Sessão ainda não conectada. Se o QR tiver expirado, gere um novo código.');
      }
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível consultar o status da sessão.');
    } finally {
      setChecking(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status?.loggedIn) {
      setError('Conecte o WhatsApp antes de enviar mensagens.');
      return;
    }
    if (!to.trim() || !text.trim()) return;

    setSending(true);
    setError('');
    try {
      await api('/whatsapp/messages/text', {
        method: 'POST',
        body: JSON.stringify({ sessionId: sessionId.trim(), to: to.trim(), text: text.trim() }),
      });
      setText('');
      setMessage('Mensagem enviada e registrada no Inbox.');
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  const state = status?.loggedIn ? 'connected' : status?.pairingState || (qr ? 'waiting_for_scan' : 'idle');

  return (
    <>
      <PageTitle
        title="WhatsApp"
        subtitle="Conecte uma sessão pelo QR Code e acompanhe o pareamento em tempo real."
      />

      {error && <div className="error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <div className="grid2">
        <section className="card spaced-lg">
          <div className="section-head">
            <div>
              <span className="eyebrow">Conexão</span>
              <h3>Sessão do WhatsApp</h3>
            </div>
            <span className={`tag ${status?.loggedIn ? 'ok' : qr ? 'warn' : ''}`}>
              {pairingLabel(state)}
            </span>
          </div>

          <label className="field">
            <span>Identificador da sessão</span>
            <input
              value={sessionId}
              onChange={(event) => {
                stopPolling();
                setSessionId(event.target.value);
                setStatus(null);
                setQr('');
                setMessage('');
                setError('');
              }}
              maxLength={64}
              autoComplete="off"
              placeholder="principal"
            />
          </label>

          <div className="row wrap">
            <button className="btn primary" type="button" onClick={connect} disabled={connecting}>
              <Icon name="whatsapp" size={16} /> {connecting ? 'Preparando…' : status?.loggedIn ? 'Reconectar' : qr ? 'Gerar novo QR' : 'Conectar por QR'}
            </button>
            <button className="btn ghost" type="button" onClick={check} disabled={checking}>
              <Icon name="refresh" size={15} /> {checking ? 'Verificando…' : 'Verificar status'}
            </button>
          </div>

          <div className="muted small">
            O QR é renovado automaticamente enquanto o pareamento estiver ativo. Não compartilhe o QR Code com terceiros.
          </div>
        </section>

        <section className="card spaced-lg">
          <div className="section-head">
            <div>
              <span className="eyebrow">Pareamento</span>
              <h3>{status?.loggedIn ? 'Dispositivo conectado' : 'QR Code'}</h3>
            </div>
          </div>

          {status?.loggedIn ? (
            <div className="empty-state compact">
              <Icon name="check" size={30} />
              <strong>WhatsApp conectado</strong>
              <span>A sessão está autenticada e pronta para enviar e receber mensagens.</span>
            </div>
          ) : qrImage ? (
            <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
              <img src={qrImage} width={280} height={280} alt="QR Code para conectar o WhatsApp" style={{ maxWidth: '100%', height: 'auto', borderRadius: 14 }} />
              <span className="muted small">WhatsApp → Dispositivos conectados → Conectar dispositivo</span>
            </div>
          ) : (
            <div className="empty-state compact">
              <Icon name="whatsapp" size={30} />
              <strong>{connecting ? 'Gerando QR Code…' : 'Aguardando conexão'}</strong>
              <span>Clique em “Conectar por QR” para iniciar uma sessão de pareamento.</span>
            </div>
          )}
        </section>
      </div>

      <section className="card spaced-lg" style={{ marginTop: 16 }}>
        <div className="section-head">
          <div>
            <span className="eyebrow">Teste operacional</span>
            <h3>Enviar mensagem</h3>
          </div>
        </div>

        <form onSubmit={send} className="stack">
          <label className="field">
            <span>Destino</span>
            <input value={to} onChange={(event) => setTo(event.target.value)} placeholder="5511999999999" maxLength={32} />
          </label>
          <label className="field">
            <span>Mensagem</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Digite uma mensagem de teste" maxLength={10000} rows={4} />
          </label>
          <div>
            <button className="btn primary" type="submit" disabled={sending || !status?.loggedIn || !to.trim() || !text.trim()}>
              <Icon name="send" size={16} /> {sending ? 'Enviando…' : 'Enviar mensagem'}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function pairingLabel(state: string) {
  switch (state) {
    case 'connected': return 'Conectado';
    case 'paired': return 'Pareado';
    case 'waiting_for_scan': return 'Aguardando leitura';
    case 'starting': return 'Gerando QR';
    case 'reconnecting': return 'Reconectando';
    case 'expired': return 'QR expirado';
    case 'logged_out': return 'Desconectado';
    case 'error': return 'Falha na conexão';
    default: return 'Não conectado';
  }
}
