import { formatDeadline, getDeadline, PrazoMode } from "@/lib/prazo";

/* Caixa exibida quando o prazo de validação terminou. */
export function PrazoEncerradoBox({ mode }: { mode?: PrazoMode }) {
  const deadline = getDeadline(mode);
  return (
    <section className="form-shell">
      <div className="prazo-encerrado-box">
        <span className="prazo-encerrado-icon" aria-hidden="true">⏱</span>
        <p className="eyebrow">Prazo encerrado</p>
        <h2>Encerrou-se o prazo de validação.</h2>
        {deadline && <p>O prazo terminou em <strong>{formatDeadline(deadline)}</strong> (horário da Bahia).</p>}
        <p>O formulário está temporariamente indisponível para novos envios e alterações. Aguarde novas orientações para saber quando voltará ao ar.</p>
      </div>
    </section>
  );
}

/* Página completa usada pelas rotas /aplicacao/cp e /aplicacao/sm. */
export function PrazoEncerrado({ titulo, mode }: { titulo: string; mode?: PrazoMode }) {
  return (
    <main className="form-page">
      <section className="form-intro">
        <h1>{titulo}</h1>
        <div className="intro-copy">
          <p className="lead">Encerrou-se o prazo de validação.</p>
          <p>O formulário está temporariamente indisponível para novos envios e alterações.</p>
        </div>
      </section>
      <PrazoEncerradoBox mode={mode} />
    </main>
  );
}
