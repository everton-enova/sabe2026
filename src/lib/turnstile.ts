import { ApiError } from "./api-security";

/* Verifica o token do Cloudflare Turnstile no servidor.
   Sem TURNSTILE_SECRET_KEY configurado a verificacao e ignorada, para nao bloquear
   o formulario antes das chaves existirem. Com a chave configurada, o token passa a
   ser obrigatorio — e o mesmo criterio do sitekey exposto em NEXT_PUBLIC_TURNSTILE_SITE_KEY. */
export async function verifyTurnstile(token: unknown, remoteIp: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  /* So exige o token quando o par sitekey/secret existe. Se apenas o secret estiver
     configurado, o widget nao renderiza no cliente e exigir o token travaria todos os
     envios; nesse caso prevalece nao bloquear. */
  if (!secret || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return true;
  if (typeof token !== "string" || !token) throw new ApiError(400, "Confirme a verificação de segurança antes de enviar.");
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const result = (await response.json()) as { success?: boolean };
    if (result.success !== true) throw new ApiError(400, "Verificação de segurança inválida. Recarregue a página e tente novamente.");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "Não foi possível validar a verificação de segurança. Tente novamente.");
  }
}
