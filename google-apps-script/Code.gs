const SPREADSHEET_ID = "1It6KcaRdBMxVsQsis0ZTWSAuaUy4S_mvYxmVV2fBrg8";
const CP_SHEET = "CP- SABE ";
const OUTPUT_HEADERS = [
  "DATA/HORA", "MODALIDADE", "AÇÃO", "NTE", "POLO/MUNICÍPIO", "NOME",
  "E-MAIL", "TELEFONE", "CPF", "BANCO", "AGÊNCIA", "CONTA", "CHAVE PIX",
  "REGISTRO ORIGINAL", "VERSÃO ORIGINAL", "DADOS ADICIONAIS",
];
/* Colunas da aba oficial localizadas pelo CABEÇALHO, nunca por índice fixo.
   A planilha tem, entre outras: NOME(4) TELEFONE(5) E-MAIL(6) CPF(7)
   TIPO DE CONTA(10) BANCO(11) AGENCIA(12) DÍGITO AGÊNCIA(13) CONTA(14)
   DÍGITO CONTA(15) OPERAÇÃO(16) ATUALIZADO(18) VALIDADO/ALTERADO FORM(19). */
const CP_FIELDS = {
  nte: ["NTE"],
  polo: ["POLO"],
  nome: ["NOME"],
  telefone: ["TELEFONE", "CELULAR"],
  email: ["E-MAIL", "EMAIL"],
  cpf: ["CPF"],
  tipoConta: ["TIPO DE CONTA", "TIPO CONTA"],
  banco: ["BANCO"],
  agencia: ["AGENCIA", "AGÊNCIA"],
  agenciaDigito: ["DÍGITO AGÊNCIA", "DIGITO AGENCIA", "DÍGITO DA AGÊNCIA"],
  conta: ["CONTA"],
  contaDigito: ["DÍGITO CONTA", "DIGITO CONTA", "DÍGITO DA CONTA"],
  operacao: ["OPERAÇÃO", "OPERACAO", "VARIAÇÃO/OPERAÇÃO"],
  pix: ["PIX", "CHAVE PIX"],
  atualizado: ["ATUALIZADO"],
  validado: ["VALIDADO/ALTERADO FORM", "VALIDADO", "VALIDADO/ALTERADO"],
};
const CP_DATA_FIELDS = ["nome", "telefone", "email", "cpf", "tipoConta", "banco", "agencia", "agenciaDigito", "conta", "contaDigito", "operacao"];

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
function onlyDigits(value) { return String(value || "").replace(/\D/g, ""); }
function digest(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(byte => (byte & 255).toString(16).padStart(2, "0")).join("");
}
function textCell(value) {
  const text = String(value || "");
  // Sheets interprets leading '=' as a formula; also protect CSV exports.
  return /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
}
function columnMap(headers) {
  const map = {};
  Object.keys(CP_FIELDS).forEach(field => {
    const candidates = CP_FIELDS[field].map(normalized);
    map[field] = headers.findIndex(header => candidates.includes(normalized(header)));
  });
  return map;
}
function cpSheet(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(CP_SHEET);
  if (!sheet || sheet.getLastRow() < 1) return null;
  const columns = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, columns).getDisplayValues()[0];
  return { sheet, headers, map: columnMap(headers), columns };
}
function rowMatches(row, map, nte, polo) {
  const nteColumn = map.nte >= 0 ? map.nte : 1;
  const poloColumn = map.polo >= 0 ? map.polo : 2;
  return nteNumber(row[nteColumn]) === nteNumber(nte) && normalized(row[poloColumn]) === normalized(polo);
}
function lookup(spreadsheet, nte, polo) {
  const cp = cpSheet(spreadsheet);
  if (!cp || cp.sheet.getLastRow() < 2) return null;
  const { sheet, map, columns } = cp;
  const cache = CacheService.getScriptCache();
  const key = "cp-row-v3:" + digest(nteNumber(nte) + ":" + normalized(polo));
  let rowNumber = Number(cache.get(key));
  let row = rowNumber >= 2 && rowNumber <= sheet.getLastRow() ? sheet.getRange(rowNumber, 1, 1, columns).getDisplayValues()[0] : null;
  if (!row || !rowMatches(row, map, nte, polo)) {
    // Read only the location columns to locate the selected coordinator.
    const nteColumn = map.nte >= 0 ? map.nte : 1;
    const poloColumn = map.polo >= 0 ? map.polo : 2;
    const base = Math.min(nteColumn, poloColumn);
    const span = Math.abs(nteColumn - poloColumn) + 1;
    const index = sheet.getRange(2, base + 1, sheet.getLastRow() - 1, span).getDisplayValues();
    const offset = index.findIndex(item => rowMatches(item, { nte: nteColumn - base, polo: poloColumn - base }, nte, polo));
    if (offset < 0) { cache.remove(key); return null; }
    rowNumber = offset + 2;
    row = sheet.getRange(rowNumber, 1, 1, columns).getDisplayValues()[0];
    if (!rowMatches(row, map, nte, polo)) return null;
    cache.put(key, String(rowNumber), 300);
  }
  const coordinator = { registro: String(sheet.getSheetId()) + ":" + rowNumber, versao: digest(JSON.stringify(row)), adicionais: [] };
  const used = [];
  Object.keys(map).forEach(field => {
    if (map[field] >= 0) { coordinator[field] = row[map[field]] || ""; used.push(map[field]); }
  });
  if (coordinator.pix === undefined) coordinator.pix = "";
  cp.headers.forEach((header, index) => {
    if (!used.includes(index) && header.trim()) coordinator.adicionais.push({ campo: header.trim().replace(/\s+/g, " "), valor: row[index] || "" });
  });
  return coordinator;
}
/* Grava a validacao na propria aba oficial: atualiza os dados do coordenador
   (em editar/alterar) e marca ATUALIZADO + VALIDADO/ALTERADO FORM. */
