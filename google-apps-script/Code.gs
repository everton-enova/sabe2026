const SPREADSHEET_ID = "1It6KcaRdBMxVsQsis0ZTWSAuaUy4S_mvYxmVV2fBrg8";
/* Muda a cada publicacao relevante. Serve para confirmar, pela web, qual codigo esta no ar. */
const CODE_VERSION = "2026-09-28-monitoramento";
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
  revisar: ["REVISAR DOCUMENTO"],
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
/* ATUALIZADO deve registar o horario LOCAL da planilha (Brasilia, UTC-3), nao UTC:
   o enviadoEm chega como ISO UTC do servidor e, gravado cru, fica 3h a frente
   do horario real de quem validou. O fallback usa o instante atual do script. */
function localTimestamp(value, spreadsheet) {
  const timeZone = spreadsheet.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  const date = value ? new Date(String(value)) : new Date();
  if (isNaN(date.getTime())) return String(value || "");
  return Utilities.formatDate(date, timeZone, "dd/MM/yyyy HH:mm:ss");
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
  const errors = [];
  const write = (column, value) => {
    if (column < 0) return;
    try { info.sheet.getRange(rowNumber, column + 1).setValue(textCell(value)); }
    catch (e) { errors.push("col " + (column + 1) + ": " + e.message); }
  };
  dataFields.forEach(field => { if (data[field] !== undefined) write(info.map[field], data[field]); });
  write(info.map.atualizado, localTimestamp(data.enviadoEm, info.sheet.getParent()));
  write(info.map.validado, "✓");
  if (errors.length) throw new Error("Erro ao gravar: " + errors.join("; "));
}
/* Grava a validacao na propria aba oficial: atualiza os dados do coordenador
   (em editar/alterar) e marca ATUALIZADO + VALIDADO/ALTERADO FORM. */
function updateCpRow(spreadsheet, current, data) {
  const cp = cpSheet(spreadsheet);
  if (!cp) throw new Error("Aba CP- SABE não encontrada.");
  const rowNumber = Number(String(current.registro).split(":")[1]);
  if (!(rowNumber >= 2)) throw new Error("Número da linha inválido: " + current.registro);
  writeValidatedRow(cp, rowNumber, data, data.acao === "validar" ? [] : CP_DATA_FIELDS);
}
/* SM: encontra a linha pelo NTE + MUNICÍPIO e grava os dados do supervisor. */
function updateSmRow(spreadsheet, sm, rowNumber, data) {
  if (!sm) throw new Error("Aba SM-SABE não encontrada.");
  if (!(rowNumber >= 2)) throw new Error("Número da linha inválido: " + rowNumber);
  writeValidatedRow(sm, rowNumber, data, SM_DATA_FIELDS);
}
/* SM: substituição do ofício — grava apenas o documento e limpa a marcação
   de revisão, mantendo os dados do supervisor já cadastrados. */
