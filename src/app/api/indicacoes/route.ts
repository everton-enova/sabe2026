const SPREADSHEET_ID = "1It6KcaRdBMxVsQsis0ZTWSAuaUy4S_mvYxmVV2fBrg8";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

async function lookupPublicSheet(nte: string, polo: string) {
  const endpoint = new URL(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`);
  endpoint.searchParams.set("tqx", "out:csv");
  endpoint.searchParams.set("sheet", "CP- SABE ");
  endpoint.searchParams.set("tq", "select B,C,E,H");

  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`);
  const rows = parseCsv(await response.text());
  const nteNumber = String(Number(nte.replace(/\D/g, "")));
  const selected = rows.slice(1).find((row) => String(Number(row[0].replace(/\D/g, ""))) === nteNumber && normalize(row[1]) === normalize(polo));
  if (!selected?.[2] || !selected?.[3]) return undefined;
  return { nome: selected[2], cpf: selected[3] };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const nte = url.searchParams.get("nte");
  const polo = url.searchParams.get("polo");

  if (!nte || !polo) {
    return Response.json({ message: "Informe o NTE e o polo." }, { status: 400 });
  }

  const webhook = process.env.SABE_SHEETS_WEBHOOK_URL;
  try {
    let indication: { nome: string; cpf: string } | undefined;
    if (webhook) {
      try {
        const endpoint = new URL(webhook);
        endpoint.searchParams.set("tipo", "indicacao");
        endpoint.searchParams.set("nte", nte);
        endpoint.searchParams.set("polo", polo);
        if (process.env.SABE_WEBHOOK_SECRET) endpoint.searchParams.set("chave", process.env.SABE_WEBHOOK_SECRET);
        const response = await fetch(endpoint, { cache: "no-store" });
        if (response.ok) {
          const result = (await response.json()) as { ok?: unknown; nome?: unknown; cpf?: unknown };
          if (result.ok !== false && typeof result.nome === "string" && typeof result.cpf === "string") {
            indication = { nome: result.nome, cpf: result.cpf };
          }
        }
      } catch {
        // A leitura pública e limitada abaixo mantém a consulta disponível.
      }
    }

    indication ??= await lookupPublicSheet(nte, polo);
    if (!indication) return Response.json({ message: "Não encontramos uma indicação para este polo." }, { status: 404 });
    return Response.json(
      { nome: indication.nome, cpf: indication.cpf },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    return Response.json({ message: "Não foi possível consultar a indicação deste polo." }, { status: 502 });
  }
}
