import Link from 'next/link';

export default function AppNotFound() {
  return (
    <section className="empty-state large">
      <span className="not-found-code small">404</span>
      <strong>Essa área não existe</strong>
      <span>Volte ao dashboard ou use a busca global.</span>
      <Link className="btn primary" href="/app">Voltar ao dashboard</Link>
    </section>
  );
}
