import { ApiError, failure, json, readRequest } from "@/lib/api-security";
import { sheets, validateLocation } from "@/lib/sheets";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Submission = Record<string, unknown>;

const requiredBase = ["modalidade", "acao", "nte", "local"];
const requiredDetails = ["nome", "email", "telefone", "cpf", "banco", "agencia", "conta", "pix"];
// Vao para a aba oficial CP- SABE junto com os dados basicos.
const extraDetails = ["experiencia", "funcao", "tipoConta", "agenciaDigito", "contaDigito", "operacao"];
// Limite do PDF anexado no SM. Acima disso a Vercel recusa o corpo antes da rota.
const MAX_PDF_BYTES = 4 * 1024 * 1024;

type UploadedFile = { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };

function parsePdf(type: string, name: string) {
  return type === "application/pdf" || /\.pdf$/i.test(name);
}

/* O SM manda o PDF como multipart/form-data; o CP continua em JSON.
   Nos dois casos o payload final e um objeto simples. */
async function readPayload(request: Request): Promise<{ payload: Submission; arquivo: UploadedFile | null }> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim();
  if (contentType !== "multipart/form-data") return { payload: await readRequest(request), arquivo: null };
  // Corta corpos muito grandes antes de bufferizar o upload inteiro.
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_PDF_BYTES + 1024 * 1024) throw new ApiError(413, "O documento deve ter no máximo 4 MB.");
  let form: FormData;
  try { form = await request.formData(); }
  catch { throw new ApiError(400, "Não foi possível ler o formulário enviado."); }
  const payload: Submission = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") payload[key] = value;
  }
  const file = form.get("arquivo");
  const arquivo = file && typeof file === "object" && "arrayBuffer" in file && "size" in file
    ? file as unknown as UploadedFile
    : null;
  return { payload, arquivo };
}

function hasText(payload: Submission, field: string) {
  return typeof payload[field] === "string" && payload[field].trim().length > 0;
}

function onlyDigits(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function validCpf(value: unknown) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const digit = (length: number) => {
    const sum = cpf.slice(0, length).split("").reduce((total, number, index) => total + Number(number) * (length + 1 - index), 0);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export async function POST(request: Request) {
  try {
    const { payload, arquivo } = await readPayload(request);
    // Le o anexo (multipart) ou aceita base64 ja codificado no JSON (integracoes e testes).
    let arquivoNome = "";
    let arquivoTipo = "";
    let arquivoBase64 = "";
    if (arquivo) {
      if (arquivo.size > MAX_PDF_BYTES) throw new ApiError(413, "O documento deve ter no máximo 4 MB.");
      if (!parsePdf(arquivo.type, arquivo.name)) throw new ApiError(400, "O documento deve estar em formato PDF.");
      arquivoNome = arquivo.name;
      arquivoTipo = "application/pdf";
      arquivoBase64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");
    } else if (typeof payload.arquivoBase64 === "string" && payload.arquivoBase64.length > 0) {
      arquivoNome = typeof payload.arquivoNome === "string" ? payload.arquivoNome : "documento.pdf";
      arquivoTipo = typeof payload.arquivoTipo === "string" ? payload.arquivoTipo : "application/pdf";
      arquivoBase64 = payload.arquivoBase64;
      if (!parsePdf(arquivoTipo, arquivoNome)) throw new ApiError(400, "O documento deve estar em formato PDF.");
      if (Math.floor(arquivoBase64.length * 3 / 4) > MAX_PDF_BYTES) throw new ApiError(413, "O documento deve ter no máximo 4 MB.");
    }
    const cp = payload.modalidade === "CP";
    const validFlow = (cp && ["validar", "editar", "alterar"].includes(String(payload.acao))) || (payload.modalidade === "SM" && payload.acao === "cadastrar");
    if (!validFlow) throw new ApiError(400, "Modalidade ou ação inválida.");
    const remoteIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    await verifyTurnstile(payload.turnstileToken, remoteIp);
    validateLocation(payload.modalidade, payload.nte, payload.local);
    const required = cp && payload.acao === "validar" ? requiredBase
      : cp && payload.acao === "editar" ? [...requiredBase, "nome", "cpf"] : [...requiredBase, ...requiredDetails];
    if (required.some(field => !hasText(payload, field))) throw new ApiError(400, "Preencha todos os campos obrigatórios.");
    if (payload.modalidade === "SM" && !arquivoBase64) throw new ApiError(400, "Anexe o documento em PDF para concluir o cadastro.");
    if (!(cp && payload.acao === "validar")) {
      if ((hasText(payload, "email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email))) || (hasText(payload, "telefone") && ![10, 11].includes(onlyDigits(payload.telefone).length)) || !validCpf(payload.cpf)) {
        throw new ApiError(400, "Confira o e-mail, o telefone e o CPF informados.");
      }
    }
    if (cp && (!hasText(payload, "registro") || !hasText(payload, "versao"))) throw new ApiError(400, "Consulte a indicação novamente.");
    const allowed = [...requiredBase, ...requiredDetails, ...extraDetails, "registro", "versao"];
    const submission: Submission = {};
    if (cp && payload.acao === "editar") {
      if (!Array.isArray(payload.adicionais) || payload.adicionais.length > 50 || payload.adicionais.some(item =>
        !item || typeof item.campo !== "string" || item.campo.length > 200 || typeof item.valor !== "string" || item.valor.length > 1000)) {
        throw new ApiError(400, "Informações adicionais inválidas.");
      }
      submission.adicionais = payload.adicionais.map(item => ({ campo: item.campo, valor: item.valor.trim() }));
    }
    for (const field of allowed) {
      if (payload[field] !== undefined) {
        if (typeof payload[field] !== "string" || payload[field].length > 500) throw new ApiError(400, "Campo inválido ou muito longo.");
        submission[field] = payload[field].trim();
      }
    }
    // Validation uses the source record, never identity/details supplied by the browser.
    if (cp && payload.acao === "validar") for (const field of [...requiredDetails, ...extraDetails]) delete submission[field];
    // O anexo do SM nao passa pelo limite de 500 chars nem entra na lista de campos comuns.
    if (payload.modalidade === "SM") {
      submission.arquivoNome = arquivoNome.slice(0, 200);
      submission.arquivoTipo = arquivoTipo;
      submission.arquivoBase64 = arquivoBase64;
    }
    await sheets({ ...submission, enviadoEm: new Date().toISOString() });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "detail" in error) console.error("SABE inscricoes erro:", error.message, "— detalhe:", (error as { detail?: string }).detail);
    else console.error("SABE inscricoes erro:", error);
    return failure(error);
  }
}