function updateSmDocumento(info, rowNumber, data) {
  if (!info) throw new Error("Aba SM-SABE não encontrada.");
  if (!(rowNumber >= 2)) throw new Error("Número da linha inválido: " + rowNumber);
  const errors = [];
  const write = (column, value) => {
    if (column < 0) return;
    try { info.sheet.getRange(rowNumber, column + 1).setValue(textCell(value)); }
    catch (e) { errors.push("col " + (column + 1) + ": " + e.message); }
  };
  write(info.map.documento, data.documento);
  write(info.map.atualizado, localTimestamp(data.enviadoEm, info.sheet.getParent()));
  write(info.map.revisar, "");
  if (errors.length) throw new Error("Erro ao gravar: " + errors.join("; "));
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
/* Extrai o ID do arquivo do Google Drive a partir da URL gravada na coluna DOCUMENTO. */
function extrairDriveFileId(url) {
  const m = String(url || "").match(/(?:\/d\/|id=)([\w-]{10,})/);
  return m ? m[1] : "";
}
/* Apaga o arquivo anterior do Drive (fallback sem Supabase) antes de gravar o novo link. */
function apagarDocumentoAntigo(sm, rowNumber) {
  if (!sm || sm.map.documento < 0) return;
  const cells = sm.sheet.getRange(rowNumber, sm.map.documento + 1, 1, 1).getDisplayValues();
  const url = String((cells[0] && cells[0][0]) || "");
  const id = extrairDriveFileId(url);
  if (!id) return;
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* arquivo já ausente ou sem permissão: segue */ }
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
      changes.atualizado = at(row, "DATA/HORA", 0) || localTimestamp(null, spreadsheet);
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
/* Converte um valor de ATUALIZADO (ISO UTC ou dd/MM/yyyy HH:mm:ss) para instante. */
function parseDataHora(value) {
  const texto = String(value || "").trim();
  if (!texto) return null;
  const iso = new Date(texto);
  if (!isNaN(iso.getTime())) return iso.getTime();
  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
  return null;
}
/* Agrega por NTE os polos validados (CP) e os municípios com supervisor cadastrado
   (SM). Percorre TODAS as linhas das duas abas (mesmo sem validação, para a aba
   mostrar os NTEs zerados) e devolve um array ordenado por número do NTE. */
function montarMonitor(spreadsheet) {
  const resumo = new Map();
  const conta = (sInfo, tipo) => {
    if (!sInfo || sInfo.map.nte < 0 || sInfo.map.validado < 0 || sInfo.sheet.getLastRow() < 2) return;
    const nteCol = sInfo.map.nte;
    const validadoCol = sInfo.map.validado;
    const atualizadoCol = sInfo.map.atualizado >= 0 ? sInfo.map.atualizado : -1;
    const rows = sInfo.sheet.getRange(2, 1, sInfo.sheet.getLastRow() - 1, sInfo.columns).getDisplayValues();
    rows.forEach((row, index) => {
      const nte = String(row[nteCol] || "").replace(/\D/g, "");
      if (!nte) return;
      const chave = String(Number(nte));
      if (!resumo.has(chave)) {
        resumo.set(chave, { nte: "NTE " + String(Number(nte)).padStart(2, "0"), cp: 0, sm: 0, ultimoCp: null, ultimoSm: null });
      }
      if (!String(row[validadoCol] || "").trim()) return;
      const item = resumo.get(chave);
      item[tipo] += 1;
      const instante = atualizadoCol >= 0 ? parseDataHora(row[atualizadoCol]) : null;
      const campo = tipo === "cp" ? "ultimoCp" : "ultimoSm";
      if (instante !== null && item[campo] === null) item[campo] = instante;
      else if (instante !== null && instante > item[campo]) item[campo] = instante;
    });
  };
  conta(cpSheet(spreadsheet), "cp");
  conta(smSheet(spreadsheet), "sm");
  return Array.from(resumo.values()).sort((a, b) =>
    Number(a.nte.replace(/\D/g, "")) - Number(b.nte.replace(/\D/g, "")));
}
/* Aba MONITORAMENTO: resumo por NTE (coordenadores de polo validados e municípios
   com supervisor cadastrado), com total por NTE e totais gerais. Cria a aba se não
   existir e é chamada no fim de cada gravação bem-sucedida do webhook. */
function atualizarMonitoramento(spreadsheet) {
  spreadsheet = spreadsheet || SpreadsheetApp.openById(SPREADSHEET_ID);
  const dados = montarMonitor(spreadsheet);
  const nomeAba = "MONITORAMENTO";
  let aba = spreadsheet.getSheetByName(nomeAba);
  if (!aba) aba = spreadsheet.insertSheet(nomeAba);
  else aba.clear();
  const timeZone = spreadsheet.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  const fmt = "dd/MM/yyyy HH:mm:ss";
  const headers = ["NTE", "COORDENADORES DE POLO VALIDADOS", "MUNICÍPIOS SM CADASTRADOS", "TOTAL", "ÚLTIMA VALIDAÇÃO CP", "ÚLTIMO CADASTRO SM"];
  const linhas = dados.map(d => [
    d.nte, d.cp, d.sm, d.cp + d.sm,
    d.ultimoCp !== null ? Utilities.formatDate(new Date(d.ultimoCp), timeZone, fmt) : "",
    d.ultimoSm !== null ? Utilities.formatDate(new Date(d.ultimoSm), timeZone, fmt) : "",
  ]);
  const totCp = dados.reduce((soma, d) => soma + d.cp, 0);
  const totSm = dados.reduce((soma, d) => soma + d.sm, 0);
  linhas.push(["TOTAL", totCp, totSm, totCp + totSm, "", ""]);
  aba.getRange(1, 1, 1, headers.length).setValues([headers]);
  aba.getRange(2, 1, linhas.length, headers.length).setValues(linhas);
  aba.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  aba.getRange(linhas.length + 1, 1, 1, headers.length).setFontWeight("bold");
  aba.setFrozenRows(1);
  return { ok: true, atualizadoEm: Utilities.formatDate(new Date(), timeZone, fmt), ntEs: dados.length };
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
/* Corrige na planilha os horários de ATUALIZADO gravados em UTC (ISO "...Z") para
   o fuso local (Brasília). Execute UMA VEZ no editor (menu Executar →
   corrigirHorariosAtualizado) após publicar esta versão — não é chamada pelo webhook.
   Converte apenas células que pareçam ISO UTC; células já corretas são ignoradas. */
function corrigirHorariosAtualizado() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const corrigidas = [];
  [["CP- SABE ", CP_FIELDS], [SM_SHEET, SM_FIELDS]].forEach(([nome, fields]) => {
    const info = sheetInfo(spreadsheet, nome, fields);
    if (!info || info.map.atualizado < 0 || info.sheet.getLastRow() < 2) return;
    const values = info.sheet.getRange(2, info.map.atualizado + 1, info.sheet.getLastRow() - 1, 1).getValues();
    let mudou = 0;
    values.forEach((coluna, index) => {
      const valor = coluna[0];
      if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(valor.trim())) {
        info.sheet.getRange(index + 2, info.map.atualizado + 1).setValue(localTimestamp(valor.trim(), spreadsheet));
        mudou += 1;
      }
    });
    if (mudou > 0) corrigidas.push(nome + ": " + mudou + " célula(s)");
  });
  return { ok: true, corrigidas };
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
  const substituirDocumento = data.modalidade === "SM" && data.acao === "substituir-documento";
  if (!(cp && ["validar", "editar", "alterar"].includes(data.acao)) && !(data.modalidade === "SM" && ["cadastrar", "substituir-documento"].includes(data.acao))) return response({ ok: false, code: "INVALID" });
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
      try { atualizarMonitoramento(spreadsheet); } catch (monitorError) {}
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
    const rowNumber = offset + 2;
    const jaCadastrado = sm.map.validado >= 0 ? String(rows[offset][sm.map.validado] || "").trim() : "";
    const temNome = sm.map.nome >= 0 ? String(rows[offset][sm.map.nome] || "").trim() : "";

    if (substituirDocumento) {
      // Só substitui em municípios que já têm cadastro (validado ou com nome).
      if (!jaCadastrado && !temNome) return response({ ok: false, code: "NOT_FOUND" });
      if (data.documentoUrl) {
        data.documento = data.documentoUrl;
      } else {
        const documento = salvarDocumentoSm(data);
        if (documento && documento.falha) return response({ ok: false, code: "UPLOAD_FAILED", error: documento.motivo });
        if (!documento || !documento.url) return response({ ok: false, code: "UPLOAD_FAILED", error: "retorno vazio do salvarDocumentoSm" });
        apagarDocumentoAntigo(sm, rowNumber);
        data.documento = documento.url;
      }
      updateSmDocumento(sm, rowNumber, data);
      try { atualizarMonitoramento(spreadsheet); } catch (monitorError) {}
      return response({ ok: true });
    }

    if (jaCadastrado) return response({ ok: false, code: "DUPLICATE" });
    // Documento vem do Supabase Storage (URL publica) ou do fallback base64 -> Drive.
    if (data.documentoUrl) {
      data.documento = data.documentoUrl;
    } else {
      const documento = salvarDocumentoSm(data);
      if (documento && documento.falha) {
        return response({ ok: false, code: "UPLOAD_FAILED", error: documento.motivo });
      }
      if (!documento || !documento.url) return response({ ok: false, code: "UPLOAD_FAILED", error: "retorno vazio do salvarDocumentoSm" });
      data.documento = documento.url;
    }
    updateSmRow(spreadsheet, sm, rowNumber, data);
    try { atualizarMonitoramento(spreadsheet); } catch (monitorError) {}
    return response({ ok: true });
  } catch (error) {
    return response({ ok: false, code: "INTERNAL", error: String(error && error.message ? error.message : error) });
  } finally { lock.releaseLock(); }
}
