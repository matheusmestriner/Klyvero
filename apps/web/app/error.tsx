'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Klyvero route error', error);
  }, [error]);

  return (
    <main className="route-state-page">
      <section className="route-state-card" role="alert">
        <div className="route-state-code">ERRO</div>
        <h1>Não foi possível carregar esta área</h1>
        <p>O Klyvero encontrou uma falha inesperada nesta página. Seus dados não foram alterados por esta tela.</p>
        <div className="route-state-actions">
          <button className="btn primary" type="button" onClick={reset}>Tentar novamente</button>
          <a className="btn" href="/app">Ir para o Dashboard</a>
        </div>
      </section>
    </main>
  );
}
