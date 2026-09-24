import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Validação dos Coordenadores de Polo | SABE 2026",
  robots: { index: false, follow: false },
};

export default function CpPage() {
  return (
    <main className="form-page">
      <section className="form-intro">
        <h1>Validação dos Coordenadores de Polo</h1>
        <div className="intro-copy">
          <p className="eyebrow">Em atualização</p>
          <p className="lead">Estamos atualizando este formulário.</p>
          <p>
            O acesso à validação dos Coordenadores de Polo está temporariamente indisponível
            enquanto concluímos uma atualização. Por favor, volte em alguns instantes.
          </p>
        </div>
      </section>
      <section className="form-shell" aria-live="polite">
        <div className="success-state">
          <span className="success-icon">↻</span>
          <p className="eyebrow">Voltamos em breve</p>
          <h2>Formulário em manutenção</h2>
          <p>
            Nenhum envio pode ser feito por esta página no momento. Aguarde o aviso oficial
            para retomar o preenchimento.
          </p>
        </div>
      </section>
    </main>
  );
}
