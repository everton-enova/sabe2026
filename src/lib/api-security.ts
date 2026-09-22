export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0",
    ...(status === 429 ? { "Retry-After": "60" } : {}),
  } });
}
export function failure(error: unknown) {
  return error instanceof ApiError ? json({ message: error.message }, error.status)
    : json({ message: "Serviço indisponível. Tente novamente em instantes." }, 502);
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
