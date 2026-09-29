import { json } from "@/lib/api-security";
import { sheets } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* A leitura usa o mesmo webhook de 15s de lib/sheets.ts; nao ha mais chamada de 55s. */
export const maxDuration = 60;

const SM_SHEET_ID = "1It6KcaRdBMxVsQsis0ZTWSAuaUy4S_mvYxmVV2fBrg8";

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = "";
    } else field += character;
  }
  row.push(field); if (row.some(Boolean)) rows.push(row);
  return rows;
}
function nteNumber(value: unknown) {
  return String(Number(String(value ?? "").replace(/\D/g, "")));
}
function normalized(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
}

/* Le a aba pública SM-SABE: municipios com a coluna VALIDADO/ALTERADO FORM
   ou NOME preenchidas sao considerados ja cadastrados e ficam bloqueados
   no formulario — a menos que a coluna REVISAR DOCUMENTO esteja marcada com "SIM",
   caso em que o municipio aparece na lista substituir para trocar o oficio.
   E a leitura publica, sem depender do Apps Script. */
export async function loadValidatedSmMunicipios(nte?: string) {
  const endpoint = new URL(`https://docs.google.com/spreadsheets/d/${SM_SHEET_ID}/gviz/tq`);
  endpoint.searchParams.set("tqx", "out:csv");
  endpoint.searchParams.set("sheet", "SM-SABE");
  endpoint.searchParams.set("tq", "select *");
  const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`SM-SABE HTTP ${response.status}`);
  const rows = parseCsv(await response.text());
  const headers = rows[0] || [];
  const idxNte = Math.max(headers.findIndex(h => normalized(h) === "NTE"), 1);
  const idxMun = Math.max(headers.findIndex(h => normalized(h) === "MUNICÍPIO" || normalized(h) === "MUNICIPIO"), 2);
  const idxNome = headers.findIndex(h => normalized(h) === "NOME");
  const idxValidado = headers.findIndex(h => normalized(h) === "VALIDADO/ALTERADO FORM" || normalized(h) === "VALIDADO");
  const idxRevisar = headers.findIndex(h => normalized(h) === "REVISAR DOCUMENTO");
  const cadastrados: { nte: string; municipio: string }[] = [];
  const substituir: { nte: string; municipio: string }[] = [];
  rows.slice(1).forEach(row => {
    const nomeMun = String(row[idxMun] || "").trim();
    if (!nomeMun) return;
    const numNte = nteNumber(row[idxNte]);
    if (nte && numNte !== nteNumber(nte)) return;
    const jaCadastrado = Boolean(String(row[idxValidado] || "").trim() || String(row[idxNome] || "").trim());
    const revisar = idxRevisar >= 0 && /^sim$/i.test(String(row[idxRevisar] || "").trim());
    const municipio = normalized(row[idxMun]);
    if (jaCadastrado) {
      if (revisar) substituir.push({ nte: numNte, municipio });
      cadastrados.push({ nte: numNte, municipio });
    }
  });
  return { cadastrados, substituir };
}

/* Sem ?nte devolve todos os polos validados (pre-carregamento da pagina).
   Com ?nte filtra por NTE. Para CP usa o webhook (autenticado); para SM usa
   a leitura pública da aba SM-SABE.
   `escopo` diz o que foi pedido e `falha` sinaliza que o Apps Script nao respondeu —
   assim o cliente sabe se precisa cair no modo antigo (consulta por NTE). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nte = searchParams.get("nte");
  const escopo = nte ? "nte" : "global";
  if (searchParams.get("mode") === "sm") {
    try {
      const { cadastrados, substituir } = await loadValidatedSmMunicipios(nte ?? undefined);
      return json({ validated: cadastrados, substituir, escopo });
    } catch (error) {
      console.error("SABE validacao-status SM", error);
      return json({ validated: [], substituir: [], escopo, falha: true });
    }
  }
  if (searchParams.get("mode") !== "cp") return json({ validated: [], escopo });
  try {
    const payload: Record<string, unknown> = { tipo: "validados" };
    if (nte) payload.nte = nte;
    const result = await sheets(payload) as { validated?: unknown };
    return json({ validated: Array.isArray(result.validated) ? result.validated : [], escopo });
  } catch (error) {
    // O status e auxiliar: se a planilha nao responder, o formulario segue e o servidor
    // ainda bloqueia duplicidade. Nunca transformar isso em erro de tela.
    console.error("SABE validacao-status", error);
    return json({ validated: [], escopo, falha: true });
  }
}