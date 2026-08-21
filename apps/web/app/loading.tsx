export default function Loading() {
  return (
    <main className="route-state-page" aria-busy="true" aria-live="polite">
      <section className="route-state-card route-state-loading">
        <span className="route-state-spinner" aria-hidden="true" />
        <h1>Carregando</h1>
        <p>Preparando sua área no Klyvero.</p>
      </section>
    </main>
  );
}
