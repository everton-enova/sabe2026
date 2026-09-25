export class ApiError extends Error {
  /* "detalhe" acompanha a resposta para dizer POR QUE a planilha nao respondeu. Guarda apenas
     status HTTP e nome do erro: nunca a URL do webhook nem o segredo. Sem isso, "Nao foi
     possivel acessar a planilha" cobre implantacao errada, acesso restrito e queda de rede,
     e cada palpite custa um redeploy as cegas. */
  constructor(public status: number, message: string, public detail?: string) { super(message); }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0",
    ...(status === 429 ? { "Retry-After": "60" } : {}),
  } });
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return json({ message: error.message, ...(error.detail ? { detalhe: error.detail } : {}) }, error.status);
  console.error("SABE API failure", error);
  // Erro inesperado (não ApiError): mantém o 502, mas inclui a causa real no detalhe
  // e orienta quem está do outro lado em vez de repetir a mesma frase opaca.
  const causa = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return json({
    message: error instanceof Error && /(timeout|abort)/i.test(error.name)
      ? "A consulta demorou mais que o esperado. Aguarde alguns segundos e tente novamente."
      : "Não foi possível consultar os dados deste polo.",
    detalhe: `Erro interno registrado (${causa.slice(0, 300)}).`,
  }, 502);
}
export async function readRequest(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ApiError(415, "Envie os dados em JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Dados inválidos.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); throw new ApiError(413, "Envio excede o tamanho permitido."); }
    chunks.push(value);
  }
  let payload;
  try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError(400, "Dados inválidos."); }
  if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new ApiError(400, "Dados inválidos.");
  return payload;
}
