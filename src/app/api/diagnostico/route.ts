import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(value: string | null, secret: string | undefined) {
  if (!secret || !value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.SABE_DIAGNOSTICO_SECRET;
  const { searchParams } = new URL(request.url);
  // Sem segredo configurado o endpoint fica fechado: antes ele expunha a URL do
  // webhook e os dados pessoais do coordenador de um polo a qualquer visitante.
  if (!authorized(searchParams.get("chave"), secret)) return json({ message: "Não encontrado." }, 404);

  const webhookUrl = process.env.SABE_SHEETS_WEBHOOK_URL;
  const webhookSecret = process.env.SABE_WEBHOOK_SECRET;

  const diagnostico: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    variaveis: {
      webhookUrl: webhookUrl ? "Configurada" : "Faltando",
      webhookSecret: webhookSecret ? "Configurado" : "Faltando",
    },
    testeAppsScript: null,
  };

  if (webhookUrl && webhookSecret) {
    try {
      const startTime = Date.now();
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "validados", nte: "NTE 01", chave: webhookSecret }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; code?: string; validated?: unknown[] }
        | null;
      diagnostico.testeAppsScript = {
        status: response.status,
        tempo: `${Date.now() - startTime}ms`,
        code: result?.code ?? null,
        polosValidados: Array.isArray(result?.validated) ? result.validated.length : null,
        sucesso: response.ok && result?.ok !== false,
      };
    } catch (error) {
      diagnostico.testeAppsScript = { erro: (error as { name?: string }).name || "erro desconhecido" };
    }
  }

  return json(diagnostico);
}
