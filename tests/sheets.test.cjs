/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function fixture() {
  // Estrutura real da aba oficial CP- SABE (20 colunas).
  const headers = ['Subcoordenador', 'NTE', 'POLO', 'POLO NOVO', 'NOME', 'TELEFONE', 'E-MAIL', 'CPF',
    'TEM EXPERIÊNCIA EM AVALIAÇÃO SIM/NÃO', 'FUNÇÃO QUE JÁ EXERCEU', 'TIPO DE CONTA', 'BANCO', 'AGENCIA',
    'DÍGITO AGÊNCIA', 'CONTA', 'DÍGITO CONTA', 'OPERAÇÃO', 'Endereço de Polo ATUALIZADO?', 'ATUALIZADO', 'VALIDADO/ALTERADO FORM'];
  const rows = [headers, ['Equipe', '01', 'POLO TESTE', '', 'Pessoa Teste', '71999999999', 'teste@example.test', '52998224725',
    'Sim', 'Coordenador', 'Corrente', 'Banco Teste', '0001', '1', '1234', '5', '', '', '', '']];
  const output = []; const reads = []; const cache = new Map();
  const scriptProps = new Map([['SABE_WEBHOOK_SECRET', 'test-secret']]);
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
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => scriptProps.get(key), setProperty: (key, value) => scriptProps.set(key, value) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_, value) => [...crypto.createHash('sha256').update(value).digest()] },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
  };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync('google-apps-script/Code.gs', 'utf8'), sandbox);
  const post = data => sandbox.doPost({ postData: { contents: JSON.stringify({ chave: 'test-secret', ...data }) } });
  const lookup = () => post({ tipo: 'indicacao', nte: 'NTE 01', polo: 'POLO TESTE' }).coordinator;
  return { sandbox, rows, output, reads, post, lookup };
}
test('reads full selected record by header names and indexes only NTE/polo', () => {
  const f = fixture(); const record = f.lookup();
  assert.equal(record.email, 'teste@example.test');
  assert.equal(record.banco, 'Banco Teste');
  assert.equal(record.experiencia, 'Sim');
  assert.equal(record.funcao, 'Coordenador');
  assert.equal(record.tipoConta, 'Corrente');
  assert.equal(record.agencia, '0001');
  assert.equal(record.conta, '1234');
  assert.equal(record.adicionais.length, 3);
  assert.ok(f.reads.some(read => read.c === 2 && read.width === 2));
  f.reads.length = 0; f.lookup(); assert.ok(!f.reads.some(read => read.c === 2 && read.width === 2));
  f.rows[1][2] = 'OUTRO POLO'; assert.equal(f.lookup(), undefined);
});
test('validar marca a CP- SABE e bloqueia repeticao e versao desatualizada', () => {
  const f = fixture(); const current = f.lookup();
  const data = { modalidade: 'CP', acao: 'validar', nte: 'NTE 01', local: 'POLO TESTE', registro: current.registro, versao: current.versao, nome: 'FORGED', cpf: 'FORGED' };
  assert.equal(f.post(data).ok, true);
  assert.equal(f.rows[1][4], 'Pessoa Teste');
  assert.equal(f.rows[1][7], '52998224725');
  assert.equal(String(f.rows[1][19]).trim(), '✓');
  const refreshed = f.lookup();
  assert.equal(f.post({ ...data, registro: refreshed.registro, versao: refreshed.versao }).code, 'DUPLICATE');
  f.rows[1][4] = 'Changed';
  assert.equal(f.post({ ...data, registro: refreshed.registro, versao: refreshed.versao }).code, 'CONFLICT');
});
test('editar grava na propria linha; alterar exige CPF diferente; formula vira texto', () => {
  const f = fixture(); const current = f.lookup();
  const base = { modalidade: 'CP', nte: 'NTE 01', local: 'POLO TESTE', registro: current.registro, versao: current.versao, cpf: current.cpf };
  assert.equal(f.post({ ...base, acao: 'alterar' }).code, 'INVALID');
  assert.equal(f.post({ ...base, acao: 'editar', nome: '=IMPORTXML("bad")', adicionais: current.adicionais }).ok, true);
  assert.equal(f.rows[1][4][0], "'");
  assert.equal(f.sandbox.doGet().code, 'UNAUTHORIZED');
  assert.equal(f.post({ chave: 'wrong', tipo: 'indicacao' }).code, 'UNAUTHORIZED');
});
