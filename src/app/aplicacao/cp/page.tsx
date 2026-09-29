import type { Metadata } from "next";
import { ApplicationForm } from "@/components/application-form";
import { PrazoEncerrado } from "@/components/prazo-encerrado";
import { getDeadline, isExpired } from "@/lib/prazo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Validação dos Coordenadores de Polo | SABE 2026",
  robots: { index: false, follow: false },
};

export default function CpPage() {
  if (isExpired(getDeadline("cp"))) {
    return <PrazoEncerrado titulo="Validação dos Coordenadores de Polo" mode="cp" />;
  }
  return <ApplicationForm mode="cp" />;
}
