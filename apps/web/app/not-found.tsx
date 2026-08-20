import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <main className={styles.shell} aria-labelledby="error-title">
      <section className={styles.card}>
        <div className={styles.brand} aria-label="Klyvero">
          <span className={styles.brandMark} aria-hidden="true" />
          <span>Klyvero</span>
        </div>

        <div className={styles.code} aria-hidden="true">404</div>
        <p className={styles.kicker}>Página não encontrada</p>
        <h1 id="error-title">Essa página não existe ou foi movida.</h1>
        <p className={styles.copy}>
          Confira o endereço informado ou volte para uma área segura da plataforma.
        </p>

        <div className={styles.actions}>
          <Link className={`${styles.button} ${styles.primary}`} href="/app">
            Ir para o Dashboard
          </Link>
          <Link className={`${styles.button} ${styles.secondary}`} href="/login">
            Voltar ao login
          </Link>
        </div>

        <p className={styles.help}>Código: 404 · Recurso não encontrado</p>
      </section>
    </main>
  );
}
