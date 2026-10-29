import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const { NextResponse } = createRequire(import.meta.url)('next/server');
const compile = file => ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const storeCode = compile('lib/payjoy-40-60-store.ts');
const routeCode = compile('app/api/payjoy/40-60/registros/route.ts');
const age = {};
new Function('exports', compile('lib/payjoy-40-60-age.ts'))(age);
const key = '7c8be860-7ced-41d1-a58b-05a8de7e4d08';
const rows = () => Array.from({ length: 32 }, (_, i) => ({ id: 'qa-' + i, week: 'SEMANA QA',
  merchantName: 'COMERCIO QA', deviceTag: 'DQA' + String(i).padStart(5, '0'), loanAgeDays: 58,
  numberOfPayments: i % 4, loanRepaymentBiweek: 2, cedula: i === 30 ? '000000001' : '',
  status: i % 2 ? '40/60 APROBADO' : '40/60 NO APROBADO', pay40At60: i % 2, paidInFull: false }));
const input = changes => ({ clientKey: key, recordName: 'Corte QA', week: 'SEMANA QA', fileName: 'qa.xlsx',
  sheetName: 'QA', totalRows: 40, rows: rows(), ...changes });
const request = (method, body, query = '') => new Request('https://qa.invalid/api/payjoy/40-60/registros' + query, {
  method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});

// Runs the real route and store; only auth and Prisma's parameterized SQL boundary
// are replaced. The fake executes synchronously so concurrent requests contend on
// the same state. Network, actual Prisma and provider imports fail closed.
function environment() {
  const records = new Map(); const schema = []; const queries = [];
  const controls = { user: { id: 8, perfilId: 100, perfilNombre: 'Auditor QA', nombre: 'Cuenta sede QA', usuario: 'qa', rolNombre: 'AUDITOR' } };
  let nextId = 1;
  function recordFrom(parameters, id, previous = null) {
    return { id, revision: previous ? previous.revision + 1 : 1,
      recordName: parameters[0], week: parameters[1], fileName: parameters[2], sheetName: parameters[3],
      totalRows: parameters[4], filteredRows: parameters[5], summaryAprobados: parameters[6],
      summaryNoAprobados: parameters[7], summaryCedulasEncontradas: parameters[8], summaryCedulasPendientes: parameters[9],
      rows: JSON.parse(parameters[10]), savedById: parameters[11], savedByName: parameters[12], savedByUser: parameters[13],
      savedAt: previous?.savedAt || new Date('2026-01-01T15:00:00Z'), updatedAt: new Date('2026-01-02T15:00:00Z'),
      creationKey: previous?.creationKey ?? parameters[14], ageReferenceDate: previous?.ageReferenceDate ?? parameters[15] ?? null };
  }
  const prisma = {
    async $executeRawUnsafe(sql) { schema.push(sql); return 0; },
    async $queryRawUnsafe(sql, ...parameters) {
      queries.push({ sql, parameters: structuredClone(parameters) });
      if (/INSERT INTO payjoy_40_60_guardados/.test(sql)) {
        assert.match(sql, /ON CONFLICT \(creation_key\) DO NOTHING/);
        assert.match(sql, /rows_json AS "rows"/);
        const previous = parameters[14] == null ? null : [...records.values()].find(record => record.creationKey === parameters[14]);
        if (previous) return [];
        const record = recordFrom(parameters, nextId++); records.set(record.id, record); return [structuredClone(record)];
      }
      if (/UPDATE payjoy_40_60_guardados/.test(sql)) {
        assert.match(sql, /revision = revision \+ 1/);
        assert.match(sql, /WHERE id = \$1 AND \(\$16::integer IS NULL OR revision = \$16\)/);
        assert.doesNotMatch(sql, /creation_key\s*=/, 'Editing must not replace creation identity');
        const previous = records.get(parameters[0]);
        if (!previous || (parameters[15] !== null && parameters[15] !== previous.revision)) return [];
        const record = recordFrom(parameters.slice(1), previous.id, previous);
        record.ageReferenceDate = parameters[16] ? parameters[17] : previous.ageReferenceDate;
        records.set(record.id, record); return [structuredClone(record)];
      }
      if (/DELETE FROM payjoy_40_60_guardados/.test(sql)) return records.delete(parameters[0]) ? [{ id: parameters[0] }] : [];
      if (/WHERE creation_key = \$1/.test(sql)) {
        const record = [...records.values()].find(record => record.creationKey === parameters[0]); return record ? [{ id: record.id }] : [];
      }
      if (/SELECT revision FROM/.test(sql)) {
        const record = records.get(parameters[0]); return record ? [{ revision: record.revision }] : [];
      }
      if (/WHERE id = \$1/.test(sql)) return records.has(parameters[0]) ? [structuredClone(records.get(parameters[0]))] : [];
      if (/ORDER BY updated_at DESC, id DESC/.test(sql)) return [...records.values()].sort((a, b) => b.id - a.id).slice(0, parameters[0]).map(record => structuredClone(record));
      throw Error('Unexpected isolated SQL: ' + sql);
    },
  };
  const storeModule = { exports: {} };
  new Function('require', 'module', 'exports', storeCode)(name => {
    if (name === '@/lib/prisma') return { __esModule: true, default: prisma };
    if (name === '@/lib/payjoy-40-60-age') return age;
    throw Error('Unexpected dependency in isolated store: ' + name);
  }, storeModule, storeModule.exports);
  const routeModule = { exports: {} };
  new Function('require', 'module', 'exports', 'console', routeCode)(name => {
    if (name === 'next/server') return { NextResponse };
    if (name === '@/lib/auth') return { getSessionUser: async () => structuredClone(controls.user) };
    if (name === '@/lib/payjoy-40-60-store') return storeModule.exports;
    if (name === '@/lib/payjoy-40-60-age') return age;
    throw Error('Unexpected dependency in isolated route: ' + name);
  }, routeModule, routeModule.exports, { error() {} });
  const call = async (method, body, query) => { const response = await routeModule.exports[method](request(method, body, query)); return { status: response.status, body: await response.json() }; };
  return { call, controls, records, queries, schema, store: storeModule.exports };
}

