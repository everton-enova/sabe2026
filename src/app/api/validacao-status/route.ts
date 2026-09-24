import { json } from "@/lib/api-security";
import { sheets } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* A leitura usa o mesmo webhook de 15s de lib/sheets.ts; nao ha mais chamada de 55s. */
export const maxDuration = 60;

/* Sem ?nte devolve todos os polos validados (pre-carregamento da pagina).
   Com ?nte filtra por NTE. So atende o CP.
   `escopo` diz o que foi pedido e `falha` sinaliza que o Apps Script nao respondeu —
   assim o cliente sabe se precisa cair no modo antigo (consulta por NTE). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nte = searchParams.get("nte");
  const escopo = nte ? "nte" : "global";
  if (searchParams.get("mode") !== "cp") return json({ validated: [], escopo });
  try {
    const payload: Record<string, unknown> = { tipo: "validados" };
    if (nte) payload.nte = nte;
    const result = await sheets(payload) as { validated?: unknown };
    return json({ validated: Array.isArray(result.validated) ? result.validated : [], escopo });
  } catch (error) {
    // O status e auxiliar: se a planilha nao responder, o formulario segue e o servidor
    // ainda bloqueia duplicidade. Nunca transformar isso em erro de tela.
    console.error("SABE validacao-status", error);
    return json({ validated: [], escopo, falha: true });
  }
}
