import type { Metadata } from "next";
import { ApplicationForm } from "@/components/application-form";

export const metadata: Metadata = {
  title: "Validação dos Coordenadores de Polo (teste) | SABE 2026",
  robots: { index: false, follow: false },
};

export default function Cp2Page() {
  return <ApplicationForm mode="cp" testMode />;
}
