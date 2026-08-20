'use client';

import Script from 'next/script';
import { useEffect, useMemo, useState } from 'react';

type Consent = 'accepted' | 'rejected' | null;

export function SiteGovernance({
  analyticsId,
  privacyUrl,
  cookiePolicyUrl,
  supportWhatsapp,
  supportMessage,
}: {
  analyticsId: string;
  privacyUrl: string;
  cookiePolicyUrl: string;
  supportWhatsapp: string;
  supportMessage: string;
}) {
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('klyvero.cookieConsent');
    setConsent(stored === 'accepted' || stored === 'rejected' ? stored : null);
    setReady(true);
  }, []);

  function choose(value: Exclude<Consent, null>) {
    window.localStorage.setItem('klyvero.cookieConsent', value);
    window.localStorage.setItem('klyvero.cookieConsentAt', new Date().toISOString());
    setConsent(value);
  }

  const whatsappHref = useMemo(() => {
    const digits = supportWhatsapp.replace(/\D/g, '');
    if (!digits) return '';
    return `https://wa.me/${digits}?text=${encodeURIComponent(supportMessage)}`;
  }, [supportMessage, supportWhatsapp]);

  return (
    <>
      {analyticsId && consent === 'accepted' && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(analyticsId)}`} strategy="afterInteractive" />
          <Script id="klyvero-google-analytics" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(analyticsId)},{anonymize_ip:true,allow_google_signals:false});`}
          </Script>
        </>
      )}

      {ready && consent === null && (
        <section className="cookie-banner" role="dialog" aria-live="polite" aria-label="Preferências de cookies">
          <div className="cookie-copy">
            <strong>Privacidade e cookies</strong>
            <span>
              Usamos armazenamento essencial para sessão e preferências. Analytics só é carregado com sua autorização.
              {(cookiePolicyUrl || privacyUrl) && (
                <> <a href={cookiePolicyUrl || privacyUrl} target="_blank" rel="noreferrer">Saiba mais</a>.</>
              )}
            </span>
          </div>
          <div className="cookie-actions">
            <button className="btn small ghost" type="button" onClick={() => choose('rejected')}>Somente essenciais</button>
            <button className="btn small primary" type="button" onClick={() => choose('accepted')}>Aceitar analytics</button>
          </div>
        </section>
      )}

      {whatsappHref && (
        <a
          className="support-whatsapp"
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar com o suporte pelo WhatsApp"
          title="Suporte pelo WhatsApp"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.52 3.48A11.8 11.8 0 0 0 12.08 0C5.51 0 .17 5.34.17 11.9c0 2.1.55 4.15 1.6 5.95L.07 24l6.3-1.65a11.9 11.9 0 0 0 5.7 1.45h.01c6.56 0 11.9-5.34 11.9-11.9 0-3.18-1.23-6.17-3.46-8.42Zm-8.44 18.31h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.23-.37a9.83 9.83 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.9-9.89a9.82 9.82 0 0 1 7 2.9 9.83 9.83 0 0 1 2.9 7c0 5.45-4.44 9.88-9.9 9.88Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47a8.92 8.92 0 0 1-1.65-2.05c-.17-.3-.02-.46.13-.6.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z"/></svg>
        </a>
      )}
    </>
  );
}
