export async function GET(request: Request) {
  const url = new URL(request.url);
  const nte = url.searchParams.get("nte");
  const polo = url.searchParams.get("polo");

  if (!nte || !polo) {
    return Response.json({ message: "Informe o NTE e o polo." }, { status: 400 });
  }

  const webhook = process.env.SABE_SHEETS_WEBHOOK_URL;
  if (!webhook) {
    return Response.json(
      { message: "A consulta das indicações será liberada quando a conexão com o Google Sheets for configurada." },
      { status: 503 },
    );
  }

  try {
    const endpoint = new URL(webhook);
    endpoint.searchParams.set("tipo", "indicacao");
    endpoint.searchParams.set("nte", nte);
    endpoint.searchParams.set("polo", polo);
    if (process.env.SABE_WEBHOOK_SECRET) endpoint.searchParams.set("chave", process.env.SABE_WEBHOOK_SECRET);
    const response = await fetch(endpoint, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
    const indication = (await response.json()) as { ok?: unknown; nome?: unknown; cpf?: unknown };
    if (indication.ok === false) throw new Error("Webhook rejected request");
    if (typeof indication.nome !== "string" || typeof indication.cpf !== "string") throw new Error("Invalid payload");
    return Response.json(
      { nome: indication.nome, cpf: indication.cpf },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    return Response.json({ message: "Não foi possível consultar a indicação deste polo." }, { status: 502 });
  }
}