function updateCpRow(spreadsheet, current, data) {
  const cp = cpSheet(spreadsheet);
  if (!cp) return;
  const rowNumber = Number(String(current.registro).split(":")[1]);
  if (!(rowNumber >= 2)) return;
  const write = (column, value) => { if (column >= 0) cp.sheet.getRange(rowNumber, column + 1).setValue(textCell(value)); };
  if (data.acao !== "validar") {
    CP_DATA_FIELDS.forEach(field => {
      if (data[field] !== undefined) write(cp.map[field], data[field]);
    });
  }
  write(cp.map.atualizado, data.enviadoEm || new Date().toISOString());
  write(cp.map.validado, "✓");
}
function validatedPolos(spreadsheet, nte) {
  const cp = cpSheet(spreadsheet);
  if (!cp || cp.map.validado < 0 || cp.sheet.getLastRow() < 2) return [];
  const nteColumn = cp.map.nte >= 0 ? cp.map.nte : 1;
  const poloColumn = cp.map.polo >= 0 ? cp.map.polo : 2;
  const rows = cp.sheet.getRange(2, 1, cp.sheet.getLastRow() - 1, cp.columns).getDisplayValues();
  return rows
    .filter(row => nteNumber(row[nteColumn]) === nteNumber(nte) && String(row[cp.map.validado] || "").trim())
    .map(row => normalized(row[poloColumn]));
}
function validAdicionais(adicionais, current) {
  return Array.isArray(adicionais) && adicionais.length === current.length &&
    adicionais.every((item, index) => item && item.campo === current[index].campo && typeof item.valor === "string" && item.valor.length <= 1000);
}
function doGet() { return response({ ok: false, code: "UNAUTHORIZED" }); }
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
      if (String(current.validado || "").trim()) return response({ ok: false, code: "DUPLICATE" });
      if (data.acao === "validar") {
        CP_DATA_FIELDS.forEach(field => { data[field] = current[field] || ""; });
        data.pix = current.pix || "";
      }
      if (data.acao === "alterar" && onlyDigits(data.cpf) === onlyDigits(current.cpf)) return response({ ok: false, code: "INVALID" });
      if (data.acao === "editar" && !validAdicionais(data.adicionais, current.adicionais)) return response({ ok: false, code: "INVALID" });
      // Unica fonte da validacao de CP: a propria aba oficial. INSCRICOES CP nao e mais usada.
      updateCpRow(spreadsheet, current, data);
      return response({ ok: true });
    }
    const sheet = spreadsheet.getSheetByName("INSCRICOES SM") || spreadsheet.insertSheet("INSCRICOES SM");
    if (sheet.getLastRow() === 0) sheet.appendRow(OUTPUT_HEADERS);
    else sheet.getRange(1, 14, 1, 3).setValues([OUTPUT_HEADERS.slice(13)]);
    const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 2, sheet.getLastRow() - 1, 4).getDisplayValues() : [];
    if (existing.some(row => row[0] === data.modalidade && nteNumber(row[2]) === nteNumber(data.nte) && normalized(row[3]) === normalized(data.local))) return response({ ok: false, code: "DUPLICATE" });
    const values = [data.enviadoEm, data.modalidade, data.acao, data.nte, data.local, data.nome,
      data.email, data.telefone, data.cpf, data.banco, data.agencia, data.conta, data.pix,
      data.registro, data.versao, JSON.stringify([])].map(textCell);
    sheet.appendRow(values);
    return response({ ok: true });
  } finally { lock.releaseLock(); }
}
