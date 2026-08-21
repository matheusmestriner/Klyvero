'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, session } from '../lib/api';

export function AuthRuntimeGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const verified = useRef(false);
  const [checking, setChecking] = useState(false);
  const protectedRoute = pathname === '/app' || pathname.startsWith('/app/');

  useEffect(() => {
    function redirectToLogin() {
      verified.current = false;
      session.clear();
      router.replace('/login?reason=session-expired');
    }

    window.addEventListener('klyvero:auth-expired', redirectToLogin);
    return () => window.removeEventListener('klyvero:auth-expired', redirectToLogin);
  }, [router]);

  useEffect(() => {
    let active = true;

    if (!protectedRoute) {
      setChecking(false);
      return () => {
        active = false;
      };
    }

    if (session.get()) {
      verified.current = true;
      setChecking(false);
      return () => {
        active = false;
      };
    }

    if (verified.current) {
      setChecking(false);
      return () => {
        active = false;
      };
    }

    setChecking(true);
    api('/auth/refresh', { method: 'POST' })
      .then((data) => {
        if (!active) return;
        if (!data?.accessToken) throw new Error('missing_access_token');
        session.set(data.accessToken);
        verified.current = true;
        setChecking(false);
      })
      .catch(() => {
        if (!active) return;
        verified.current = false;
        session.clear();
        router.replace('/login?reason=session-expired');
      });

    return () => {
      active = false;
    };
  }, [pathname, protectedRoute, router]);

  if (!protectedRoute || !checking) return null;

  return (
    <div className="auth-runtime-overlay" role="status" aria-live="polite">
      <div className="auth-runtime-card">
        <span className="auth-runtime-spinner" aria-hidden="true" />
        <strong>Verificando sua sessão</strong>
        <span>Validando o acesso ao Klyvero com segurança.</span>
      </div>
    </div>
  );
}