test('POST concurrente con el mismo clientKey crea una sola vez y recupera todas las filas tras respuesta perdida', async () => {
  const env = environment(); const body = input();
  const results = await Promise.all([env.call('POST', body), env.call('POST', body)]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  assert.deepEqual(results.map(result => result.body.replayed).sort(), [false, true]);
  assert.equal(new Set(results.map(result => result.body.registro.id)).size, 1);
  assert.equal(env.records.size, 1);
  const id = results[0].body.registro.id;
  const changed = input({ rows: rows().map((row, i) => i === 0 ? { ...row, cedula: '000777' } : row), recordName: 'No sobrescribir por replay' });
  const retry = await env.call('POST', changed);
  assert.equal(retry.body.replayed, true); assert.equal(retry.body.registro.id, id);
  assert.equal(retry.body.registro.revision, 1); assert.deepEqual(retry.body.registro.rows, body.rows);
  assert.equal(retry.body.registro.recordName, body.recordName);
  assert.equal(retry.body.registro.savedByName, 'Auditor QA');
});

test('PATCH concurrentes conservan un solo cambio y devuelven 409 con revisión actual al segundo editor', async () => {
  const env = environment(); const created = await env.call('POST', input()); const id = created.body.registro.id;
  const first = input({ id, expectedRevision: 1, recordName: 'Edición uno', rows: rows().map((row, i) => i === 31 ? { ...row, cedula: '000031', status: '40/60 NO APROBADO' } : row) });
  const second = input({ id, expectedRevision: 1, recordName: 'Edición dos' });
  const results = await Promise.all([env.call('PATCH', first), env.call('PATCH', second)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const conflict = results.find(result => result.status === 409).body;
  assert.equal(conflict.code, 'REVISION_CONFLICT'); assert.equal(conflict.currentRevision, 2); assert.equal(conflict.registro, undefined);
  const result = (await env.call('GET', undefined, '?id=' + id)).body.registro;
  assert.equal(result.revision, 2); assert.equal(result.recordName, 'Edición uno'); assert.deepEqual(result.rows, first.rows);
  assert.equal(result.rows.length, 32); assert.equal(result.summary.aprobados, 15);
  assert.equal((await env.call('GET')).body.registros[0].revision, 2);
  const replay = await env.call('POST', input());
  assert.equal(replay.body.registro.revision, 2); assert.deepEqual(replay.body.registro.rows, first.rows);
});

test('creation_key distingue perfiles de la misma cuenta y permanece ligada al creador después de un PATCH ajeno', async () => {
  const env = environment(); const first = await env.call('POST', input());
  env.controls.user.perfilId = 101; env.controls.user.perfilNombre = 'Otro perfil QA';
  const other = await env.call('POST', input()); assert.notEqual(other.body.registro.id, first.body.registro.id);
  env.controls.user.id = 9; env.controls.user.perfilId = null; env.controls.user.rolNombre = 'ADMIN';
  assert.equal((await env.call('PATCH', input({ id: first.body.registro.id, expectedRevision: 1, recordName: 'Cambio de admin QA' }))).status, 200);
  env.controls.user.id = 8; env.controls.user.perfilId = 100;
  const replay = await env.call('POST', input({ clientKey: key.toUpperCase() }));
  assert.equal(replay.body.registro.id, first.body.registro.id); assert.equal(replay.body.registro.recordName, 'Cambio de admin QA');
  assert.equal(replay.body.registro.savedById, 9); assert.equal(env.records.size, 2);
  assert.equal(env.records.get(first.body.registro.id).creationKey, '8:100:' + key);
});

test('legacy POST sigue creando y PATCH sin expectedRevision incrementa la revisión', async () => {
  const env = environment(); const body = input(); delete body.clientKey;
  const first = await env.call('POST', body); const second = await env.call('POST', body);
  assert.notEqual(first.body.registro.id, second.body.registro.id); assert.equal(first.body.replayed, false);
  const updated = await env.call('PATCH', { ...body, id: first.body.registro.id });
  assert.equal(updated.status, 200); assert.equal(updated.body.registro.revision, 2);
});

test('PATCH inexistente o eliminado devuelve 404, separado del conflicto de revisión', async () => {
  const env = environment(); assert.equal((await env.call('PATCH', input({ id: 999, expectedRevision: 1 }))).status, 404);
  const created = await env.call('POST', input()); const id = created.body.registro.id;
  assert.equal((await env.call('DELETE', undefined, '?id=' + id)).status, 403);
  env.controls.user.rolNombre = 'ADMIN'; assert.equal((await env.call('DELETE', undefined, '?id=' + id)).status, 200);
  const missing = await env.call('PATCH', input({ id, expectedRevision: 1 })); assert.equal(missing.status, 404); assert.notEqual(missing.body.code, 'REVISION_CONFLICT');
});

test('clientKey, revisión y filas inválidas se rechazan por completo sin tocar almacenamiento', async () => {
  const env = environment();
  for (const bad of ['', 'not-a-uuid', null, 123, key + 'x']) assert.equal((await env.call('POST', input({ clientKey: bad }))).status, 400);
  for (const bad of [null, 0, -1, 1.5, '1', 2147483648]) assert.equal((await env.call('PATCH', input({ id: 1, expectedRevision: bad }))).status, 400);
  const mutations = [row => ({ ...row, status: 'INVALIDO' }), row => ({ ...row, paidInFull: 'false' }),
    row => ({ ...row, pay40At60: 2 }), row => ({ ...row, loanAgeDays: 'NaN' }), row => ({ ...row, cedula: { value: 'secret' } }),
    row => ({ ...row, id: '' }), row => { const result = { ...row }; delete result.numberOfPayments; return result; }];
  for (const mutation of mutations) for (const method of ['POST', 'PATCH']) {
    const value = rows(); value[31] = mutation(value[31]);
    assert.equal((await env.call(method, input({ id: 1, rows: value }))).status, 400);
  }
  const duplicates = rows(); duplicates[31].id = duplicates[0].id;
  assert.equal((await env.call('POST', input({ rows: duplicates }))).status, 400);
  assert.equal(env.queries.length, 0); assert.equal(env.schema.length, 0); assert.equal(env.records.size, 0);
});

test('store también rechaza filas incompletas y revisiones inválidas antes de enviar SQL', async () => {
  const env = environment(); const value = { ...input(), filteredRows: 32, summary: { aprobados: 16, noAprobados: 16, cedulasEncontradas: 1, cedulasPendientes: 31 }, savedBy: { id: 8, perfilId: 100, nombre: 'QA', usuario: 'qa' } };
  await assert.rejects(env.store.saveStoredFortySixtyRecord({ ...value, rows: [...value.rows, { status: 'INVALIDO' }] }), /fila inválida/);
  await assert.rejects(env.store.updateStoredFortySixtyRecord({ ...value, id: 1, expectedRevision: 0 }), /revisión/);
  await assert.rejects(env.store.saveStoredFortySixtyRecord({ ...value, clientKey: 'invalid' }), /identificación/);
  assert.equal(env.queries.length, 0); assert.equal(env.schema.length, 0);
});

test('lectura legacy normaliza campos opcionales y números de texto sin perder filas ni inventar una fecha base', async () => {
  const env = environment(); const created = await env.call('POST', input()); const id = created.body.registro.id;
  const stored = env.records.get(id);
  stored.rows[0] = { ...stored.rows[0], loanAgeDays: '58', numberOfPayments: '3', loanRepaymentBiweek: '', pay40At60: '1' };
  delete stored.rows[0].paidInFull; delete stored.rows[0].merchantName; delete stored.rows[0].cedula;
  const detail = await env.call('GET', undefined, '?id=' + id);
  assert.equal(detail.status, 200); assert.equal(detail.body.registro.rows.length, 32);
  assert.equal(detail.body.registro.rows[0].loanAgeDays, 58); assert.equal(detail.body.registro.rows[0].numberOfPayments, 3);
  assert.equal(detail.body.registro.rows[0].loanRepaymentBiweek, null); assert.equal(detail.body.registro.rows[0].pay40At60, 1);
  assert.equal(detail.body.registro.rows[0].paidInFull, false); assert.equal(detail.body.registro.rows[0].merchantName, '');
  assert.equal(detail.body.registro.ageReferenceDate, null);
  stored.rows[31].status = 'CORRUPTO';
  assert.equal((await env.call('GET', undefined, '?id=' + id)).status, 500, 'Never silently omit a corrupt legacy row');
});

test('se conservan los números negativos finitos del archivo sin imponer nuevas reglas de negocio', async () => {
  const env = environment(); const value = rows(); value[0].loanAgeDays = -1; value[0].numberOfPayments = -2; value[0].loanRepaymentBiweek = -3;
  const created = await env.call('POST', input({ rows: value }));
  assert.equal(created.status, 200); assert.deepEqual(created.body.registro.rows[0], value[0]);
});

test('fecha base de edad persiste sin modificar edades crudas, omisión legacy conserva y replay no recalibra', async () => {
  const env = environment(); const created = await env.call('POST', input({ ageReferenceDate: '2020-02-29' })); const id = created.body.registro.id;
  assert.equal(created.body.registro.ageReferenceDate, '2020-02-29'); assert.equal(created.body.registro.rows[0].loanAgeDays, 58);
  const omitted = await env.call('PATCH', input({ id, expectedRevision: 1 }));
  assert.equal(omitted.body.registro.ageReferenceDate, '2020-02-29');
  const calibrated = await env.call('PATCH', input({ id, expectedRevision: 2, ageReferenceDate: '2020-03-01' }));
  assert.equal(calibrated.body.registro.ageReferenceDate, '2020-03-01');
  assert.equal((await env.call('GET')).body.registros[0].ageReferenceDate, '2020-03-01');
  const replay = await env.call('POST', input({ ageReferenceDate: '2020-01-01' }));
  assert.equal(replay.body.registro.ageReferenceDate, '2020-03-01'); assert.equal(replay.body.registro.rows[0].loanAgeDays, 58);
});

test('fecha legacy queda desconocida y fechas imposibles/futuras no llegan al store', async () => {
  const env = environment(); const created = await env.call('POST', input());
  assert.equal(created.body.registro.ageReferenceDate, null);
  const count = env.queries.length;
  for (const value of ['2025-02-29', '2024-02-30', '2999-01-01', '2020-2-01', '', 123, '0000-01-01']) {
    for (const method of ['POST', 'PATCH']) assert.equal((await env.call(method, input({ id: created.body.registro.id, ageReferenceDate: value }))).status, 400);
  }
  assert.equal(env.queries.length, count);
  assert.match(env.schema.join('\n'), /ADD COLUMN IF NOT EXISTS age_reference_date DATE/);
  assert.doesNotMatch(env.schema.join('\n'), /UPDATE .*age_reference_date|SET age_reference_date/s);
  assert.match(env.schema.join('\n'), /ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1/);
  assert.match(env.schema.join('\n'), /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*\(creation_key\)/);
});
