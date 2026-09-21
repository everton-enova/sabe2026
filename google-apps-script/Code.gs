const SPREADSHEET_ID = "1It6KcaRdBMxVsQsis0ZTWSAuaUy4S_mvYxmVV2fBrg8";
const OUTPUT_HEADERS = [
  "DATA/HORA", "MODALIDADE", "AÇÃO", "NTE", "POLO/MUNICÍPIO", "NOME",
  "E-MAIL", "TELEFONE", "CPF", "BANCO", "AGÊNCIA", "CONTA", "CHAVE PIX",
];

function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function isAuthorized(secret) {
  return secret && secret === PropertiesService.getScriptProperties().getProperty("SABE_WEBHOOK_SECRET");
}

function doGet(event) {
  if (!isAuthorized(event.parameter.chave)) return response({ ok: false, message: "Não autorizado" });
  if (event.parameter.tipo !== "indicacao") return response({ ok: false, message: "Consulta inválida" });

  const rows = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("CP- SABE ").getDataRange().getDisplayValues();
  const nte = String(event.parameter.nte || "").replace(/\D/g, "").padStart(2, "0");
  const polo = String(event.parameter.polo || "").trim().toUpperCase();
  const row = rows.slice(1).find((item) => String(item[1]).replace(/\D/g, "").padStart(2, "0") === nte && String(item[2]).trim().toUpperCase() === polo);
  return row ? response({ ok: true, nome: row[4], cpf: row[7] }) : response({ ok: false, message: "Indicação não encontrada" });
}

function doPost(event) {
  let data;
  try { data = JSON.parse(event.postData.contents); } catch (error) { return response({ ok: false, message: "JSON inválido" }); }
  if (!isAuthorized(data.chave)) return response({ ok: false, message: "Não autorizado" });

  const sheetName = data.modalidade === "CP" ? "INSCRICOES CP" : "INSCRICOES SM";
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) sheet.appendRow(OUTPUT_HEADERS);
    const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 2, sheet.getLastRow() - 1, 4).getDisplayValues() : [];
    if (existing.some((row) => row[0] === data.modalidade && row[2] === data.nte && row[3] === data.local)) {
      return response({ ok: false, message: "Este formulário já foi enviado" });
    }
    sheet.appendRow([
      data.enviadoEm, data.modalidade, data.acao, data.nte, data.local, data.nome || "",
      data.email || "", data.telefone || "", data.cpf || "", data.banco || "",
      data.agencia || "", data.conta || "", data.pix || "",
    ]);
    return response({ ok: true });
  } finally {
    lock.releaseLock();
  }
}
