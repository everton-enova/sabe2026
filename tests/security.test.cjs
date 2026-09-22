/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, env = {}, fetch = async () => { throw new Error('Unexpected network'); }, overrides = {}) {
  const cache = new Map();
  function moduleAt(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const mod = { exports: {} }; cache.set(filename, mod.exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      exports: mod.exports, module: mod, Buffer, Request, Response, AbortSignal, URL, TextDecoder,
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
const origin = 'http://localhost:3000';
function request(body, extra = {}) {
  return new Request(origin + '/api/indicacoes', { method: 'POST', headers: { origin, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
}
test('rejects non-object JSON and oversized streams', async () => {
  const security = load('src/lib/api-security.ts');
  await assert.rejects(security.readRequest(request(null)), { status: 400 });
  await assert.rejects(security.readRequest(request([])), { status: 400 });
  await assert.rejects(security.readRequest(request({ data: 'a'.repeat(17000) })), { status: 413 });
});
test('lookup performs one authorized call, with no public fallback and no cache', async () => {
  let calls = 0;
  const { POST } = load('src/app/api/indicacoes/route.ts', { SABE_CP_ACCESS_CODE: 'institutional-test-code', SABE_SHEETS_WEBHOOK_URL: 'https://example.test', SABE_WEBHOOK_SECRET: 'test' }, async () => { calls++; return Response.json({ ok: false, code: 'NOT_FOUND' }); });
  const location = JSON.parse(fs.readFileSync(path.join(root, 'src/data/sabe.json'))).coordinators[0];
  const response = await POST(request({ ...location, accessCode: 'institutional-test-code' }));
  assert.equal(response.status, 404); assert.equal(calls, 2);
  assert.match(response.headers.get('cache-control'), /no-store/);
});
test('lookup falls back when webhook returns non-JSON', async () => {
  const { POST } = load('src/app/api/indicacoes/route.ts', { SABE_SHEETS_WEBHOOK_URL: 'https://example.test', SABE_WEBHOOK_SECRET: 'test' }, async url => String(url).includes('example.test') ? new Response('<html>temporary failure</html>', { status: 200 }) : Response.json({ ok: false }));
  const location = JSON.parse(fs.readFileSync(path.join(root, 'src/data/sabe.json'))).coordinators[0];
  const response = await POST(request({ ...location }));
  assert.notEqual(response.status, 502);
});
test('validation strips browser identity, unknown fields and access secret from sheet payload', async () => {
  let sent;
  const { POST } = load('src/app/api/inscricoes/route.ts', { SABE_CP_ACCESS_CODE: 'institutional-test-code', SABE_SHEETS_WEBHOOK_URL: 'https://example.test', SABE_WEBHOOK_SECRET: 'test' }, async (_, options) => { sent = JSON.parse(options.body); return Response.json({ ok: true }); });
  const location = JSON.parse(fs.readFileSync(path.join(root, 'src/data/sabe.json'))).coordinators[0];
  const response = await POST(request({ modalidade: 'CP', acao: 'validar', nte: location.nte, local: location.polo, registro: '1:2', versao: 'v1', nome: 'FORGED', cpf: 'FORGED', accessCode: 'institutional-test-code', injected: 'bad' }));
  assert.equal(response.status, 200);
  assert.equal(sent.nome, undefined); assert.equal(sent.cpf, undefined); assert.equal(sent.accessCode, undefined); assert.equal(sent.injected, undefined);
});
/* A planilha grava o NTE como "1" e o formulario envia "NTE 01"; o polo vem com acentuacao
   e capitalizacao proprias. A leitura publica precisa casar os dois como o Apps Script casa. */
const CSV_REAL = [
  '"Subcoordenador","NTE","POLO","POLO NOVO","NOME","TELEFONE","E-MAIL","CPF","EXPERIENCIA","FUNCAO","BANCO","AGENCIA","CONTA"',
  '"Equipe","1","América Dourada","","Arionete Dourado Borges","71999999999","a@b.test","020.695.065-92","Sim","Aplicador","001","0001","123"',
].join('\n');
test('leitura publica casa NTE com zero a esquerda e polo acentuado', async () => {
  const { POST } = load('src/app/api/indicacoes/route.ts', {}, async () => new Response(CSV_REAL, { status: 200 }));
  const location = JSON.parse(fs.readFileSync(path.join(root, 'src/data/sabe.json'))).coordinators
    .find(item => item.nte === 'NTE 01' && item.polo === 'AMÉRICA DOURADA');
  assert.ok(location, 'AMÉRICA DOURADA do NTE 01 precisa existir em sabe.json');
  const response = await POST(request({ ...location }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.nome, 'Arionete Dourado Borges');
  assert.equal(body.cpf, '020.695.065-92');
});
test('webhook que responde ok sem coordinator nao vira erro generico 502', async () => {
  const { POST } = load('src/app/api/indicacoes/route.ts',
    { SABE_SHEETS_WEBHOOK_URL: 'https://example.test', SABE_WEBHOOK_SECRET: 'test' },
    async url => String(url).includes('example.test')
      ? Response.json({ ok: true })
      : new Response(CSV_REAL, { status: 200 }));
  const location = JSON.parse(fs.readFileSync(path.join(root, 'src/data/sabe.json'))).coordinators
    .find(item => item.nte === 'NTE 01' && item.polo === 'AMÉRICA DOURADA');
  const response = await POST(request({ ...location }));
  assert.notEqual(response.status, 502);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).nome, 'Arionete Dourado Borges');
});
test('falha de envio diz a causa sem expor URL nem segredo', async () => {
  const URL_WEBHOOK = 'https://script.google.com/macros/s/ABC123/exec';
  const SEGREDO = 'segredo-de-teste';
  const location = JSON.parse(fs.readFileSync(path.join(root, 'src/data/sabe.json'))).locations[0];
  const envio = { modalidade: 'SM', acao: 'cadastrar', nte: location.nte, local: location.municipio,
    nome: 'Pessoa Teste', email: 'teste@example.test', telefone: '71999999999', cpf: '529.982.247-25',
    banco: '001 BANCO', agencia: '0001', conta: '12345', pix: 'teste@example.test' };
  for (const [nome, fetchStub, esperado] of [
    ['Apps Script recusa o acesso', async () => new Response('<html>Unauthorized</html>', { status: 403 }), 'HTTP 403'],
    ['implantação não existe mais', async () => new Response('', { status: 404 }), 'HTTP 404'],
    ['requisição não completa', async () => { throw new TypeError('fetch failed'); }, 'TypeError'],
  ]) {
    const { POST } = load('src/app/api/inscricoes/route.ts',
      { SABE_SHEETS_WEBHOOK_URL: URL_WEBHOOK, SABE_WEBHOOK_SECRET: SEGREDO }, fetchStub);
    const response = await POST(new Request(origin + '/api/inscricoes',
      { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(envio) }));
    assert.equal(response.status, 502, nome);
    const body = await response.json();
    assert.equal(body.message, 'Não foi possível acessar a planilha.', nome);
    assert.ok(String(body.detalhe).includes(esperado), `${nome}: detalhe foi "${body.detalhe}"`);
    const corpo = JSON.stringify(body);
    assert.ok(!corpo.includes(SEGREDO), `${nome}: segredo vazou`);
    assert.ok(!corpo.includes('ABC123'), `${nome}: URL do webhook vazou`);
  }
});
module.exports = { load };
