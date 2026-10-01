/* Prazo de validação do formulário SABE 2026.

   O CP foi reaberto excepcionalmente até 02/10/2026 às 23:59
   (horário da Bahia). O prazo fica fixado no código para que configurações
   antigas da hospedagem não impeçam a reabertura nem estendam o horário.

   Para os demais casos, sem a variável, o prazo é HOJE às 23:59 (Bahia).
   Para definir um prazo exato — ou reabrir por um período — use:
   - NEXT_PUBLIC_SABE_PRAZO_FIM=HOJE_2359                -> hoje às 23:59 (Bahia).
   - NEXT_PUBLIC_SABE_PRAZO_FIM=2026-09-29T23:59:00-03:00 -> data/hora exata.
   - NEXT_PUBLIC_SABE_PRAZO_FIM=2026-09-29T23:59 (sem fuso) -> Bahia (-03:00).

   Cada formulário pode ter seu próprio prazo, sobrepondo o geral:
   - NEXT_PUBLIC_SABE_PRAZO_FIM_SM -> exclusivo do formulário SM.
   - NEXT_PUBLIC_SABE_PRAZO_FIM_CP -> exclusivo do formulário CP.

   Depois que o prazo passa, o formulário fica bloqueado até você definir um
   novo prazo futuro (e fazer redeploy). */

// Bahia = America/Bahia, UTC-3, sem horário de verão.
const BAHIA_OFFSET_MS = -3 * 60 * 60 * 1000;
const CP_DEADLINE_VIGENTE = "2026-10-02T23:59:00.000-03:00";

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

/* Formulário ao qual o prazo se aplica. Cada modo pode ter uma variável
   própria (NEXT_PUBLIC_SABE_PRAZO_FIM_CP / _SM) que sobrepõe o prazo geral. */
export type PrazoMode = "cp" | "sm";

export function getDeadline(mode?: PrazoMode): Date {
  const rawGeneral = String(process.env.NEXT_PUBLIC_SABE_PRAZO_FIM || "").trim();

  // Reabertura excepcional do CP. Durante esta janela, a data fixa prevalece
  // sobre variáveis antigas configuradas na hospedagem.
  if (mode === "cp") {
    return new Date(CP_DEADLINE_VIGENTE);
  }

  // Prazo específico do formulário tem prioridade sobre o prazo geral.
  if (mode) {
    const rawMode = String(
      (mode === "sm" ? process.env.NEXT_PUBLIC_SABE_PRAZO_FIM_SM : process.env.NEXT_PUBLIC_SABE_PRAZO_FIM_CP) || ""
    ).trim();
    const specific = parseValue(rawMode);
    if (specific) return specific;
  }
  // Sem variável (ou valor inválido), o padrão é hoje às 23:59 na Bahia.
  return resolveDeadline(rawGeneral) ?? hojeAs2359();
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
