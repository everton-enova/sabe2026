import { createHash } from "node:crypto";

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
const localLimits = new Map<string, { count: number; expires: number }>();
async function rateLimit(request: Request) {
  // Vercel replaces this header; arbitrary X-Forwarded-For values are not trusted.
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") : "local";
  const key = `sabe:rate:${createHash("sha256").update(ip || "unknown").digest("hex")}`;
  const endpoint = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  let count: number;
  if (endpoint && token) {
    const response = await fetch(endpoint, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n", "1", key]),
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    if (!response.ok || typeof result.result !== "number") throw new ApiError(503, "Proteção temporariamente indisponível.");
    count = result.result;
  } else {
    if (process.env.NODE_ENV === "production") throw new ApiError(503, "Proteção de acesso ainda não configurada.");
    const now = Date.now();
    for (const [item, value] of localLimits) if (value.expires <= now) localLimits.delete(item);
    const bucket = localLimits.get(key) || { count: 0, expires: now + 60000 };
    count = ++bucket.count;
    localLimits.set(key, bucket);
  }
  if (count > 20) throw new ApiError(429, "Muitas tentativas. Aguarde um minuto e tente novamente.");
}
export async function readRequest(request: Request): Promise<Record<string, unknown>> {
  const expected = process.env.SABE_APP_ORIGIN || new URL(request.url).origin;
  if (request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "Origem não autorizada.");
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ApiError(415, "Envie os dados em JSON.");
  await rateLimit(request);
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
export async function verifyBot(payload: Record<string, unknown>, action: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return;
    throw new ApiError(503, "Verificação de segurança ainda não configurada.");
  }
  const token = payload.turnstileToken;
  if (typeof token !== "string" || !token || token.length > 2048) throw new ApiError(403, "Conclua a verificação de segurança.");
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token }), signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  const hostname = process.env.SABE_APP_ORIGIN ? new URL(process.env.SABE_APP_ORIGIN).hostname : undefined;
  if (process.env.NODE_ENV === "production" && !hostname) throw new ApiError(503, "Domínio de segurança não configurado.");
  if (!response.ok || result.success !== true || result.action !== action || (hostname && result.hostname !== hostname)) {
    throw new ApiError(403, "Verificação expirada ou inválida. Tente novamente.");
  }
}
