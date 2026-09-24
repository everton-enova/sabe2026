const SPREADSHEET_ID = "1It6KcaRdBMxVsQsis0ZTWSAuaUy4S_mvYxmVV2fBrg8";
const OUTPUT_HEADERS = [
  "DATA/HORA", "MODALIDADE", "AÇÃO", "NTE", "POLO/MUNICÍPIO", "NOME",
  "E-MAIL", "TELEFONE", "CPF", "BANCO", "AGÊNCIA", "CONTA", "CHAVE PIX",
  "REGISTRO ORIGINAL", "VERSÃO ORIGINAL", "DADOS ADICIONAIS",
];
function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function isAuthorized(secret) {
  return typeof secret === "string" && secret.length > 0 && secret === PropertiesService.getScriptProperties().getProperty("SABE_WEBHOOK_SECRET");
}
function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
}
function nteNumber(value) { return String(Number(String(value || "").replace(/\D/g, ""))); }
function digest(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(byte => (byte & 255).toString(16).padStart(2, "0")).join("");
}
function lookup(spreadsheet, nte, polo) {
  const sheet = spreadsheet.getSheetByName("CP- SABE ");
  if (!sheet || sheet.getLastRow() < 2) return null;
  const matches = row => nteNumber(row[1]) === nteNumber(nte) && normalized(row[2]) === normalized(polo);
  const cache = CacheService.getScriptCache();
  const key = "cp-row-v2:" + digest(nteNumber(nte) + ":" + normalized(polo));
  let rowNumber = Number(cache.get(key));
  const columns = sheet.getLastColumn();
  let row = rowNumber >= 2 && rowNumber <= sheet.getLastRow() ? sheet.getRange(rowNumber, 1, 1, columns).getDisplayValues()[0] : null;
  if (!row || !matches(row)) {
    // Read only the two location columns to locate the selected coordinator.
    const index = sheet.getRange(2, 2, sheet.getLastRow() - 1, 2).getDisplayValues();
    const offset = index.findIndex(item => nteNumber(item[0]) === nteNumber(nte) && normalized(item[1]) === normalized(polo));
    if (offset < 0) { cache.remove(key); return null; }
    rowNumber = offset + 2;
    row = sheet.getRange(rowNumber, 1, 1, columns).getDisplayValues()[0];
    if (!matches(row)) return null;
    cache.put(key, String(rowNumber), 300);
  }
  const headers = sheet.getRange(1, 1, 1, columns).getDisplayValues()[0];
  const baseColumns = { nome: 4, telefone: 5, email: 6, cpf: 7, banco: 10, agencia: 11, conta: 12 };
  const coordinator = { registro: String(sheet.getSheetId()) + ":" + rowNumber, versao: digest(JSON.stringify(row)), pix: "", adicionais: [] };
  Object.keys(baseColumns).forEach(field => coordinator[field] = row[baseColumns[field]] || "");
  const pixColumn = headers.findIndex(header => ["PIX", "CHAVE PIX"].includes(normalized(header)));
  if (pixColumn >= 0) coordinator.pix = row[pixColumn] || "";
  const used = [1, 2].concat(Object.keys(baseColumns).map(field => baseColumns[field]));
  if (pixColumn >= 0) used.push(pixColumn);
  headers.forEach((header, index) => {
    if (!used.includes(index) && header.trim()) coordinator.adicionais.push({ campo: header.trim().replace(/\s+/g, " "), valor: row[index] || "" });
  });
  return coordinator;
}
function validatedPolos(spreadsheet, nte) {
  const sheet = spreadsheet.getSheetByName("INSCRICOES CP");
  if (!sheet || sheet.getLastRow() < 2) return [];
  // Colunas 4 (NTE) e 5 (POLO/MUNICIPIO) da aba de saida.
  const rows = sheet.getRange(2, 4, sheet.getLastRow() - 1, 2).getDisplayValues();
  return rows.filter(row => nteNumber(row[0]) === nteNumber(nte)).map(row => normalized(row[1]));
}
function doGet() { return response({ ok: false, code: "UNAUTHORIZED" }); }
function textCell(value) {
  const text = String(value || "");
  // Sheets interprets leading '=' as a formula; also protect CSV exports.
  return /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
}
function doPost(event) {
  let data;
  try {
    if (!event.postData || event.postData.contents.length > 20000) return response({ ok: false, code: "INVALID" });
    data = JSON.parse(event.postData.contents);
  } catch (error) { return response({ ok: false, code: "INVALID" }); }
  if (!data || !isAuthorized(data.chave)) return response({ ok: false, code: "UNAUTHORIZED" });
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (data.tipo === "indicacao") {
    const coordinator = lookup(spreadsheet, data.nte, data.polo);
    return coordinator ? response({ ok: true, coordinator }) : response({ ok: false, code: "NOT_FOUND" });
  }
  if (data.tipo === "validados") {
    if (!data.nte) return response({ ok: false, code: "INVALID" });
    return response({ ok: true, validated: validatedPolos(spreadsheet, data.nte) });
  }
  const cp = data.modalidade === "CP";
  if (!(cp && ["validar", "editar", "alterar"].includes(data.acao)) && !(data.modalidade === "SM" && data.acao === "cadastrar")) return response({ ok: false, code: "INVALID" });
  if (!data.nte || !data.local) return response({ ok: false, code: "INVALID" });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return response({ ok: false, code: "BUSY" });
  try {
    let current;
    if (cp) {
      current = lookup(spreadsheet, data.nte, data.local);
      if (!current || current.registro !== data.registro || current.versao !== data.versao) return response({ ok: false, code: "CONFLICT" });
      if (data.acao === "validar") {
        ["nome", "email", "telefone", "cpf", "banco", "agencia", "conta", "pix"].forEach(field => data[field] = current[field]);
      }
      if (data.acao === "alterar" && String(data.cpf).replace(/\D/g, "") === current.cpf.replace(/\D/g, "")) return response({ ok: false, code: "INVALID" });
      if (data.acao === "editar" && (!Array.isArray(data.adicionais) || data.adicionais.length !== current.adicionais.length || data.adicionais.some((item, index) => !item || item.campo !== current.adicionais[index].campo || typeof item.valor !== "string" || item.valor.length > 1000))) return response({ ok: false, code: "INVALID" });
    }
    const sheetName = cp ? "INSCRICOES CP" : "INSCRICOES SM";
    const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) sheet.appendRow(OUTPUT_HEADERS);
    else sheet.getRange(1, 14, 1, 3).setValues([OUTPUT_HEADERS.slice(13)]);
    const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 2, sheet.getLastRow() - 1, 4).getDisplayValues() : [];
    if (existing.some(row => row[0] === data.modalidade && nteNumber(row[2]) === nteNumber(data.nte) && normalized(row[3]) === normalized(data.local))) return response({ ok: false, code: "DUPLICATE" });
    const values = [data.enviadoEm, data.modalidade, data.acao, data.nte, data.local, data.nome,
      data.email, data.telefone, data.cpf, data.banco, data.agencia, data.conta, data.pix,
      data.registro, data.versao, JSON.stringify(data.acao === "editar" ? data.adicionais : data.acao === "validar" ? current.adicionais : [])].map(textCell);
    sheet.appendRow(values);
    return response({ ok: true });
  } finally { lock.releaseLock(); }
}
