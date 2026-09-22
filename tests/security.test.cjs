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
test('rejects cross-origin, non-object JSON and oversized streams', async () => {
  const security = load('src/lib/api-security.ts');
  await assert.rejects(security.readRequest(request({}, { origin: 'https://evil.example' })), { status: 403 });
  await assert.rejects(security.readRequest(request(null)), { status: 400 });
  await assert.rejects(security.readRequest(request([])), { status: 400 });
  await assert.rejects(security.readRequest(request({ data: 'a'.repeat(17000) })), { status: 413 });
});
test('limits requests and fails closed in production without Redis', async () => {
  const security = load('src/lib/api-security.ts');
  for (let i = 0; i < 20; i++) await security.readRequest(request({}));
  await assert.rejects(security.readRequest(request({})), { status: 429 });
  await assert.rejects(load('src/lib/api-security.ts', { NODE_ENV: 'production' }).readRequest(request({})), { status: 503 });
});
test('checks Turnstile action, hostname, success, expiry and missing configuration', async () => {
  const env = { TURNSTILE_SECRET_KEY: 'test-secret', SABE_APP_ORIGIN: origin };
  for (const result of [{ success: false }, { success: true, action: 'wrong', hostname: 'localhost' }, { success: true, action: 'consulta_cp', hostname: 'evil.example' }]) {
    await assert.rejects(load('src/lib/api-security.ts', env, async () => Response.json(result)).verifyBot({ turnstileToken: 'token' }, 'consulta_cp'), { status: 403 });
  }
  await load('src/lib/api-security.ts', env, async () => Response.json({ success: true, action: 'consulta_cp', hostname: 'localhost' })).verifyBot({ turnstileToken: 'token' }, 'consulta_cp');
  await assert.rejects(load('src/lib/api-security.ts', { NODE_ENV: 'production' }).verifyBot({}, 'envio'), { status: 503 });
});
test('lookup performs one authorized call, with no public fallback and no cache', async () => {
  let calls = 0;
  const { POST } = load('src/app/api/indicacoes/route.ts', { SABE_CP_ACCESS_CODE: 'institutional-test-code', SABE_SHEETS_WEBHOOK_URL: 'https://example.test', SABE_WEBHOOK_SECRET: 'test' }, async () => { calls++; return Response.json({ ok: false, code: 'NOT_FOUND' }); });
  const location = JSON.parse(fs.readFileSync(path.join(root, 'src/data/sabe.json'))).coordinators[0];
  const response = await POST(request({ ...location, accessCode: 'institutional-test-code' }));
  assert.equal(response.status, 404); assert.equal(calls, 1);
  assert.match(response.headers.get('cache-control'), /no-store/);
});
test('validation strips browser identity, unknown fields and access secret from sheet payload', async () => {
  let sent;
  const { POST } = load('src/app/api/inscricoes/route.ts', { SABE_CP_ACCESS_CODE: 'institutional-test-code', SABE_SHEETS_WEBHOOK_URL: 'https://example.test', SABE_WEBHOOK_SECRET: 'test' }, async (_, options) => { sent = JSON.parse(options.body); return Response.json({ ok: true }); });
  const location = JSON.parse(fs.readFileSync(path.join(root, 'src/data/sabe.json'))).coordinators[0];
  const response = await POST(request({ modalidade: 'CP', acao: 'validar', nte: location.nte, local: location.polo, registro: '1:2', versao: 'v1', nome: 'FORGED', cpf: 'FORGED', accessCode: 'institutional-test-code', injected: 'bad' }));
  assert.equal(response.status, 200);
  assert.equal(sent.nome, undefined); assert.equal(sent.cpf, undefined); assert.equal(sent.accessCode, undefined); assert.equal(sent.injected, undefined);
});
module.exports = { load };
