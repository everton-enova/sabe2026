import { ApiError, failure, json, readRequest } from "@/lib/api-security";
import { sheets, validateLocation } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Submission = Record<string, unknown>;

const requiredBase = ["modalidade", "acao", "nte", "local"];
const requiredDetails = ["nome", "email", "telefone", "cpf", "banco", "agencia", "conta", "pix"];

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
    const payload = await readRequest(request);
    const cp = payload.modalidade === "CP";
    const validFlow = (cp && ["validar", "editar", "alterar"].includes(String(payload.acao))) || (payload.modalidade === "SM" && payload.acao === "cadastrar");
    if (!validFlow) throw new ApiError(400, "Modalidade ou ação inválida.");
    validateLocation(payload.modalidade, payload.nte, payload.local);
    const required = cp && payload.acao === "validar" ? requiredBase
      : cp && payload.acao === "editar" ? [...requiredBase, "nome", "cpf"] : [...requiredBase, ...requiredDetails];
    if (required.some(field => !hasText(payload, field))) throw new ApiError(400, "Preencha todos os campos obrigatórios.");
    if (!(cp && payload.acao === "validar")) {
      if ((hasText(payload, "email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email))) || (hasText(payload, "telefone") && ![10, 11].includes(onlyDigits(payload.telefone).length)) || !validCpf(payload.cpf)) {
        throw new ApiError(400, "Confira o e-mail, o telefone e o CPF informados.");
      }
    }
    if (cp && (!hasText(payload, "registro") || !hasText(payload, "versao"))) throw new ApiError(400, "Consulte a indicação novamente.");
    const allowed = [...requiredBase, ...requiredDetails, "registro", "versao"];
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
    if (cp && payload.acao === "validar") for (const field of requiredDetails) delete submission[field];
    await sheets({ ...submission, enviadoEm: new Date().toISOString() });
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
