import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextResponse } = require('next/server');
const compiled = ts.transpileModule(readFileSync(new URL('../app/api/payjoy/40-60/registros/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const fixtureRows = () => Array.from({ length: 32 }, (_, i) => ({
  id: 'qa-' + i, week: '2026-10-19', merchantName: 'Comercio QA', deviceTag: 'QA' + String(i).padStart(6, '0'),
  loanAgeDays: 50, numberOfPayments: i, loanRepaymentBiweek: 125000, cedula: i === 25 ? '000123456789' : '',
  status: i % 2 ? '40/60 APROBADO' : '40/60 NO APROBADO', pay40At60: i % 2, paidInFull: false,
}));
const input = () => ({ id: 71, recordName: 'Avance QA', week: '2026-10-19', fileName: 'archivo-qa.xlsx', sheetName: 'Transacciones', totalRows: 64, filteredRows: 1, summary: { aprobados: 999 }, rows: fixtureRows(), savedBy: { id: 999, nombre: 'Autor forjado', usuario: 'forjado' } });
const request = (method, body, query = '') => new Request('https://qa.invalid/api/payjoy/40-60/registros' + query, {
  method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});

// Load the actual route. The only replaceable boundaries are authentication and local storage.
// Unknown dependencies fail immediately; Prisma, network and PayJoy are never loaded.
function environment(role = 'ADMIN') {
  const controls = { role, failUpdate: false };
  const calls = [];
  const initial = { ...input(), filteredRows: 32, summary: { aprobados: 16, noAprobados: 16, cedulasEncontradas: 1, cedulasPendientes: 31 }, savedAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };
  const records = new Map([[71, structuredClone(initial)]]);
  const metadata = record => { const { rows, ...result } = record; void rows; return result; };
  function persisted(value, id) {
    const previous = records.get(id);
    const { savedBy, ...data } = value;
    return { ...structuredClone(data), id, savedById: savedBy.id, savedByName: savedBy.nombre, savedByUser: savedBy.usuario, savedAt: previous?.savedAt || '2026-10-28T15:00:00Z', updatedAt: '2026-10-28T15:00:00Z' };
  }
  const store = {
    async getStoredFortySixtyRecordById(id) { calls.push({ method: 'get', id }); return structuredClone(records.get(id) || null); },
    async listStoredFortySixtyRecords() { calls.push({ method: 'list' }); return [...records.values()].map(metadata); },
    async saveStoredFortySixtyRecord(value) {
      calls.push({ method: 'create', value }); const record = persisted(value, 72); records.set(record.id, record); return metadata(record);
    },
    async updateStoredFortySixtyRecord(value) {
      calls.push({ method: 'update', value });
      if (controls.failUpdate) throw Error('Fallo de almacenamiento QA');
      if (!records.has(value.id)) return null;
      const record = persisted(value, value.id); records.set(record.id, record); return metadata(record);
    },
    async deleteStoredFortySixtyRecordById(id) { calls.push({ method: 'delete', id }); return records.delete(id); },
  };
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', 'console', compiled)(name => {
    if (name === 'next/server') return { NextResponse };
    if (name === '@/lib/auth') return { getSessionUser: async () => controls.role === null ? null : { id: 8, rolNombre: controls.role, nombre: 'Autor sesión QA', usuario: 'qa' } };
    if (name === '@/lib/payjoy-40-60-store') return store;
    throw Error('Dependencia inesperada en prueba aislada: ' + name);
  }, loaded, loaded.exports, { error() {} });
  return { route: loaded.exports, calls, controls, records };
}

for (const [role, status] of [[null, 401], ['SEDE', 403], ['VENDEDOR', 403], ['BODEGA', 403], ['FACTURADOR', 403]]) {
  test(`rol ${role ?? 'sin sesión'} no consulta ni modifica registros 40/60`, async () => {
    const env = environment(role);
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const response = await env.route[method](request(method, ['POST', 'PATCH'].includes(method) ? input() : undefined, '?id=71'));
      assert.equal(response.status, status, method); assert.equal(env.calls.length, 0, 'No debe llegar al almacenamiento');
    }
    assert.equal(env.records.size, 1);
  });
}

