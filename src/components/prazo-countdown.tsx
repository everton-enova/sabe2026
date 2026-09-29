"use client";

import { useEffect, useState } from "react";
import { countdownParts, formatDeadline, getDeadline, isExpired } from "@/lib/prazo";

/* Relógio do prazo de validação. Só começa a contar depois da montagem
   (useEffect) para não gerar hidratação diferente entre servidor e navegador. */
export function useDeadline() {
  const [deadline] = useState(() => getDeadline());
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expired = now !== null && isExpired(deadline, now);
  const remaining = now !== null && deadline ? Math.max(0, deadline.getTime() - now) : 0;

  return { deadline, now, expired, remaining, parts: countdownParts(remaining) };
}

/* Faixa visual do contador regressivo. */
export function PrazoCountdown({ deadline, now, expired, parts }: ReturnType<typeof useDeadline>) {
  if (!deadline) return null;

  if (now === null) {
    return (
      <div className="prazo-banner" role="timer">
        <span className="prazo-label">Carregando prazo de validação…</span>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="prazo-banner expired" role="status">
        <span className="prazo-label">Encerrou-se o prazo de validação.</span>
      </div>
    );
  }

  const clock = parts
    ? `${parts.days > 0 ? `${parts.days}d ` : ""}${parts.hours}:${parts.minutes}:${parts.seconds}`
    : "00:00:00";

  return (
    <div className="prazo-banner" role="timer">
      <div className="prazo-banner-copy">
        <span className="prazo-label">Prazo de validação encerra em</span>
        <span className="prazo-end">{formatDeadline(deadline)}</span>
      </div>
      <div className="prazo-clock" aria-hidden="true">{clock}</div>
    </div>
  );
}
