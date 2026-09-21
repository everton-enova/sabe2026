import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SABE 2026",
  description: "Plataforma de aplicações SABE 2026",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
