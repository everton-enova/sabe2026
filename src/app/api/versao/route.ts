import { json } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type StatusResponse = { ok?: boolean; code?: string; versao?: string; validadosGlobal?: boolean; migracao?: { migrados?: number; skipped?: boolean } };

/* Diagnóstico simples e público: informa se o Apps Script publicado é o código atual.
   A versão antiga não conhece tipo:"status" e responde INVALID — é exatamente esse o sinal. */
export async function GET() {
  const url = process.env.SABE_SHEETS_WEBHOOK_URL;
  const secret = process.env.SABE_WEBHOOK_SECRET;
  if (!url || !secret) {
    return json({ ok: false, code: "CONFIG", message: "SABE_SHEETS_WEBHOOK_URL e SABE_WEBHOOK_SECRET não configuradas na Vercel." });
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "status", chave: secret }),
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
    const result = (await response.json().catch(() => null)) as StatusResponse | null;
    if (result?.versao) return json({ ok: true, versao: result.versao, validadosGlobal: result.validadosGlobal === true, migracao: result.migracao ?? null });
    return json({
      ok: false,
      code: result?.code || "DESATUALIZADO",
      message: "O Apps Script publicado ainda é uma versão antiga (provavelmente ainda grava em INSCRICOES CP). Publique uma NOVA VERSÃO com o Code.gs atual.",
    });
  } catch (error) {
    return json({ ok: false, code: (error as { name?: string }).name || "ERRO" });
  }
}
