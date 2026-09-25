const SPREADSHEET_ID = "1It6KcaRdBMxVsQsis0ZTWSAuaUy4S_mvYxmVV2fBrg8";
/* Muda a cada publicacao relevante. Serve para confirmar, pela web, qual codigo esta no ar. */
const CODE_VERSION = "2026-09-25-upload-sm";
const MIGRACAO_FLAG = "MIGRACAO_INSCRICOES_CP";
const CP_SHEET = "CP- SABE ";
/* Colunas da aba oficial localizadas pelo CABEÇALHO, nunca por índice fixo.
   A planilha tem, entre outras: NOME(4) TELEFONE(5) E-MAIL(6) CPF(7)
   TIPO DE CONTA(10) BANCO(11) AGENCIA(12) DÍGITO AGÊNCIA(13) CONTA(14)
   DÍGITO CONTA(15) OPERAÇÃO(16) ATUALIZADO(18) VALIDADO/ALTERADO FORM(19). */
const CP_FIELDS = {
  nte: ["NTE"],
  polo: ["POLO"],
  experiencia: ["TEM EXPERIÊNCIA EM AVALIAÇÃO SIM/NÃO", "TEM EXPERIENCIA EM AVALIACAO SIM/NAO", "EXPERIÊNCIA EM AVALIAÇÃO", "EXPERIENCIA", "TEM EXPERIÊNCIA"],
  funcao: ["FUNÇÃO QUE JÁ EXERCEU", "FUNCAO QUE JA EXERCEU", "FUNÇÃO", "FUNCAO"],
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
const CP_DATA_FIELDS = ["nome", "telefone", "email", "cpf", "experiencia", "funcao", "tipoConta", "banco", "agencia", "agenciaDigito", "conta", "contaDigito", "operacao"];
const SM_SHEET = "SM-SABE";
const SM_FIELDS = {
  nte: ["NTE"],
  municipio: ["MUNICÍPIO", "MUNICIPIO"],
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
  pix: ["CHAVE PIX", "PIX"],
  documento: ["DOCUMENTO", "LINK DO DOCUMENTO", "ARQUIVO", "OFÍCIO", "OFICIO", "ANEXO"],
  atualizado: ["ATUALIZADO"],
  validado: ["VALIDADO/ALTERADO FORM", "VALIDADO", "VALIDADO/ALTERADO"],
};
const SM_DATA_FIELDS = ["nome", "telefone", "email", "cpf", "tipoConta", "banco", "agencia", "agenciaDigito", "conta", "contaDigito", "operacao", "pix", "documento"];

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
function columnMap(headers, fields) {
  const map = {};
  Object.keys(fields).forEach(field => {
    const candidates = fields[field].map(normalized);
    map[field] = headers.findIndex(header => candidates.includes(normalized(header)));
  });
  return map;
}
function sheetInfo(spreadsheet, name, fields) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 1) return null;
  const columns = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, columns).getDisplayValues()[0];
  return { sheet, headers, map: columnMap(headers, fields), columns };
}
function cpSheet(spreadsheet) { return sheetInfo(spreadsheet, CP_SHEET, CP_FIELDS); }
function smSheet(spreadsheet) { return sheetInfo(spreadsheet, SM_SHEET, SM_FIELDS); }
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
function writeValidatedRow(info, rowNumber, data, dataFields) {
  const write = (column, value) => { if (column >= 0) info.sheet.getRange(rowNumber, column + 1).setValue(textCell(value)); };
  dataFields.forEach(field => { if (data[field] !== undefined) write(info.map[field], data[field]); });
  write(info.map.atualizado, data.enviadoEm || new Date().toISOString());
  write(info.map.validado, "✓");
}
/* Grava a validacao na propria aba oficial: atualiza os dados do coordenador
   (em editar/alterar) e marca ATUALIZADO + VALIDADO/ALTERADO FORM. */
