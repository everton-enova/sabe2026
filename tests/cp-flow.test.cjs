/* eslint-disable @typescript-eslint/no-require-imports */
/* Fluxo completo do formulario CP: rota Next -> Apps Script simulado.
   Garante que "Validar", "Editar Dados" e "Alterar Coordenador" chegam ao
   servidor com o payload que o Code.gs exige e gravam a linha correta. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, env = {}, fetch = async () => { throw new Error('Unexpected network'); }, overrides = {}) {
  const cache = new Map();
  function moduleAt(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const mod = { exports: {} }; cache.set(filename, mod.exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      exports: mod.exports, module: mod, Buffer, Request, Response, AbortSignal, URL, URLSearchParams, TextDecoder,
      process: { env: { NODE_ENV: 'test', ...env } }, fetch,
      require: name => {
        if (name in overrides) return overrides[name];
        if (name.startsWith('node:')) return require(name);
        const resolved = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
        return resolved.endsWith('.json') ? JSON.parse(fs.readFileSync(resolved)) : moduleAt(resolved + '.ts');
      },
    }, { filename });
    return mod.exports;
  }
  return moduleAt(path.join(root, file));
}

function fixture() {
  // Estrutura real da aba CP- SABE (20 colunas).
  const headers = ['Subcoordenador', 'NTE', 'POLO', 'POLO NOVO', 'NOME', 'TELEFONE', 'E-MAIL', 'CPF',
    'TEM EXPERIÊNCIA EM AVALIAÇÃO SIM/NÃO', 'FUNÇÃO QUE JÁ EXERCEU', 'TIPO DE CONTA', 'BANCO', 'AGENCIA',
    'DÍGITO AGÊNCIA', 'CONTA', 'DÍGITO CONTA', 'OPERAÇÃO', 'Endereço de Polo ATUALIZADO?', 'ATUALIZADO', 'VALIDADO/ALTERADO FORM'];
  const rows = [headers, ['Equipe', 'NTE 18', 'ALAGOINHAS 01', '', 'Pessoa Teste', '71999999999', 'teste@example.test', '52998224725',
    'Sim', 'Coordenador', 'Corrente', 'Banco Teste', '0001', '1', '1234', '5', '', '', '', '']];
  const output = []; const cache = new Map();
  const source = { getLastRow: () => rows.length, getLastColumn: () => headers.length, getSheetId: () => 7,
    getRange: (r, c, height, width) => ({
      getDisplayValues: () => rows.slice(r - 1, r - 1 + height).map(row => row.slice(c - 1, c - 1 + width)),
      setValue: value => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = value; },
      setValues: values => values.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((value, j) => { rows[r - 1 + i][c - 1 + j] = value; }); }),
    }) };
  const destination = { getLastRow: () => output.length, appendRow: row => output.push(row), getRange: () => ({ setValues: () => {}, getDisplayValues: () => [] }) };
  const spreadsheet = { getSheetByName: name => name === 'CP- SABE ' ? source : destination };
  const sandbox = {
    SpreadsheetApp: { openById: () => spreadsheet },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-secret' }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_, value) => [...crypto.createHash('sha256').update(value).digest()] },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
  };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(root, 'google-apps-script/Code.gs'), 'utf8'), sandbox);
  const post = data => sandbox.doPost({ postData: { contents: JSON.stringify({ chave: 'test-secret', ...data }) } });
  return { post, output, rows };
}

const env = { SABE_SHEETS_WEBHOOK_URL: 'https://example.test/exec', SABE_WEBHOOK_SECRET: 'test-secret' };
const origin = 'http://localhost:3000';
const request = (route, body) => new Request(origin + route, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

function harness() {
  const f = fixture();
  // Tudo que a rota envia ao webhook cai no Apps Script simulado.
  const fetchStub = async (_url, options = {}) => Response.json(f.post(JSON.parse(options.body)));
  return { f, lookup: load('src/app/api/indicacoes/route.ts', env, fetchStub), submit: load('src/app/api/inscricoes/route.ts', env, fetchStub) };
}

async function getCoordinator(h) {
  const response = await h.lookup.POST(request('/api/indicacoes', { nte: 'NTE 18', polo: 'ALAGOINHAS 01' }));
  assert.equal(response.status, 200);
  return response.json();
}

test('CP validar: consulta, confere e grava os dados da planilha (nao os do navegador)', async () => {
  const h = harness();
  const current = await getCoordinator(h);
  assert.ok(current.registro && current.versao);
  const response = await h.submit.POST(request('/api/inscricoes', {
    modalidade: 'CP', acao: 'validar', nte: 'NTE 18', local: 'ALAGOINHAS 01',
    registro: current.registro, versao: current.versao,
    nome: 'FORGED', cpf: 'FORGED', injected: 'x',
  }));
  assert.equal(response.status, 200);
  assert.equal(h.f.output.length, 2);
  assert.equal(h.f.output[1][5], 'Pessoa Teste');   // NOME vem da planilha
  assert.equal(h.f.output[1][8], '52998224725');    // CPF vem da planilha
  assert.equal(h.f.output[1][2], 'validar');
  // A propria aba oficial fica marcada como validada.
  assert.equal(h.f.rows[1][19], '✓');
  assert.ok(h.f.rows[1][18], 'ATUALIZADO deve receber a data/hora');
  assert.equal(h.f.rows[1][4], 'Pessoa Teste'); // validar nao troca os dados
});

test('CP validados: a lista de polos vem da coluna VALIDADO/ALTERADO FORM da CP- SABE', async () => {
  const f = fixture();
  const fetchStub = async (_url, options = {}) => Response.json(f.post(JSON.parse(options.body)));
  const lookup = load('src/app/api/indicacoes/route.ts', env, fetchStub);
  const submit = load('src/app/api/inscricoes/route.ts', env, fetchStub);
  const current = await (await lookup.POST(request('/api/indicacoes', { nte: 'NTE 18', polo: 'ALAGOINHAS 01' }))).json();
  await submit.POST(request('/api/inscricoes', { modalidade: 'CP', acao: 'validar', nte: 'NTE 18', local: 'ALAGOINHAS 01', registro: current.registro, versao: current.versao }));
  const { GET } = load('src/app/api/validacao-status/route.ts', env, fetchStub);
  const response = await GET(new Request(origin + '/api/validacao-status?nte=' + encodeURIComponent('NTE 18') + '&mode=cp'));
  const body = await response.json();
  assert.ok(body.validated.includes('ALAGOINHAS 01'), JSON.stringify(body));
});

test('CP editar: exige nome/cpf, envia adicionais e preserva o vinculo do registro', async () => {
  const h = harness();
  const current = await getCoordinator(h);
  const response = await h.submit.POST(request('/api/inscricoes', {
    modalidade: 'CP', acao: 'editar', nte: 'NTE 18', local: 'ALAGOINHAS 01',
    registro: current.registro, versao: current.versao,
    nome: 'Pessoa Teste Editada', cpf: current.cpf,
    email: 'editado@example.test', telefone: '71988887777',
    banco: 'Banco Teste', agencia: '0001', conta: '9999', pix: 'editado@example.test',
    adicionais: current.adicionais,
  }));
  assert.equal(response.status, 200);
  assert.equal(h.f.output.length, 2);
  assert.equal(h.f.output[1][2], 'editar');
  assert.equal(h.f.output[1][5], 'Pessoa Teste Editada');
  assert.equal(h.f.output[1][13], current.registro); // REGISTRO ORIGINAL preservado
  // CP- SABE recebe os dados corrigidos in loco.
  assert.equal(h.f.rows[1][4], 'Pessoa Teste Editada');
  assert.equal(h.f.rows[1][14], '9999');
  assert.equal(h.f.rows[1][19], '✓');
});

test('CP editar: adicionais divergentes sao recusados', async () => {
  const h = harness();
  const current = await getCoordinator(h);
  const response = await h.submit.POST(request('/api/inscricoes', {
    modalidade: 'CP', acao: 'editar', nte: 'NTE 18', local: 'ALAGOINHAS 01',
    registro: current.registro, versao: current.versao,
    nome: 'Pessoa Teste', cpf: current.cpf, adicionais: [{ campo: 'Outro', valor: 'x' }],
  }));
  assert.equal(response.status, 400);
  assert.equal(h.f.output.length, 0);
});

test('CP alterar: troca de pessoa grava os dados informados com CPF diferente', async () => {
  const h = harness();
  const current = await getCoordinator(h);
  const response = await h.submit.POST(request('/api/inscricoes', {
    modalidade: 'CP', acao: 'alterar', nte: 'NTE 18', local: 'ALAGOINHAS 01',
    registro: current.registro, versao: current.versao,
    nome: 'Nova Pessoa', cpf: '111.444.777-35',
    email: 'nova@example.test', telefone: '71977776666',
    banco: '001 BANCO', agencia: '1234', conta: '5678', pix: 'nova@example.test',
  }));
  assert.equal(response.status, 200);
  assert.equal(h.f.output.length, 2);
  assert.equal(h.f.output[1][2], 'alterar');
  assert.equal(h.f.output[1][5], 'Nova Pessoa');
  assert.equal(h.f.output[1][8], '111.444.777-35');
  // CP- SABE passa a refletir a pessoa substituta.
  assert.equal(h.f.rows[1][4], 'Nova Pessoa');
  assert.equal(h.f.rows[1][7], '111.444.777-35');
  assert.equal(h.f.rows[1][11], '001 BANCO');
  assert.equal(h.f.rows[1][19], '✓');
});

test('CP alterar: mesmo CPF e recusado (deve usar Editar Dados)', async () => {
  const h = harness();
  const current = await getCoordinator(h);
  const response = await h.submit.POST(request('/api/inscricoes', {
    modalidade: 'CP', acao: 'alterar', nte: 'NTE 18', local: 'ALAGOINHAS 01',
    registro: current.registro, versao: current.versao,
    nome: 'Mesma Pessoa', cpf: current.cpf,
    email: 'teste@example.test', telefone: '71999999999',
    banco: 'Banco Teste', agencia: '0001', conta: '1234', pix: 'teste@example.test',
  }));
  assert.equal(response.status, 400);
  assert.equal(h.f.output.length, 0);
  assert.equal(h.f.rows[1][19], ''); // nada marcado na CP- SABE
});

test('CP validar: versao desatualizada e recusada (CONFLICT)', async () => {
  const h = harness();
  const response = await h.submit.POST(request('/api/inscricoes', {
    modalidade: 'CP', acao: 'validar', nte: 'NTE 18', local: 'ALAGOINHAS 01',
    registro: '7:2', versao: 'desatualizada',
  }));
  assert.equal(response.status, 409);
  assert.equal(h.f.output.length, 0);
});
