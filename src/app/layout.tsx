import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SABE 2026",
  description: "Plataforma de aplicações SABE 2026",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>
        <header>
          <nav aria-label="Navegação principal">
            <Link className="brand" href="/">SABE <span>2026</span></Link>
            <div>
              <Link href="/">Início</Link>
              <Link href="/aplicacao/cp">CP</Link>
              <Link href="/aplicacao/sm">SM</Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
