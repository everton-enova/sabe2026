import { ApiError } from "./api-security";
import data from "@/data/sabe.json";

export function validateLocation(mode: unknown, nte: unknown, local: unknown) {
  if (typeof nte !== "string" || typeof local !== "string" ||
    !(mode === "CP" ? data.coordinators.some(item => item.nte === nte && item.polo === local)
      : mode === "SM" && data.locations.some(item => item.nte === nte && item.municipio === local))) {
    throw new ApiError(400, "Selecione um NTE e um local válidos.");
  }
}

/* A planilha grava o NTE como "1" e o formulario envia "NTE 01": comparar so os digitos
   ("1" contra "01") reprovava todos os NTE de 01 a 09. Number() descarta o zero a esquerda.
   O polo tambem vem com acentuacao e espacos proprios de quem digitou. Sao as mesmas duas
   funcoes do Apps Script (nteNumber e normalized), de proposito: quando o webhook responde,
   e ele quem casa; quando cai na leitura publica, o criterio precisa ser identico. */
/* Sem instanceof: o erro do fetch pode vir de outro realm (o vm dos testes, por exemplo),
   e ali instanceof Error reprova um Error legitimo e a causa se perderia. */
function nomeDoErro(error: unknown) {
  const nome = (error as { name?: unknown } | null)?.name;
  return typeof nome === "string" && nome ? nome : "erro desconhecido";
}
function nteNumber(value: unknown) {
  return String(Number(String(value ?? "").replace(/\D/g, "")));
}
function normalized(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
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

/* Sem instanceof: o erro do fetch (timeout/rede) não é ApiError e escapava como o 502 genérico
   "Não foi possível consultar os dados deste polo." — a causa ficava escondida e o usuário via
   uma mensagem sem saída. Aqui todo caminho de erro vira ApiError com a causa real. */
async function publicIndication(nte: string, polo: string) {
  const endpoint = new URL("https://docs.google.com/spreadsheets/d/1It6KcaRdBMxVsQsis0ZTWSAuaUy4S_mvYxmVV2fBrg8/gviz/tq");
  endpoint.searchParams.set("tqx", "out:csv");
  endpoint.searchParams.set("sheet", "CP- SABE ");
  endpoint.searchParams.set("tq", "select *");
  // O gviz do Google pode demorar sob carga; uma segunda tentativa cobre picos momentâneos.
  let response: Response | null = null;
  let lastError: unknown = null;
  for (let tentativa = 0; tentativa < 2 && !response; tentativa += 1) {
    try {
      response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(25000) });
    } catch (error) {
      lastError = error;
      if (tentativa === 0) await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
  if (!response) throw new ApiError(504, "A planilha de consulta está fora do ar no momento. Aguarde alguns segundos e tente novamente.", `a leitura pública da planilha não respondeu (${nomeDoErro(lastError)}). O webhook também falhou antes — confira SABE_SHEETS_WEBHOOK_URL e SABE_WEBHOOK_SECRET no Vercel.`);
  if (!response.ok) throw new ApiError(502, "Não foi possível consultar a planilha de consulta.", `a leitura pública respondeu HTTP ${response.status}`);
  const csv = await response.text().catch((error: unknown) => {
    throw new ApiError(502, "Não foi possível consultar a planilha de consulta.", `a resposta pública chegou truncada (${nomeDoErro(error)})`);
  });
  const rows = parseCsv(csv);
  const headers = rows[0] || [];
  const selected = rows.slice(1).find(row => nteNumber(row[1]) === nteNumber(nte) && normalized(row[2]) === normalized(polo));
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
      body: JSON.stringify({ ...payload, chave: secret }), cache: "no-store",
      // Sem base64 (Supabase Storage) o Apps Script so grava na planilha: 15s.
      // Com base64 fallback (Drive) precisa de mais tempo: 55s.
      signal: AbortSignal.timeout(
        (typeof payload.arquivoBase64 === "string" && payload.arquivoBase64) ? 55000 : 15000
      ),
    });
  } catch (error) {
    if (payload.tipo === "indicacao" && typeof payload.nte === "string" && typeof payload.polo === "string") return publicIndication(payload.nte, payload.polo);
    throw new ApiError(502, "Não foi possível acessar a planilha.", `a requisição ao Apps Script falhou (${nomeDoErro(error)}): confira se SABE_SHEETS_WEBHOOK_URL termina em /exec`);
  }
  // Webhook frio pode passar de 15s: ao invés de abortar e cair no fallback cego, dá uma segunda chance.
  if (payload.tipo !== "indicacao" && !response.ok && (response.status === 404 || response.status === 405)) {
    try {
      response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, chave: secret }), cache: "no-store",
        signal: AbortSignal.timeout(
          (typeof payload.arquivoBase64 === "string" && payload.arquivoBase64) ? 55000 : 15000
        ),
      });
    } catch { /* mantém a primeira resposta; o tratamento abaixo decide */ }
  }
  if (!response.ok) {
    if (payload.tipo === "indicacao" && typeof payload.nte === "string" && typeof payload.polo === "string") return publicIndication(payload.nte, payload.polo);
    throw new ApiError(502, "Não foi possível acessar a planilha.", `o Apps Script respondeu HTTP ${response.status}: 401/403 = implantação sem acesso "Qualquer pessoa"; 404 = URL /exec de implantação removida`);
  }
  let result: Record<string, unknown>;
  try {
    result = await response.json() as Record<string, unknown>;
  } catch {
    if (payload.tipo === "indicacao" && typeof payload.nte === "string" && typeof payload.polo === "string") return publicIndication(payload.nte, payload.polo);
    throw new ApiError(502, "A planilha retornou uma resposta inválida.");
  }
  // ok:true sem coordinator chegava ao route como json(undefined), que estoura e vira o 502
  // generico "Nao foi possivel consultar os dados deste polo" — um crash disfarcado de erro.
  const indicacaoSemRegistro = payload.tipo === "indicacao" && (result.ok !== true || !result.coordinator);
  if (indicacaoSemRegistro && typeof payload.nte === "string" && typeof payload.polo === "string") return publicIndication(payload.nte, payload.polo);
  if (result.ok !== true) {
    const messages: Record<string, [number, string]> = {
      NOT_FOUND: [404, "Não encontramos uma indicação para este polo."],
      CONFLICT: [409, "A indicação foi atualizada. Consulte o polo novamente antes de enviar."],
      DUPLICATE: [409, "Este formulário já foi enviado."],
      INVALID: [400, "Confira os dados informados."],
      UPLOAD_FAILED: [502, "Não foi possível salvar o documento no Google Drive. Tente novamente."],
      BUSY: [503, "A planilha está ocupada. Aguarde alguns segundos e tente novamente."],
      INTERNAL: [502, "Não foi possível concluir a operação na planilha."],
    };
    const code = typeof result.code === "string" ? result.code : "";
    const [status, message] = messages[code] || [502, "Não foi possível concluir a operação na planilha."];
    throw new ApiError(status, message);
  }
  return result;
}
