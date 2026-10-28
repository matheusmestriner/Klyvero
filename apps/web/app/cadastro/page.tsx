'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { applyBranding, DEFAULT_LOGO_URL, ResolvedBranding } from '../../lib/branding';
import { formatBrDocument, isValidBrDocument, onlyDigits, slugify } from '../../lib/br-document';
import styles from './cadastro.module.css';

type Invite = { label: string; email: string | null; expiresAt: string; platformName: string };
type Done = { tenant: { name: string; slug: string }; user: { email: string } };
type Phase = 'checking' | 'invalid' | 'form' | 'done';

const RESERVED = ['admin', 'api', 'app', 'www', 'login', 'setup', 'cadastro', 'platform', 'plataforma', 'klyvero', 'suporte', 'support', 'root', 'owner'];
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Takes the one-time token out of the address bar as soon as it has been read. */
function takeToken() {
  const url = new URL(window.location.href);
  const value = url.searchParams.get('token') || '';
  if (value) {
    url.searchParams.delete('token');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }
  return value;
}

export default function SignupPage() {
  const [brand, setBrand] = useState<ResolvedBranding | null>(null);
  const [phase, setPhase] = useState<Phase>('checking');
  const [token, setToken] = useState('');
  const [invite, setInvite] = useState<Invite | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [document, setDocument] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [productName, setProductName] = useState('');
  const [useColor, setUseColor] = useState(false);
  const [color, setColor] = useState('#2563eb');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    const value = takeToken();
    setToken(value);

    api(`/branding/resolve/domain/${encodeURIComponent(window.location.hostname)}`)
      .then((resolved: ResolvedBranding) => {
        applyBranding(resolved);
        setBrand(resolved);
      })
      .catch(() => {
        const fallback: ResolvedBranding = { branding: { productName: 'Klyvero', themeMode: 'SYSTEM', logoUrl: DEFAULT_LOGO_URL } };
        applyBranding(fallback);
        setBrand(fallback);
      });

    if (!value) {
      setPhase('invalid');
      return;
    }
    api('/signup/invite/check', { method: 'POST', body: JSON.stringify({ token: value }) })
      .then((data: Invite) => {
        setInvite(data);
        if (data.email) setEmail(data.email);
        setPhase('form');
      })
      .catch(() => setPhase('invalid'));
  }, []);

  // The workspace identifier follows the company name until the person edits it.
  useEffect(() => {
    if (!slugEdited) setSlug(slugify(companyName));
  }, [companyName, slugEdited]);

  const documentDigits = onlyDigits(document);
  const problems = useMemo(() => {
    const found: string[] = [];
    if (companyName.trim().length < 2) found.push('Informe o nome da empresa.');
    if (!isValidBrDocument(documentDigits)) found.push('CPF ou CNPJ inválido.');
    if (responsibleName.trim().length < 2) found.push('Informe o nome do responsável.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.push('Informe um e-mail válido.');
    if (password.length < 12) found.push('A senha precisa ter pelo menos 12 caracteres.');
    else if (password !== confirmation) found.push('A confirmação da senha não confere.');
    if (slug.length < 3 || !SLUG_PATTERN.test(slug)) found.push('O workspace precisa ter 3 a 40 letras minúsculas, números ou hífens.');
    else if (RESERVED.includes(slug)) found.push('Este identificador de workspace não está disponível.');
    return found;
  }, [companyName, documentDigits, responsibleName, email, password, confirmation, slug]);

  // A message about a field goes away as soon as the person edits the form.
  useEffect(() => setError(''), [problems]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result: Done = await api('/signup', {
        method: 'POST',
        body: JSON.stringify({
          token,
          companyName: companyName.trim(),
          document: documentDigits,
          responsibleName: responsibleName.trim(),
          email: email.trim().toLowerCase(),
          password,
          slug,
          productName: productName.trim() || undefined,
          primaryColor: useColor ? color : undefined,
        }),
      });
      setPassword('');
      setConfirmation('');
      setDone(result);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Não foi possível concluir o cadastro. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  const platformName = invite?.platformName || brand?.branding?.productName || 'Klyvero';
  const logoUrl = brand?.branding?.logoUrl || DEFAULT_LOGO_URL;
  const text = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => setter(event.target.value);

  return (
    <div className="login">
      <div className={`login-card ${styles.card}`}>
        <div className="logo">
          <img className="brand-logo" src={logoUrl} alt={platformName} />
        </div>

        {phase === 'checking' && <p className="muted center" role="status">Verificando o convite…</p>}

        {phase === 'invalid' && (
          <>
            <h1>Convite indisponível</h1>
            <p className="muted">
              Este link de cadastro é inválido, expirou ou já foi utilizado. Cada convite vale para um único cadastro.
              Peça um novo link a quem convidou você.
            </p>
            <Link className="btn primary full" href="/login">Ir para o login</Link>
          </>
        )}

        {phase === 'form' && invite && (
          <form onSubmit={submit} noValidate>
            <h1>Cadastro do responsável</h1>
            <p className="muted">
              Convite do {platformName} para <b>{invite.label}</b>. Você será o dono da conta principal e poderá usar a sua própria marca (white label).
            </p>

            <div className={styles.grid}>
              <p className={styles.section}>Empresa</p>
              <div className={`field ${styles.span}`}>
                <label htmlFor="companyName">Nome da empresa</label>
                <input id="companyName" value={companyName} onChange={text(setCompanyName)} autoComplete="organization" required disabled={busy} />
              </div>
              <div className="field">
                <label htmlFor="document">CPF ou CNPJ</label>
                <input
                  id="document"
                  value={document}
                  onChange={(event) => setDocument(formatBrDocument(event.target.value))}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="00.000.000/0000-00"
                  aria-invalid={documentDigits.length >= 11 && !isValidBrDocument(documentDigits)}
                  required
                  disabled={busy}
                />
                <span className={styles.hint}>Um cadastro por documento.</span>
              </div>
              <div className="field">
                <label htmlFor="slug">Workspace</label>
                <input
                  id="slug"
                  value={slug}
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(event.target.value.toLowerCase());
                  }}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  disabled={busy}
                />
                <span className={styles.hint}>É o que você digita para entrar.</span>
              </div>

              <p className={styles.section}>Responsável</p>
              <div className={`field ${styles.span}`}>
                <label htmlFor="responsibleName">Nome completo</label>
                <input id="responsibleName" value={responsibleName} onChange={text(setResponsibleName)} autoComplete="name" required disabled={busy} />
              </div>
              <div className={`field ${styles.span}`}>
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={text(setEmail)}
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  readOnly={Boolean(invite.email)}
                  required
                  disabled={busy}
                />
                {invite.email && <span className={styles.hint}>Este convite vale para este e-mail.</span>}
              </div>
              <div className="field">
                <label htmlFor="password">Senha</label>
                <input id="password" type="password" value={password} onChange={text(setPassword)} autoComplete="new-password" minLength={12} required disabled={busy} />
                <span className={styles.hint}>Mínimo de 12 caracteres.</span>
              </div>
              <div className="field">
                <label htmlFor="confirmation">Confirmar senha</label>
                <input id="confirmation" type="password" value={confirmation} onChange={text(setConfirmation)} autoComplete="new-password" required disabled={busy} />
              </div>

              <p className={styles.section}>Sua marca (opcional)</p>
              <div className={`field ${styles.span}`}>
                <label htmlFor="productName">Nome do produto</label>
                <input id="productName" value={productName} onChange={text(setProductName)} placeholder={companyName || platformName} maxLength={80} disabled={busy} />
                <span className={styles.hint}>Logo, domínio e textos de login você configura depois, na tela Branding.</span>
              </div>
              <div className={`field ${styles.span}`}>
                <label className={styles.colorRow}>
                  <input type="checkbox" checked={useColor} onChange={(event) => setUseColor(event.target.checked)} disabled={busy} />
                  Definir cor principal
                </label>
                {useColor && (
                  <div className={styles.colorRow}>
                    <input type="color" value={color} onChange={text(setColor)} aria-label="Cor principal" disabled={busy} />
                    <code>{color}</code>
                  </div>
                )}
              </div>
            </div>

            {error && <div className="error" role="alert">{error}</div>}

            <button className="btn primary full" disabled={busy}>{busy ? 'Criando sua conta…' : 'Criar minha conta'}</button>
            <p className="muted center">
              Já tem conta? <Link href="/login">Entrar</Link>
            </p>
          </form>
        )}

        {phase === 'done' && done && (
          <>
            <h1>Cadastro concluído</h1>
            <p className="muted">Sua conta principal foi criada. Guarde os dados de acesso:</p>
            <div className={styles.summary}>
              <span>Workspace: <b>{done.tenant.slug}</b></span>
              <span>E-mail: <b>{done.user.email}</b></span>
            </div>
            <Link className="btn primary full" href={`/login?workspace=${encodeURIComponent(done.tenant.slug)}`}>Entrar agora</Link>
          </>
        )}
      </div>
    </div>
  );
}
