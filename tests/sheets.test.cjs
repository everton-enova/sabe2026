/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function fixture() {
  const headers = ['Subcoordenador', 'NTE', 'POLO', 'POLO NOVO', 'NOME', 'TELEFONE', 'E-MAIL', 'CPF', 'EXPERIÊNCIA', 'FUNÇÃO', 'BANCO', 'AGENCIA', 'CONTA'];
  const rows = [headers, ['Equipe', '01', 'POLO TESTE', '', 'Pessoa Teste', '71999999999', 'teste@example.test', '52998224725', 'SIM', 'Aplicador', 'Banco Teste', '0001', '1234']];
  const output = []; const reads = []; const cache = new Map();
  const source = { getLastRow: () => rows.length, getLastColumn: () => headers.length, getSheetId: () => 7,
    getRange: (r, c, height, width) => { reads.push({ r, c, height, width }); return {
      getDisplayValues: () => rows.slice(r - 1, r - 1 + height).map(row => row.slice(c - 1, c - 1 + width)),
      setValue: value => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = value; },
      setValues: values => values.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((value, j) => { rows[r - 1 + i][c - 1 + j] = value; }); }),
    }; } };
  const destination = { getLastRow: () => output.length, appendRow: row => output.push(row), getRange: (r, c, height, width) => ({ setValues: () => {}, getDisplayValues: () => output.slice(r - 1, r - 1 + height).map(row => row.slice(c - 1, c - 1 + width)) }) };
  const spreadsheet = { getSheetByName: name => name === 'CP- SABE ' ? source : destination };
  const sandbox = {
    SpreadsheetApp: { openById: () => spreadsheet },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-secret' }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_, value) => [...crypto.createHash('sha256').update(value).digest()] },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
  };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync('google-apps-script/Code.gs', 'utf8'), sandbox);
  const post = data => sandbox.doPost({ postData: { contents: JSON.stringify({ chave: 'test-secret', ...data }) } });
  const lookup = () => post({ tipo: 'indicacao', nte: 'NTE 01', polo: 'POLO TESTE' }).coordinator;
  return { sandbox, rows, output, reads, post, lookup };
}
test('reads full selected record but indexes only NTE/polo; repeated lookup uses verified row pointer', () => {
  const f = fixture(); const record = f.lookup();
  assert.equal(record.email, 'teste@example.test'); assert.equal(record.banco, 'Banco Teste'); assert.equal(record.adicionais.length, 4);
  assert.ok(f.reads.some(read => read.c === 2 && read.width === 2));
  f.reads.length = 0; f.lookup(); assert.ok(!f.reads.some(read => read.c === 2 && read.width === 2));
  f.rows[1][2] = 'OUTRO POLO'; assert.equal(f.lookup(), undefined);
});
test('validation reads authoritative identity and server blocks repeat and stale submissions', () => {
  const f = fixture(); const current = f.lookup();
  const data = { modalidade: 'CP', acao: 'validar', nte: 'NTE 01', local: 'POLO TESTE', registro: current.registro, versao: current.versao, nome: 'FORGED', cpf: 'FORGED' };
  assert.equal(f.post(data).ok, true); assert.equal(f.output[1][5], 'Pessoa Teste'); assert.equal(f.output[1][8], '52998224725');
  assert.equal(f.post(data).code, 'DUPLICATE');
  f.rows[1][4] = 'Changed'; assert.equal(f.post(data).code, 'CONFLICT');
});
test('editing preserves record link; replacing requires a different CPF; formulas remain text', () => {
  const f = fixture(); const current = f.lookup();
  const base = { modalidade: 'CP', nte: 'NTE 01', local: 'POLO TESTE', registro: current.registro, versao: current.versao, cpf: current.cpf };
  assert.equal(f.post({ ...base, acao: 'alterar' }).code, 'INVALID');
  assert.equal(f.post({ ...base, acao: 'editar', nome: '=IMPORTXML("bad")', adicionais: current.adicionais }).ok, true);
  assert.equal(f.output[1][13], current.registro); assert.equal(f.output[1][5][0], "'");
  assert.equal(f.sandbox.doGet().code, 'UNAUTHORIZED');
  assert.equal(f.post({ chave: 'wrong', tipo: 'indicacao' }).code, 'UNAUTHORIZED');
});
