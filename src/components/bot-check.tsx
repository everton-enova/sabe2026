"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

export function BotCheck({ action, onToken }: { action: string; onToken: (token: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (!sitekey || !ready || !element.current || !window.turnstile) return;
    const widget = window.turnstile.render(element.current, {
      sitekey, action, language: "pt-br", size: "flexible",
      callback: (token: string) => { onToken(token); setError(false); },
      "expired-callback": () => onToken(""),
      "error-callback": () => { onToken(""); setError(true); },
    });
    return () => { window.turnstile?.remove(widget); };
  }, [action, onToken, ready, retry, sitekey]);
  if (!sitekey) return process.env.NODE_ENV === "production" ? <p role="alert">Verificação de segurança ainda não configurada.</p> : null;
  return <div className="bot-check">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setReady(true)} onError={() => setError(true)} />
    <div ref={element} />
    {error && <p role="alert">Não foi possível verificar a segurança. <button type="button" onClick={() => { onToken(""); setError(false); setRetry(value => value + 1); }}>Tentar novamente</button></p>}
  </div>;
}
