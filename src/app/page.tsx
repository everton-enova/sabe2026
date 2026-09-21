import Link from "next/link";

const applications = [
  { slug: "cp", title: "Aplicação CP", description: "Fluxo e regras da modalidade CP." },
  { slug: "sm", title: "Aplicação SM", description: "Fluxo e regras da modalidade SM." },
] as const;

export default function Home() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Ciclo 2026</p>
        <h1>Aplicações SABE</h1>
        <p>Um ponto central para acessar e acompanhar os formulários do projeto.</p>
      </section>
      <section aria-labelledby="modalidades">
        <h2 id="modalidades">Modalidades</h2>
        <div className="application-list">
          {applications.map((application, index) => (
            <Link href={`/aplicacao/${application.slug}`} key={application.slug}>
              <span className="number">0{index + 1}</span>
              <span><strong>{application.title}</strong><small>{application.description}</small></span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
