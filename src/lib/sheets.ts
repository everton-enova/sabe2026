import { ApiError } from "./api-security";
import data from "@/data/sabe.json";

export function validateLocation(mode: unknown, nte: unknown, local: unknown) {
  if (typeof nte !== "string" || typeof local !== "string" ||
    !(mode === "CP" ? data.coordinators.some(item => item.nte === nte && item.polo === local)
      : mode === "SM" && data.locations.some(item => item.nte === nte && item.municipio === local))) {
    throw new ApiError(400, "Selecione um NTE e um local válidos.");
  }
}

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

async function publicIndication(nte: string, polo: string) {
  const endpoint = new URL("https://docs.google.com/spreadsheets/d/1It6KcaRdBMxVsQsis0ZTWSAuaUy4S_mvYxmVV2fBrg8/gviz/tq");
  endpoint.searchParams.set("tqx", "out:csv");
  endpoint.searchParams.set("sheet", "CP- SABE ");
  endpoint.searchParams.set("tq", "select *");
  const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new ApiError(502, "Não foi possível consultar a planilha.");
  const rows = parseCsv(await response.text());
  const headers = rows[0] || [];
  const selected = rows.slice(1).find(row => String(row[1]).replace(/\D/g, "") === nte.replace(/\D/g, "") && row[2]?.trim().toUpperCase() === polo.trim().toUpperCase());
  if (!selected) throw new ApiError(404, "Não encontramos uma indicação para este polo.");
  const value = (index: number) => selected[index] || "";
  return { coordinator: {
    registro: `public:${rows.indexOf(selected) + 1}`,
    versao: "public",
    nome: value(4), telefone: value(5), email: value(6), cpf: value(7), banco: value(10), agencia: value(11), conta: value(12), pix: "",
    adicionais: headers.map((campo, index) => ({ campo: campo.replace(/\s+/g, " ").trim(), valor: value(index) })).filter(item => item.campo && !["Subcoordenador", "NTE", "POLO", "NOME", "TELEFONE", "E-MAIL", "CPF", "BANCO", "AGENCIA", "CONTA"].includes(item.campo.toUpperCase())),
  } };
}

export async function sheets(payload: Record<string, unknown>) {
  const url = process.env.SABE_SHEETS_WEBHOOK_URL;
  const secret = process.env.SABE_WEBHOOK_SECRET;
  if (!url || !secret) {
    if (payload.tipo === "indicacao" && typeof payload.nte === "string" && typeof payload.polo === "string") return publicIndication(payload.nte, payload.polo);
    throw new ApiError(503, "Conexão com a planilha ainda não configurada.");
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, chave: secret }), cache: "no-store", signal: AbortSignal.timeout(15000),
    });
  } catch {
    if (payload.tipo === "indicacao" && typeof payload.nte === "string" && typeof payload.polo === "string") return publicIndication(payload.nte, payload.polo);
    throw new ApiError(502, "Não foi possível acessar a planilha.");
  }
  if (!response.ok) {
    if (payload.tipo === "indicacao" && typeof payload.nte === "string" && typeof payload.polo === "string") return publicIndication(payload.nte, payload.polo);
    throw new ApiError(502, "Não foi possível acessar a planilha.");
  }
  let result: Record<string, unknown>;
  try {
    result = await response.json() as Record<string, unknown>;
  } catch {
    if (payload.tipo === "indicacao" && typeof payload.nte === "string" && typeof payload.polo === "string") return publicIndication(payload.nte, payload.polo);
    throw new ApiError(502, "A planilha retornou uma resposta inválida.");
  }
  if (result.ok !== true && payload.tipo === "indicacao" && typeof payload.nte === "string" && typeof payload.polo === "string") return publicIndication(payload.nte, payload.polo);
  if (result.ok !== true) {
    const messages: Record<string, [number, string]> = {
      NOT_FOUND: [404, "Não encontramos uma indicação para este polo."],
      CONFLICT: [409, "A indicação foi atualizada. Consulte o polo novamente antes de enviar."],
      DUPLICATE: [409, "Este formulário já foi enviado."],
      INVALID: [400, "Confira os dados informados."],
    };
    const code = typeof result.code === "string" ? result.code : "";
    const [status, message] = messages[code] || [502, "Não foi possível concluir a operação na planilha."];
    throw new ApiError(status, message);
  }
  return result;
}
