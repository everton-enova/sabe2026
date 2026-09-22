import { ApiError } from "./api-security";
import data from "@/data/sabe.json";

export function validateLocation(mode: unknown, nte: unknown, local: unknown) {
  if (typeof nte !== "string" || typeof local !== "string" ||
    !(mode === "CP" ? data.coordinators.some(item => item.nte === nte && item.polo === local)
      : mode === "SM" && data.locations.some(item => item.nte === nte && item.municipio === local))) {
    throw new ApiError(400, "Selecione um NTE e um local válidos.");
  }
}
export async function sheets(payload: Record<string, unknown>) {
  const url = process.env.SABE_SHEETS_WEBHOOK_URL;
  const secret = process.env.SABE_WEBHOOK_SECRET;
  if (!url || !secret) throw new ApiError(503, "Conexão com a planilha ainda não configurada.");
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, chave: secret }), cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new ApiError(502, "Não foi possível acessar a planilha.");
  const result = await response.json();
  if (result.ok !== true) {
    const messages: Record<string, [number, string]> = {
      NOT_FOUND: [404, "Não encontramos uma indicação para este polo."],
      CONFLICT: [409, "A indicação foi atualizada. Consulte o polo novamente antes de enviar."],
      DUPLICATE: [409, "Este formulário já foi enviado."],
      INVALID: [400, "Confira os dados informados."],
    };
    const [status, message] = messages[result.code] || [502, "Não foi possível concluir a operação na planilha."];
    throw new ApiError(status, message);
  }
  return result;
}
