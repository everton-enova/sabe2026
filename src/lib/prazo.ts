/* Prazo de validação do formulário SABE 2026.

   Controle pelo ambiente (Vercel ou .env):
   - NEXT_PUBLIC_SABE_PRAZO_FIM=""          -> sem prazo (formulário sempre aberto).
   - NEXT_PUBLIC_SABE_PRAZO_FIM=HOJE_2359   -> hoje às 23:59 (horário da Bahia).
   - NEXT_PUBLIC_SABE_PRAZO_FIM=2026-09-29T23:59:00-03:00 -> data/hora exata.
   - NEXT_PUBLIC_SABE_PRAZO_FIM=2026-09-29T23:59 (sem fuso) -> interpretado como Bahia (-03:00).

   Para voltar ao ar depois de encerrado, troque a variável por um prazo futuro
   (ou por HOJE_2359 para encerrar hoje) e faça redeploy. */

// Bahia = America/Bahia, UTC-3, sem horário de verão.
const BAHIA_OFFSET_MS = -3 * 60 * 60 * 1000;

function hojeAs2359(): Date {
  const bahiaAgora = new Date(Date.now() + BAHIA_OFFSET_MS);
  const ano = bahiaAgora.getUTCFullYear();
  const mes = bahiaAgora.getUTCMonth();
  const dia = bahiaAgora.getUTCDate();
  // 23:59 em Bahia (UTC-3) corresponde a 02:59 UTC do dia seguinte.
  return new Date(Date.UTC(ano, mes, dia, 23, 59, 0) - BAHIA_OFFSET_MS);
}

function parseValue(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // "HOJE_2359", "hoje-2359", "hoje 23:59" etc.
  if (/^hoje[-_]?23[-_]?59$/i.test(trimmed.replace(/[\s:]/g, ""))) {
    return hojeAs2359();
  }

  // Data/hora sem fuso é interpretada no horário da Bahia.
  let candidate = trimmed;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    candidate = `${trimmed.replace(" ", "T")}-03:00`;
  }

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveDeadline(raw: string | undefined): Date | null {
  return parseValue(String(raw || ""));
}

export function getDeadline(): Date | null {
  return resolveDeadline(process.env.NEXT_PUBLIC_SABE_PRAZO_FIM);
}

export function isExpired(deadline: Date | null, now: number = Date.now()): boolean {
  return Boolean(deadline && now >= deadline.getTime());
}

/* Formata o prazo no horário da Bahia (dd/mm/aaaa hh:mm). */
export function formatDeadline(date: Date): string {
  const bahia = new Date(date.getTime() + BAHIA_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(bahia.getUTCDate())}/${pad(bahia.getUTCMonth() + 1)}/${bahia.getUTCFullYear()} ${pad(bahia.getUTCHours())}:${pad(bahia.getUTCMinutes())}`;
}

export type CountdownParts = { days: number; hours: string; minutes: string; seconds: string };

export function countdownParts(ms: number): CountdownParts | null {
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    days: Math.floor(total / 86400),
    hours: pad(Math.floor((total % 86400) / 3600)),
    minutes: pad(Math.floor((total % 3600) / 60)),
    seconds: pad(total % 60),
  };
}