function updateCpRow(spreadsheet, current, data) {
  const cp = cpSheet(spreadsheet);
  if (!cp) return;
  const rowNumber = Number(String(current.registro).split(":")[1]);
  if (!(rowNumber >= 2)) return;
  writeValidatedRow(cp, rowNumber, data, data.acao === "validar" ? [] : CP_DATA_FIELDS);
}
/* SM: encontra a linha pelo NTE + MUNICÍPIO e grava os dados do supervisor. */
function updateSmRow(spreadsheet, sm, rowNumber, data) {
  writeValidatedRow(sm, rowNumber, data, SM_DATA_FIELDS);
}
/* SM: grava o oficio/e-mail em PDF na pasta Drive do municipio.
   A pasta raiz vem da propriedade SABE_DRIVE_FOLDER_ID; sem ela, cria/usa
   "SABE 2026 - Documentos SM" na raiz do Drive de quem executa o script. */
function pastaMunicipio(nome) {
  const props = PropertiesService.getScriptProperties();
  const parentId = props.getProperty("SABE_DRIVE_FOLDER_ID");
  let parent;
  if (parentId) {
    parent = DriveApp.getFolderById(parentId);
  } else {
    const nomeRaiz = "SABE 2026 - Documentos SM";
    const existentes = DriveApp.getFoldersByName(nomeRaiz);
    parent = existentes.hasNext() ? existentes.next() : DriveApp.createFolder(nomeRaiz);
  }
  const nomePasta = String(nome || "SEM MUNICIPIO").replace(/[\\/:*?"<>|]/g, "-").trim().toUpperCase();
  const pastas = parent.getFoldersByName(nomePasta);
  return pastas.hasNext() ? pastas.next() : parent.createFolder(nomePasta);
}
function salvarDocumentoSm(data) {
  if (!data.arquivoBase64 || !data.arquivoNome) return { falha: true, motivo: "arquivoBase64 ou arquivoNome ausente" };
  const nome = String(data.arquivoNome).replace(/[\\/:*?"<>|]/g, "-");
  let bytes;
  try { bytes = Utilities.base64Decode(data.arquivoBase64); }
  catch (e) { return { falha: true, motivo: "base64 inválido: " + e.message }; }
  const blob = Utilities.newBlob(bytes, data.arquivoTipo || "application/pdf", nome);
  let pasta;
  try { pasta = pastaMunicipio(data.local); }
  catch (e) { return { falha: true, motivo: "pasta do município: " + e.message }; }
  let file;
  try { file = pasta.createFile(blob); }
  catch (e) { return { falha: true, motivo: "createFile: " + e.message }; }
  return { url: file.getUrl(), id: file.getId(), nome: file.getName() };
}
function validatedPolos(spreadsheet, nte) {
  const cp = cpSheet(spreadsheet);
  if (!cp || cp.map.validado < 0 || cp.sheet.getLastRow() < 2) return [];
  const nteColumn = cp.map.nte >= 0 ? cp.map.nte : 1;
  const poloColumn = cp.map.polo >= 0 ? cp.map.polo : 2;
  const rows = cp.sheet.getRange(2, 1, cp.sheet.getLastRow() - 1, cp.columns).getDisplayValues();
  return rows
    .filter(row => String(row[cp.map.validado] || "").trim() && (!nte || nteNumber(row[nteColumn]) === nteNumber(nte)))
    .map(row => ({ nte: nteNumber(row[nteColumn]), polo: normalized(row[poloColumn]) }));
}
function validAdicionais(adicionais, current) {
  return Array.isArray(adicionais) && adicionais.length === current.length &&
    adicionais.every((item, index) => item && item.campo === current[index].campo && typeof item.valor === "string" && item.valor.length <= 1000);
}
function splitDigito(value) {
  const parts = String(value || "").split(/[-–]/);
  if (parts.length === 2) return { principal: parts[0].trim(), digito: parts[1].trim() };
  return { principal: String(value || "").trim(), digito: "" };
}
/* Aplica o historico da aba antiga INSCRICOES CP na CP- SABE.
   Roda sozinha UMA VEZ (na primeira chamada apos publicar esta versao) e tambem pode
   ser executada à mão no editor. Para repetir, apague a propriedade MIGRACAO_INSCRICOES_CP
   nas Propriedades do script. Em lote (1 leitura + poucas escritas), sem tocar nas
   colunas que nao fazem parte da validacao. */
function migrarInscricoesParaCpSabe(spreadsheet, force) {
  spreadsheet = spreadsheet || SpreadsheetApp.openById(SPREADSHEET_ID);
  const props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty(MIGRACAO_FLAG) === "ok") return { skipped: true };
  const legacy = spreadsheet.getSheetByName("INSCRICOES CP");
  if (!legacy || legacy.getLastRow() < 2) { props.setProperty(MIGRACAO_FLAG, "ok"); return { migrados: 0 }; }
  const lock = LockService.getScriptLock();
  // Espera curta: se outra requisicao ja estiver migrando, apenas sai e tenta depois.
  if (!lock.tryLock(5000)) return { skipped: true };
  try {
    const cp = cpSheet(spreadsheet);
    if (!cp || cp.sheet.getLastRow() < 2) { props.setProperty(MIGRACAO_FLAG, "ok"); return { migrados: 0 }; }
    const lHeaders = legacy.getRange(1, 1, 1, legacy.getLastColumn()).getDisplayValues()[0];
    const at = (row, name, fallback) => {
      const index = lHeaders.findIndex(header => normalized(header) === normalized(name));
      return row[index >= 0 ? index : fallback] || "";
    };
    const registros = legacy.getRange(2, 1, legacy.getLastRow() - 1, legacy.getLastColumn()).getDisplayValues();
    const all = cp.sheet.getRange(1, 1, cp.sheet.getLastRow(), cp.columns).getDisplayValues();
    const nteColumn = cp.map.nte >= 0 ? cp.map.nte : 1;
    const poloColumn = cp.map.polo >= 0 ? cp.map.polo : 2;
    const rowNumberFor = (nte, local) => {
      for (let index = 1; index < all.length; index += 1) {
        if (nteNumber(all[index][nteColumn]) === nteNumber(nte) && normalized(all[index][poloColumn]) === normalized(local)) return index + 1;
      }
      return 0;
    };
    const plan = new Map();
    let migrados = 0;
    registros.forEach(row => {
      const nte = at(row, "NTE", 3);
      const local = at(row, "POLO/MUNICÍPIO", 4);
      if (!nte || !local) return;
      const rowNumber = rowNumberFor(nte, local);
      if (!rowNumber) return;
      const acao = normalized(at(row, "AÇÃO", 2)).toLowerCase();
      const changes = plan.get(rowNumber) || {};
      if (acao !== "validar") {
        changes.nome = at(row, "NOME", 5);
        changes.email = at(row, "E-MAIL", 6);
        changes.telefone = at(row, "TELEFONE", 7);
        changes.cpf = at(row, "CPF", 8);
        changes.banco = at(row, "BANCO", 9);
        const agencia = splitDigito(at(row, "AGÊNCIA", 10));
        changes.agencia = agencia.principal;
        if (agencia.digito) changes.agenciaDigito = agencia.digito;
        const conta = splitDigito(at(row, "CONTA", 11));
        changes.conta = conta.principal;
        if (conta.digito) changes.contaDigito = conta.digito;
        changes.pix = at(row, "CHAVE PIX", 12);
      }
      changes.atualizado = at(row, "DATA/HORA", 0) || new Date().toISOString();
      changes.validado = "✓";
      plan.set(rowNumber, changes);
      migrados += 1;
    });
    plan.forEach((changes, rowNumber) => {
      const target = all[rowNumber - 1];
      if (!target) return;
      Object.keys(changes).forEach(field => {
        const column = cp.map[field];
        if (column >= 0) target[column] = textCell(changes[field]);
      });
    });
    const fields = new Set();
    plan.forEach(changes => Object.keys(changes).forEach(field => fields.add(field)));
    fields.forEach(field => {
      const column = cp.map[field];
      if (column < 0 || all.length < 2) return;
      cp.sheet.getRange(2, column + 1, all.length - 1, 1).setValues(all.slice(1).map(row => [row[column]]));
    });
    props.setProperty(MIGRACAO_FLAG, "ok");
    return { migrados };
  } finally { lock.releaseLock(); }
}
function doGet() { return response({ ok: false, code: "UNAUTHORIZED" }); }
/* Rode esta função UMA VEZ no editor do Apps Script (menu Executar) para apagar
   as abas de saída antigas. Não é chamada automaticamente. */
function removerAbasSaida() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  ["INSCRICOES CP", "INSCRICOES SM"].forEach(name => {
    const sheet = spreadsheet.getSheetByName(name);
    if (sheet) spreadsheet.deleteSheet(sheet);
  });
}
/* Use no editor para FORÇAR a migração da INSCRICOES CP para a CP- SABE de novo. */
function migrarAgora() {
  return migrarInscricoesParaCpSabe(SpreadsheetApp.openById(SPREADSHEET_ID), true);
}
function doPost(event) {
  let data;
  try {
    if (!event.postData || event.postData.contents.length > 15000000) return response({ ok: false, code: "INVALID" });
    data = JSON.parse(event.postData.contents);
  } catch (error) { return response({ ok: false, code: "INVALID" }); }
  if (!data || !isAuthorized(data.chave)) return response({ ok: false, code: "UNAUTHORIZED" });
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (data.tipo === "migrar") return response({ ok: true, ...migrarInscricoesParaCpSabe(spreadsheet, true) });
  // Aplica o historico da aba antiga na CP- SABE (roda só uma vez, ver flag).
  const migracao = migrarInscricoesParaCpSabe(spreadsheet);
  if (data.tipo === "status") return response({ ok: true, versao: CODE_VERSION, validadosGlobal: true, migracao });
  if (data.tipo === "indicacao") {
    const coordinator = lookup(spreadsheet, data.nte, data.polo);
    return coordinator ? response({ ok: true, coordinator }) : response({ ok: false, code: "NOT_FOUND" });
  }
  if (data.tipo === "status") return response({ ok: true, versao: CODE_VERSION });
  if (data.tipo === "validados") {
    return response({ ok: true, versao: CODE_VERSION, validated: validatedPolos(spreadsheet, data.nte) });
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
    // SM: grava na aba oficial SM-SABE, na linha do NTE + município.
    const sm = smSheet(spreadsheet);
    if (!sm || sm.sheet.getLastRow() < 2) return response({ ok: false, code: "NOT_FOUND" });
    const nteColumn = sm.map.nte >= 0 ? sm.map.nte : 1;
    const municipioColumn = sm.map.municipio >= 0 ? sm.map.municipio : 2;
    const rows = sm.sheet.getRange(2, 1, sm.sheet.getLastRow() - 1, sm.columns).getDisplayValues();
    const offset = rows.findIndex(row => nteNumber(row[nteColumn]) === nteNumber(data.nte) && normalized(row[municipioColumn]) === normalized(data.local));
    if (offset < 0) return response({ ok: false, code: "NOT_FOUND" });
    if (sm.map.validado >= 0 && String(rows[offset][sm.map.validado] || "").trim()) return response({ ok: false, code: "DUPLICATE" });
    // Grava o anexo antes de marcar a linha: se o Drive falhar, nada e validado.
    const documento = salvarDocumentoSm(data);
    if (documento && documento.falha) {
      return response({ ok: false, code: "UPLOAD_FAILED", error: documento.motivo });
    }
    if (!documento || !documento.url) return response({ ok: false, code: "UPLOAD_FAILED", error: "retorno vazio do salvarDocumentoSm" });
    data.documento = documento.url;
    updateSmRow(spreadsheet, sm, offset + 2, data);
    return response({ ok: true });
  } finally { lock.releaseLock(); }
}
