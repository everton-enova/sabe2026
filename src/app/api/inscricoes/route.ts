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
  let payload: Submission;
  try {
    payload = (await request.json()) as Submission;
  } catch {
    return Response.json({ message: "Dados inválidos." }, { status: 400 });
  }

  const isCpValidation = payload.modalidade === "CP" && payload.acao === "validar";
  const validFlow = (payload.modalidade === "CP" && ["validar", "alterar"].includes(String(payload.acao))) || (payload.modalidade === "SM" && payload.acao === "cadastrar");
  if (!validFlow) return Response.json({ message: "Modalidade ou ação inválida." }, { status: 400 });
  const required = isCpValidation ? requiredBase : [...requiredBase, ...requiredDetails];
  if (required.some((field) => !hasText(payload, field))) {
    return Response.json({ message: "Preencha todos os campos obrigatórios." }, { status: 400 });
  }
  if (!isCpValidation) {
    const email = String(payload.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || onlyDigits(payload.telefone).length < 10 || !validCpf(payload.cpf)) {
      return Response.json({ message: "Confira o e-mail, o telefone e o CPF informados." }, { status: 400 });
    }
  }

  const webhook = process.env.SABE_SHEETS_WEBHOOK_URL;
  if (!webhook) {
    return Response.json(
      { message: "O formulário está pronto, mas a conexão de escrita com o Google Sheets ainda não foi configurada no Vercel." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, chave: process.env.SABE_WEBHOOK_SECRET, enviadoEm: new Date().toISOString() }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
    const result = (await response.json()) as { ok?: unknown; message?: unknown };
    if (result.ok !== true) throw new Error(typeof result.message === "string" ? result.message : "Webhook rejected request");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ message: "Não foi possível gravar os dados. Tente novamente em instantes." }, { status: 502 });
  }
}
