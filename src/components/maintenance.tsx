export function Maintenance() {
  return (
    <main className="maintenance" style={{ display: "grid", placeItems: "center", minHeight: "100vh", textAlign: "center" }}>
      <div style={{ maxWidth: 640, padding: "0 24px" }}>
        <p className="eyebrow" style={{ marginBottom: 16 }}>SABE 2026</p>
        <h1 style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)", lineHeight: 1.05, letterSpacing: "-0.045em", marginBottom: 20 }}>
          Estamos em manutenção
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "1.05rem", marginBottom: 32 }}>
          O formulário está temporariamente indisponível enquanto ajustamos a
          validação dos documentos enviados. Em breve voltaremos ao ar.
        </p>
        <p style={{ color: "var(--muted)", fontSize: ".95rem" }}>
          Obrigado pela compreensão.
        </p>
      </div>
    </main>
  );
}
