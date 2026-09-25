#!/usr/bin/env node
/**
 * Diagnóstico automático do SABE 2026.
 * Testa, na ordem: webhook GAS, fallback público da planilha e Supabase Storage.
 * Uso: node scripts/diagnostico.mjs
 * Pode ser rodado localmente (usa o .env) ou em qualquer lugar com as variáveis.
 */
import fs from "node:fs";

function loadEnv() {
  const env = {};
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match) env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
    }
  }
  return env;
}

const env = loadEnv();
const ñ = (value) => `${value?.length ? "configurado" : "VAZIO"} (${value?.length ?? 0} chars)`;
const ok = "✅", warn = "⚠️", error = "❌";

console.log("=".repeat(64));
console.log("DIAGNÓSTICO SABE 2026");
console.log("=".repeat(64));

// 1. Variáveis
console.log("\n[1/4] Variáveis de ambiente");
console.log(`  SABE_SHEETS_WEBHOOK_URL:       ${env.SABE_SHEETS_WEBHOOK_URL ? ok + " " + env.SABE_SHEETS_WEBHOOK_URL.slice(0, 70) + "…" : error + " VAZIA — sem webhook, o envio NÃO grava na planilha"}`);
console.log(`  SABE_WEBHOOK_SECRET:            ${env.SABE_WEBHOOK_SECRET ? ok + " " + ñ(env.SABE_WEBHOOK_SECRET) : error + ` ${ñ(env.SABE_WEBHOOK_SECRET)}`}`);
console.log(`  NEXT_PUBLIC_SUPABASE_URL:       ${env.NEXT_PUBLIC_SUPABASE_URL ? ok : error}`);
console.log(`  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? ok : error}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY:      ${env.SUPABASE_SERVICE_ROLE_KEY ? ok + " (upload via Storage)" : warn + " VAZIA — upload usa a publishable key; sem RLS o upload SM falha"}`);
console.log(`  TURNSTILE_SITE_KEY/SECRET:      ${env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY ? ok + " ativo" : warn + " desativado (anti-bot não bloqueia)"}`);

// 2. Webhook GAS
console.log("\n[2/4] Webhook do Google Apps Script (SABE_SHEETS_WEBHOOK_URL)");
const url = env.SABE_SHEETS_WEBHOOK_URL;
const secret = env.SABE_WEBHOOK_SECRET;
if (!url || !secret) {
  console.log(`  ${error} Webhook não configurado — configure SABE_SHEETS_WEBHOOK_URL e SABE_WEBHOOK_SECRET.`);
} else {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "status", chave: secret }),
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
    const body = await res.json().catch(() => null);
    if (body?.versao) {
      console.log(`  ${ok} Respondeu versão: ${body.versao} (HTTP ${res.status})`);
    } else {
      console.log(`  ${error} Resposta sem versão (HTTP ${res.status}): ${JSON.stringify(body).slice(0, 150)}`);
      console.log(`     -> Se for UNAUTHORIZED: o SABE_WEBHOOK_SECRET não bate com o segredo salvo no Apps Script`);
      console.log(`     -> Se for INVALID: o Apps Script publicado é antigo — publique NOVA VERSÃO do Code.gs`);
    }
  } catch (e) {
    console.log(`  ${error} Falhou: ${e.name}: ${e.message}`);
    console.log(`     -> Confira se a URL termina em /exec e se a implantação existe.`);
  }
}

// 3. Fallback público (leitura da planilha via gviz)
console.log("\n[3/4] Fallback público da planilha (gviz CSV)");
try {
  const endpoint = new URL("https://docs.google.com/spreadsheets/d/1It6KcaRdBMxVsQsis0ZTWSAuaUy4S_mvYxmVV2fBrg8/gviz/tq");
  endpoint.searchParams.set("tqx", "out:csv");
  endpoint.searchParams.set("sheet", "CP- SABE ");
  endpoint.searchParams.set("tq", "select *");
  const res = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(25000) });
  if (res.ok) {
    const csv = await res.text();
    const linhas = csv.split("\n").filter(Boolean).length;
    console.log(`  ${ok} Respondeu HTTP ${res.status} com ${linhas} linhas`);
  } else {
    console.log(`  ${error} HTTP ${res.status} — a planilha não está pública ou o nome da aba mudou`);
  }
} catch (e) {
  console.log(`  ${error} Falhou: ${e.name}: ${e.message}`);
}

// 4. Supabase Storage
console.log("\n[4/4] Supabase Storage (upload do PDF do SM)");
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  console.log(`  ${warn} Supabase não configurado — upload SM usará base64 -> Google Drive`);
} else {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/bucket/sabe2026-documentos`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      console.log(`  ${ok} Bucket 'sabe2026-documentos' existe`);
    } else {
      const body = await res.text().catch(() => "");
      const noSuch = body.includes("Bucket not found") || body.includes("NoSuchBucket");
      if (noSuch || res.status === 404) {
        console.log(`  ${error} Bucket 'sabe2026-documentos' NÃO EXISTE — cria no painel Supabase:`);
        console.log(`     Storage -> New bucket -> name 'sabe2026-documentos' -> Public`);
      } else {
        console.log(`  ${warn} HTTP ${res.status} ao ler o bucket — chave sem permissão de leitura (normal com anon)`);
      }
    }
  } catch (e) {
    console.log(`  ${error} Falhou: ${e.name}: ${e.message}`);
  }
}

console.log("\n" + "=".repeat(64));
console.log("Fim. Em caso de falha no [2/4], confira CONFIGURACAO.md (republicar Apps Script)");
console.log("e as variáveis no painel da Vercel (Settings -> Environment Variables).");