for (const role of ['ADMIN', 'AUDITOR']) {
  test(`${role} guarda y vuelve a consultar 32 filas completas en el mismo registro`, async () => {
    const env = environment(role); const body = input(); body.recordName = 'Nombre editado QA'; body.rows[25].status = '40/60 NO APROBADO';
    const saved = await env.route.PATCH(request('PATCH', body)); assert.equal(saved.status, 200); const savedPayload = await saved.json(); assert.equal(savedPayload.registro.id, 71);
    const read = await env.route.GET(request('GET', undefined, '?id=71')); assert.equal(read.status, 200); const result = (await read.json()).registro;
    assert.deepEqual(result.rows, body.rows); assert.equal(result.rows[25].cedula, '000123456789'); assert.equal(result.recordName, body.recordName); assert.equal(result.fileName, body.fileName); assert.equal(result.week, body.week); assert.equal(result.filteredRows, 32); assert.equal(result.totalRows, 64);
    assert.deepEqual(result.summary, { aprobados: 15, noAprobados: 17, cedulasEncontradas: 1, cedulasPendientes: 31 });
    assert.equal(result.savedById, 8); assert.equal(result.savedByName, 'Autor sesión QA'); assert.equal(result.savedByUser, 'qa'); assert.equal(result.savedAt, '2026-10-20T12:00:00Z'); assert.equal(result.updatedAt, '2026-10-28T15:00:00Z');
    const history = (await (await env.route.GET(request('GET'))).json()).registros; assert.equal(history.length, 1); assert.equal(history[0].recordName, body.recordName); assert.equal(env.records.size, 1);
    assert.deepEqual(env.calls.map(call => call.method), ['update', 'get', 'list']);
  });
}

test('POST crea el registro nuevo y PATCH posterior conserva su ID y todas sus filas', async () => {
  const env = environment(); const body = input(); delete body.id;
  const created = await env.route.POST(request('POST', body)); assert.equal(created.status, 200); const id = (await created.json()).registro.id;
  assert.equal(id, 72); body.rows[0].cedula = '000555'; assert.equal((await env.route.PATCH(request('PATCH', { ...body, id }))).status, 200);
  assert.equal(env.records.size, 2); assert.equal(env.records.get(id).rows[0].cedula, '000555'); assert.equal(env.records.get(id).rows.length, 32);
  assert.deepEqual(env.calls.map(call => call.method), ['create', 'update']);
});

test('PATCH inválido, inexistente y fallido no reemplaza el avance persistido', async () => {
  const env = environment(); const before = structuredClone(env.records.get(71));
  for (const body of [{ ...input(), id: 0 }, { ...input(), id: 'no-numérico' }, { ...input(), rows: [] }, { ...input(), rows: [{ status: 'INVALIDO' }] }]) {
    assert.equal((await env.route.PATCH(request('PATCH', body))).status, 400); assert.equal(env.calls.length, 0);
  }
  assert.equal((await env.route.PATCH(request('PATCH', { ...input(), id: 999 }))).status, 404);
  env.controls.failUpdate = true;
  assert.equal((await env.route.PATCH(request('PATCH', { ...input(), recordName: 'No persistir QA' }))).status, 500);
  assert.deepEqual(env.records.get(71), before); assert.equal(env.records.size, 1);
});

test('AUDITOR no elimina y ADMIN conserva su permiso de borrado', async () => {
  const env = environment('AUDITOR'); assert.equal((await env.route.DELETE(request('DELETE', undefined, '?id=71'))).status, 403); assert.equal(env.calls.length, 0); assert.equal(env.records.size, 1);
  env.controls.role = 'ADMIN'; assert.equal((await env.route.DELETE(request('DELETE', undefined, '?id=71'))).status, 200); assert.equal(env.records.size, 0); assert.deepEqual(env.calls.map(call => call.method), ['delete']);
});
