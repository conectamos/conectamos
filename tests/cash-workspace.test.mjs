import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const source = path => readFileSync(join(ROOT, path), 'utf8');
const apiPath = 'app/api/caja/route.ts';
const exportPath = 'app/api/caja/export/route.ts';
const supervisor = { id: 10, nombre: 'Usuario QA', sedeId: 1, sedeNombre: 'SEDE 1', rolNombre: 'SUPERVISOR', perfilTipo: 'SUPERVISOR_TIENDA' };
const administrator = { ...supervisor, rolNombre: 'ADMIN', perfilTipo: 'ADMINISTRADOR' };
const auditor = { ...supervisor, rolNombre: 'AUDITOR', perfilTipo: 'AUDITOR' };

function load(path, imports = {}, injected = {}, transform = value => value) {
  const output = ts.transpileModule(transform(source(path)), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'console', ...Object.keys(injected), output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, module, module.exports, { error() {}, warn() {} }, ...Object.values(injected));
  return module.exports;
}
const access = load('lib/access-control.ts');
const salesFinance = load('lib/ventas-financieras.ts');
const dates = load('lib/ventas-utils.ts', { '@/lib/ventas-financieras': salesFinance });
const caja = load('lib/caja-movimientos.ts', { '@/lib/ventas-utils': dates });
class MockNextResponse extends Response {
  static json(body, options = {}) { return Response.json(body, options); }
}

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(part => matches(row, part));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const actual = row[key];
      const normalized = input => value.mode === 'insensitive' ? String(input ?? '').toLowerCase() : input;
      if ('contains' in value) return String(normalized(actual) ?? '').includes(normalized(value.contains));
      if ('equals' in value) return normalized(actual) === normalized(value.equals);
      if ('gte' in value && !(new Date(actual) >= value.gte)) return false;
      if ('gt' in value && !(new Date(actual) > value.gt)) return false;
      if ('lt' in value && !(new Date(actual) < value.lt)) return false;
      if ('lte' in value && !(new Date(actual) <= value.lte)) return false;
      if (['gte', 'gt', 'lt', 'lte'].some(operator => operator in value)) return true;
      if ('in' in value) return value.in.includes(actual);
      return matches(actual || {}, value);
    }
    return row[key] === value;
  });
}
function project(row, select) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, value]) => [key,
    value === true || row[key] == null ? row[key] : project(row[key], value.select),
  ]));
}
function ordered(rows, orderBy) {
  const sorts = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return [...rows].sort((left, right) => {
    for (const sort of sorts) {
      for (const [field, direction] of Object.entries(sort)) {
        const a = field === 'createdAt' ? new Date(left[field]).getTime() : left[field];
        const b = field === 'createdAt' ? new Date(right[field]).getTime() : right[field];
        if (a !== b) return (a > b ? 1 : -1) * (direction === 'desc' ? -1 : 1);
      }
    }
    return 0;
  });
}
const movement = {
  id: 1, tipo: 'INGRESO', concepto: 'Movimiento manual QA', valor: '1000.25', descripcion: 'Descripción completa QA',
  sedeId: 1, sede: { nombre: 'SEDE 1' }, createdAt: new Date('2026-10-09T15:34:27.123Z'),
};
const rows = [
  ...Array.from({ length: 347 }, (_, index) => ({
    ...movement, id: index + 1,
    tipo: index % 3 === 0 ? 'INGRESO' : 'EGRESO', valor: index % 3 === 0 ? '1000.25' : '2000.75',
    concepto: index === 0 ? 'Referencia fuera del límite 300 QA' : 'Movimiento manual QA',
    descripcion: index === 1 ? 'Descripción única buscable QA' : movement.descripcion,
    createdAt: new Date(Date.UTC(2026, 9, 9, 15, 34, index % 60, 123)),
  })),
  { ...movement, id: 801, sedeId: 2, sede: { nombre: 'ONLINE QA' }, concepto: 'Agua sede ajena QA', valor: '990000.5' },
  { ...movement, id: 802, concepto: 'GASTO CARTERA', valor: '777777.75' },
  { ...movement, id: 803, concepto: 'PAGO DEUDA INVENTARIO', valor: '100.25', tipo: 'EGRESO' },
  { ...movement, id: 804, concepto: 'ABONO FINANCIERA', valor: '200.5' },
];

function probe(user = supervisor, { data = rows, fail = false } = {}) {
  const calls = []; const mutations = [];
  const filtered = args => {
    if (fail) throw Error('Fallo de datos QA');
    return data.filter(row => matches(row, args.where));
  };
  const database = {
    cajaMovimiento: {
      findMany: async args => {
        calls.push({ method: 'findMany', ...args });
        const found = ordered(filtered(args), args.orderBy);
        return found.slice(args.skip || 0, args.take == null ? undefined : (args.skip || 0) + args.take).map(row => project(row, args.select));
      },
      findFirst: async args => {
        calls.push({ method: 'findFirst', ...args });
        const found = ordered(filtered(args), args.orderBy)[0];
        return found ? project(found, args.select) : null;
      },
      count: async args => { calls.push({ method: 'count', ...args }); return filtered(args).length; },
      groupBy: async args => {
        calls.push({ method: 'groupBy', ...args });
        const totals = new Map();
        for (const row of filtered(args)) totals.set(row.tipo, (totals.get(row.tipo) || 0) + Number(row.valor));
        return [...totals].map(([tipo, valor]) => ({ tipo, _sum: { valor } }));
      },
      findUnique: async args => {
        calls.push({ method: 'findUnique', ...args });
        const found = data.find(row => matches(row, args.where));
        return found ? project(found, args.select) : null;
      },
      update: async args => {
        mutations.push({ method: 'update', ...args });
        return { ...data.find(row => row.id === args.where.id), ...args.data };
      },
      delete: async args => { mutations.push({ method: 'delete', ...args }); return { id: args.where.id }; },
      create: async args => { mutations.push({ method: 'create', ...args }); return { id: 900, createdAt: movement.createdAt, ...args.data }; },
    },
    sede: { findUnique: async args => { calls.push({ method: 'sede.findUnique', ...args }); return args.where.id === 2 ? { nombre: 'ONLINE QA' } : { nombre: 'SEDE 1' }; } },
  };
  const imports = {
    'next/server': { NextResponse: MockNextResponse },
    '@/lib/prisma': { __esModule: true, default: database },
    '@/lib/auth': { getSessionUser: async () => user }, '@/lib/access-control': access, '@/lib/caja-movimientos': caja,
    exceljs: { __esModule: true, default: ExcelJS },
  };
  return { ...load(apiPath, imports), exportGET: load(exportPath, imports).GET, registerPOST: load('app/api/caja/registrar/route.ts', imports).POST, calls, mutations };
}
async function get(instance, params = '') {
  const response = await instance.GET(new Request(`http://qa.local/api/caja${params ? `?${params}` : ''}`));
  return { response, body: await response.json() };
}
async function workbook(instance, params = '') {
  const response = await instance.exportGET(new Request(`http://qa.local/api/caja/export${params ? `?${params}` : ''}`));
  const book = new ExcelJS.Workbook();
  assert.equal(response.status, 200);
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  return { response, book, sheet: book.getWorksheet('Movimientos'), summary: book.getWorksheet('Resumen') };
}
function expectedTotals(data) {
  const totalIngresos = data.filter(row => row.tipo === 'INGRESO').reduce((sum, row) => sum + Number(row.valor), 0);
  const totalEgresos = data.filter(row => row.tipo === 'EGRESO').reduce((sum, row) => sum + Number(row.valor), 0);
  return { totalIngresos, totalEgresos, saldo: totalIngresos - totalEgresos, totalMovimientos: data.length };
}
const ownRows = rows.filter(row => row.sedeId === 1 && row.concepto !== 'GASTO CARTERA');
const allRows = rows.filter(row => row.concepto !== 'GASTO CARTERA');

test('caja y Excel rechazan falta de sesión y perfiles vendedor, apoyo y facturador antes de consultar datos', async () => {
  for (const user of [null, ...['VENDEDOR', 'APOYO_OPERATIVO', 'FACTURADOR'].map(perfilTipo => ({ ...administrator, perfilTipo }))]) {
    const instance = probe(user);
    for (const params of ['', 'resumen=1', 'paginated=1&q=Agua&sedeId=2']) assert.equal((await get(instance, params)).response.status, user ? 403 : 401);
    const response = await instance.exportGET(new Request('http://qa.local/api/caja/export?sedeId=2'));
    assert.equal(response.status, user ? 403 : 401); assert.deepEqual(instance.calls, []);
  }
});

test('supervisor conserva su sede aunque manipule cobertura; perfil administrativo sin rol no amplía alcance', async () => {
  for (const user of [supervisor, { ...supervisor, perfilTipo: 'ADMINISTRADOR' }]) {
    for (const sedeId of ['', '1', '2', '9999', '-1', '2.5']) {
      const instance = probe(user); const { response, body } = await get(instance, `paginated=1&sedeId=${sedeId}`);
      assert.equal(response.status, 200); assert.equal(body.total, ownRows.length); assert.deepEqual(body.resumen, expectedTotals(ownRows));
      assert.ok(body.movimientos.every(row => row.sedeId === 1));
      assert.ok(instance.calls.filter(call => call.where).every(call => call.where.sedeId === 1));
    }
  }
});

test('ADMIN y AUDITOR mantienen cobertura global o sede exacta elegida', async () => {
  for (const user of [administrator, auditor]) {
    assert.equal((await get(probe(user), 'paginated=1')).body.total, allRows.length);
    const { body } = await get(probe(user), 'paginated=1&sedeId=2');
    assert.equal(body.total, 1); assert.equal(body.movimientos[0].id, 801); assert.equal(body.resumen.totalIngresos, 990000.5);
    assert.equal((await get(probe(user), 'paginated=1&sedeId=9999')).body.total, 0);
  }
});

test('resumen paginado conserva fórmulas y universo del contrato anterior, sin sumar solo la página', async () => {
  const instance = probe(); const legacy = (await get(instance, 'resumen=1&limit=0')).body;
  const first = (await get(instance, 'paginated=1&pageSize=10')).body;
  const second = (await get(instance, 'paginated=1&pageSize=10&page=2')).body;
  assert.deepEqual(first.resumen, legacy.resumen); assert.deepEqual(second.resumen, legacy.resumen);
  assert.deepEqual(first.resumen, expectedTotals(ownRows)); assert.ok(first.resumen.saldo < 0);
  assert.equal(first.movimientos.length, 10); assert.notEqual(first.resumen.totalIngresos, expectedTotals(first.movimientos).totalIngresos);
  assert.ok(!first.movimientos.some(row => row.concepto === 'GASTO CARTERA'));
});

test('búsqueda consulta concepto más allá de los primeros 300 y respeta ID, tipo, descripción y nombre de sede', async () => {
  for (const [q, expectedIds] of [[' fuera del LÍMITE 300 ', [1]], ['descripción única', [2]], ['#000347', [347]], ['347', [347]]]) {
    const { body } = await get(probe(), `paginated=1&q=${encodeURIComponent(q)}`);
    assert.equal(body.total, expectedIds.length); assert.deepEqual(body.movimientos.map(row => row.id), expectedIds);
    assert.deepEqual(body.resumen, expectedTotals(ownRows.filter(row => expectedIds.includes(row.id))));
  }
  const expenses = (await get(probe(), 'paginated=1&q=egreso')).body;
  assert.equal(expenses.total, ownRows.filter(row => row.tipo === 'EGRESO').length); assert.equal(expenses.resumen.totalIngresos, 0);
  const foreign = (await get(probe(administrator), 'paginated=1&q=online')).body;
  assert.equal(foreign.total, 1); assert.equal(foreign.movimientos[0].id, 801);
  assert.equal((await get(probe(), 'paginated=1&q=online&sedeId=2')).body.total, 0);
});

test('cobertura, búsqueda y fechas se combinan para filas, totales y último movimiento', async () => {
  const instance = probe(administrator);
  const { body } = await get(instance, 'paginated=1&sedeId=1&q=egreso&fechaDesde=2026-10-09&fechaHasta=2026-10-09&page=2');
  assert.ok(body.movimientos.every(row => row.sedeId === 1 && row.tipo === 'EGRESO'));
  assert.deepEqual(body.resumen, expectedTotals(ownRows.filter(row => row.tipo === 'EGRESO')));
  const queries = instance.calls.filter(call => ['findMany', 'findFirst', 'count', 'groupBy'].includes(call.method));
  assert.equal(queries.length, 4); assert.ok(queries.every(call => JSON.stringify(call.where) === JSON.stringify(queries[0].where)));
  assert.equal(body.ultimoMovimiento.id, 803); assert.notEqual(body.movimientos[0].id, body.ultimoMovimiento.id);
});

test('páginas y tamaños reales recorren todos los resultados sin duplicados ni omisiones', async () => {
  for (const pageSize of [10, 20, 50, 100]) {
    const instance = probe(); const initial = (await get(instance, `paginated=1&pageSize=${pageSize}`)).body;
    const ids = [];
    for (let page = 1; page <= initial.totalPages; page++) {
      const { body } = await get(instance, `paginated=1&pageSize=${pageSize}&page=${page}`);
      assert.equal(body.page, page); assert.equal(body.pageSize, pageSize); assert.equal(body.total, ownRows.length);
      assert.equal(body.movimientos.length, Math.min(pageSize, body.total - (page - 1) * pageSize));
      assert.equal(body.ultimoMovimiento.id, 804); ids.push(...body.movimientos.map(row => row.id));
    }
    assert.equal(new Set(ids).size, ownRows.length); assert.deepEqual(ids, ownRows.map(row => row.id).sort((a, b) => b - a));
  }
});

test('paginación inválida se normaliza y página excesiva se ajusta a la última', async () => {
  for (const page of ['-1', '0', '1.5', 'abc', '9007199254740992']) assert.equal((await get(probe(), `paginated=1&page=${page}`)).body.page, 1);
  for (const pageSize of ['0', '-1', '6', '1.5', '9999', 'abc']) assert.equal((await get(probe(), `paginated=1&pageSize=${pageSize}`)).body.pageSize, 10);
  const { body } = await get(probe(), 'paginated=1&pageSize=20&page=999999');
  assert.equal(body.page, body.totalPages); assert.equal(body.movimientos.length, ownRows.length % 20);
});

test('sin resultados devuelve indicadores cero, último nulo y contador de página coherente', async () => {
  const { response, body } = await get(probe(), 'paginated=1&q=NoExisteQA&page=999');
  assert.equal(response.status, 200); assert.deepEqual(body.movimientos, []); assert.deepEqual(body.resumen, expectedTotals([]));
  assert.equal(body.total, 0); assert.equal(body.page, 1); assert.equal(body.totalPages, 1); assert.equal(body.ultimoMovimiento, null);
});

test('fechas usan límites Bogotá inclusivo/exclusivo y preservan timestamp y milisegundos completos', async () => {
  const boundary = [
    { ...movement, id: 1, createdAt: new Date('2026-10-09T04:59:59.999Z') },
    { ...movement, id: 2, createdAt: new Date('2026-10-09T05:00:00.000Z') },
    { ...movement, id: 3, createdAt: new Date('2026-10-10T04:59:59.999Z') },
    { ...movement, id: 4, createdAt: new Date('2026-10-10T05:00:00.000Z') },
  ];
  const priorTimeZone = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Bogota', 'Asia/Tokyo', 'Pacific/Honolulu']) {
      process.env.TZ = zone;
      const instance = probe(supervisor, { data: boundary });
      const { body } = await get(instance, 'paginated=1&fechaDesde=2026-10-09&fechaHasta=2026-10-09');
      assert.deepEqual(body.movimientos.map(row => row.id), [3, 2]); assert.equal(body.total, 2);
      assert.equal(body.ultimoMovimiento.createdAt, '2026-10-10T04:59:59.999Z');
      assert.equal(body.rango.label, '09/10/2026');
      assert.equal(instance.calls[0].where.createdAt.gte.toISOString(), '2026-10-09T05:00:00.000Z');
      assert.equal(instance.calls[0].where.createdAt.lt.toISOString(), '2026-10-10T05:00:00.000Z');
    }
  } finally {
    if (priorTimeZone === undefined) delete process.env.TZ; else process.env.TZ = priorTimeZone;
  }
  assert.deepEqual((await get(probe(supervisor, { data: boundary }), 'paginated=1&fechaDesde=2026-10-09')).body.movimientos.map(row => row.id), [4, 3, 2]);
  assert.deepEqual((await get(probe(supervisor, { data: boundary }), 'paginated=1&fechaHasta=2026-10-09')).body.movimientos.map(row => row.id), [3, 2, 1]);
});

test('rango inválido produce 400 antes de consultar o exportar datos', async () => {
  for (const params of ['fechaDesde=ayer', 'fechaHasta=2026-99-99', 'fechaDesde=2026-10-10&fechaHasta=2026-10-09']) {
    const instance = probe();
    assert.equal((await get(instance, `paginated=1&${params}`)).response.status, 400);
    assert.equal((await instance.exportGET(new Request(`http://qa.local/api/caja/export?${params}`))).status, 400);
    assert.deepEqual(instance.calls, []);
  }
});

test('contrato legacy conserva array, límites 300/1000, resumen opcional e ignora búsqueda nueva', async () => {
  const large = Array.from({ length: 1107 }, (_, index) => ({ ...movement, id: index + 1 }));
  const instance = probe(supervisor, { data: large });
  const legacy = (await get(instance)).body;
  assert.ok(Array.isArray(legacy)); assert.equal(legacy.length, 300); assert.equal(legacy[0].id, 1107);
  assert.equal((await get(instance, 'limit=9999')).body.length, 1000);
  assert.equal((await get(instance, 'limit=5')).body.length, 5);
  assert.equal((await get(instance, 'q=NoExisteQA')).body.length, 300);
  const summary = (await get(instance, 'resumen=si&limit=0')).body;
  assert.deepEqual(summary.movimientos, []); assert.deepEqual(summary.resumen, expectedTotals(large));
  assert.ok(!('totalPages' in summary)); assert.ok(!('ultimoMovimiento' in summary));
});

test('conceptos automáticos conservan protección de edición y la exclusión específica de cartera', async () => {
  const automatic = [...caja.CONCEPTOS_PROTEGIDOS].map((concepto, index) => ({ ...movement, id: index + 1, concepto }));
  const { body } = await get(probe(administrator, { data: automatic }), 'paginated=1');
  assert.equal(body.total, automatic.length - 1); assert.ok(body.movimientos.every(row => row.editable === false));
  assert.ok(!body.movimientos.some(row => row.concepto === 'GASTO CARTERA'));
  assert.equal(caja.esMovimientoEditable('  abono financiera  '), false); assert.equal(caja.esMovimientoEditable('Agua'), true);
});

test('Excel exporta todos los resultados filtrados aunque se reciba una página o límite', async () => {
  const instance = probe();
  const { response, sheet, summary } = await workbook(instance, 'q=movimiento&fechaDesde=2026-10-09&fechaHasta=2026-10-09&sedeId=2&page=2&pageSize=10&limit=10');
  const expected = ownRows.filter(row => row.concepto === 'Movimiento manual QA');
  assert.equal(sheet.rowCount, expected.length + 1); assert.ok(sheet.rowCount > 300);
  assert.deepEqual(new Set(sheet.getRows(2, expected.length).map(row => row.getCell(1).value)), new Set(expected.map(row => row.id)));
  assert.equal(summary.getCell('B4').value, 'SEDE 1'); assert.equal(summary.getCell('B5').value, '09/10/2026');
  assert.equal(summary.getCell('B6').value, expected.length);
  const totals = expectedTotals(expected); assert.equal(summary.getCell('B7').value, totals.totalIngresos); assert.equal(summary.getCell('B8').value, totals.totalEgresos); assert.equal(summary.getCell('B9').value, totals.saldo);
  assert.equal(summary.getCell('B11').value, 'movimiento');
  const find = instance.calls.find(call => call.method === 'findMany'); assert.ok(!('skip' in find)); assert.ok(!('take' in find));
  assert.match(response.headers.get('Content-Type'), /spreadsheetml/); assert.match(response.headers.get('Content-Disposition'), /movimientos-caja-sede-1-2026-10-09\.xlsx/);
});

test('Excel y consulta comparten exactamente búsqueda, fechas y cobertura sin exponer otras sedes', async () => {
  for (const user of [administrator, auditor, supervisor]) {
    const instance = probe(user); const params = 'q=online&sedeId=2&fechaDesde=2026-10-09&fechaHasta=2026-10-09';
    const listing = (await get(instance, `paginated=1&${params}`)).body;
    const { sheet, summary } = await workbook(instance, params);
    assert.equal(summary.getCell('B6').value, listing.total);
    assert.equal(summary.getCell('B7').value, listing.resumen.totalIngresos);
    assert.equal(summary.getCell('B8').value, listing.resumen.totalEgresos);
    assert.equal(summary.getCell('B9').value, listing.resumen.saldo);
    assert.equal(summary.getCell('B4').value, user === supervisor ? 'SEDE 1' : 'ONLINE QA');
    const exportQuery = instance.calls.filter(call => call.method === 'findMany').at(-1);
    const listQuery = instance.calls.find(call => call.method === 'count'); assert.deepEqual(exportQuery.where, listQuery.where);
    if (listing.total) assert.deepEqual(sheet.getRows(2, listing.total).map(row => row.getCell(1).value), listing.movimientos.map(row => row.id));
    else assert.match(sheet.getCell('E2').value, /Sin movimientos/);
  }
});

test('Excel mantiene números completos con centavos y hora Bogotá hasta segundos sin depender del huso del servidor', async () => {
  const fixture = [{ ...movement, valor: '4819431650.87', createdAt: new Date('2026-10-09T01:34:27.123Z') }];
  const priorTimeZone = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Bogota', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      const { sheet, summary } = await workbook(probe(administrator, { data: fixture }));
      assert.equal(sheet.getCell('F2').value, 4819431650.87); assert.equal(typeof sheet.getCell('F2').value, 'number');
      assert.equal(summary.getCell('B7').value, 4819431650.87);
      assert.match(sheet.getColumn(6).numFmt, /0\.#+/); assert.match(summary.getCell('B7').numFmt, /0\.#+/);
      assert.equal(sheet.getCell('B2').value.toISOString(), '2026-10-08T20:34:27.123Z'); assert.match(sheet.getColumn(2).numFmt, /hh:mm:ss/);
    }
  } finally {
    if (priorTimeZone === undefined) delete process.env.TZ; else process.env.TZ = priorTimeZone;
  }
});

test('fallo de datos devuelve error, nunca indicadores cero ni un Excel de éxito', async () => {
  const instance = probe(administrator, { fail: true });
  for (const params of ['', 'resumen=1', 'paginated=1']) {
    const { response, body } = await get(instance, params); assert.equal(response.status, 500); assert.ok(body.error); assert.ok(!body.resumen);
  }
  const failed = await instance.exportGET(new Request('http://qa.local/api/caja/export'));
  assert.equal(failed.status, 500); assert.ok((await failed.json()).error); assert.ok(!failed.headers.get('Content-Disposition'));
});

const editBody = { tipo: 'EGRESO', concepto: 'Concepto editado QA', valor: 1234567.89, descripcion: 'Descripción QA', sedeId: 2 };
function editRequest(body = editBody, id = '1') { return new Request(`http://qa.local/api/caja?id=${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

test('edición conserva roles autorizados, centavos y campos existentes sin modificar fecha original', async () => {
  for (const user of [administrator, auditor]) {
    const instance = probe(user);
    const response = await instance.PUT(editRequest()); assert.equal(response.status, 200); assert.equal((await response.json()).movimiento.valor, 1234567.89);
    assert.deepEqual(instance.mutations[0].data, editBody); assert.ok(!('createdAt' in instance.mutations[0].data));
  }
  for (const user of [null, supervisor, { ...administrator, perfilTipo: 'VENDEDOR' }, { ...administrator, perfilTipo: 'FACTURADOR' }]) {
    const instance = probe(user); assert.equal((await instance.PUT(editRequest())).status, user ? 403 : 401); assert.deepEqual(instance.mutations, []);
  }
});

test('edición mantiene validaciones, inexistentes y bloqueo de movimientos automáticos', async () => {
  for (const [body, id] of [[{ ...editBody, tipo: 'OTRO' }, '1'], [{ ...editBody, concepto: '  ' }, '1'], [{ ...editBody, valor: 0 }, '1'], [{ ...editBody, valor: -1 }, '1'], [{ ...editBody, sedeId: 0 }, '1'], [editBody, 'abc']]) {
    const instance = probe(administrator); assert.equal((await instance.PUT(editRequest(body, id))).status, 400); assert.deepEqual(instance.mutations, []);
  }
  const missing = probe(administrator); assert.equal((await missing.PUT(editRequest(editBody, '99999'))).status, 404); assert.deepEqual(missing.mutations, []);
  for (const concepto of caja.CONCEPTOS_PROTEGIDOS) {
    const instance = probe(administrator, { data: [{ ...movement, concepto }] });
    assert.equal((await instance.PUT(editRequest())).status, 403); assert.deepEqual(instance.mutations, []);
  }
});

test('eliminación conserva autorización solo ADMIN, validación y protección de conceptos automáticos', async () => {
  for (const user of [null, supervisor, auditor, { ...administrator, perfilTipo: 'VENDEDOR' }]) {
    const instance = probe(user); assert.equal((await instance.DELETE(new Request('http://qa.local/api/caja?id=1', { method: 'DELETE' }))).status, user ? 403 : 401); assert.deepEqual(instance.mutations, []);
  }
  for (const [id, status] of [['abc', 400], ['99999', 404], ['803', 403], ['1', 200]]) {
    const instance = probe(administrator); assert.equal((await instance.DELETE(new Request(`http://qa.local/api/caja?id=${id}`, { method: 'DELETE' }))).status, status);
    assert.equal(instance.mutations.length, status === 200 ? 1 : 0);
  }
});

test('registro de movimiento conserva sede forzada para supervisor y precisión del monto', async () => {
  for (const user of [supervisor, administrator, auditor]) {
    const instance = probe(user); const response = await instance.registerPOST(new Request('http://qa.local/api/caja/registrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editBody) }));
    assert.equal(response.status, 200); assert.equal(instance.mutations[0].data.sedeId, user === supervisor ? 1 : 2); assert.equal(instance.mutations[0].data.valor, editBody.valor);
  }
});

const jsx = require('react/jsx-runtime');
const css = { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };
const nullComponent = { __esModule: true, default: () => null };
const uiRow = { ...movement, createdAt: movement.createdAt.toISOString(), editable: true };
const uiData = {
  movimientos: [uiRow, { ...uiRow, id: 2, tipo: 'EGRESO', concepto: 'Agua', valor: '2000.75', editable: false }],
  resumen: { totalIngresos: 4819431650.87, totalEgresos: 5783649374.75, saldo: -964217723.88, totalMovimientos: 36 },
  ultimoMovimiento: { ...uiRow, id: 1000, concepto: 'Último real fuera de página QA' }, total: 36, page: 1, pageSize: 10, totalPages: 4,
};
function workspaceProbe({ initial = {}, fetchImpl } = {}) {
  const path = 'app/caja/page.tsx';
  const text = source(path); const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(entry => entry.kind === ts.SyntaxKind.DefaultKeyword));
  const states = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap(entry =>
    ts.isArrayBindingPattern(entry.name) && entry.initializer && ts.isCallExpression(entry.initializer) && entry.initializer.expression.getText(ast) === 'useState' ? [entry.name.elements[0].name.getText(ast)] : []) : []);
  const locals = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? node.declarationList.declarations.filter(entry => ts.isIdentifier(entry.name)).map(entry => entry.name.text) : []);
  const finalReturn = component.body.statements.find(ts.isReturnStatement); assert.ok(finalReturn);
  const state = { user: administrator, sedes: [{ id: 1, nombre: 'SEDE 1' }, { id: 2, nombre: 'ONLINE QA' }], data: uiData, cargandoCaja: false, ...initial };
  const calls = []; const effects = []; const refs = []; const timers = []; const downloads = []; let cursor = 0; let refCursor = 0; let captured;
  const window = {
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {}, scrollTo() {},
    URL: { createObjectURL() { return 'blob:qa'; }, revokeObjectURL(url) { downloads.push({ revoked: url }); } },
  };
  const document = { body: { appendChild() {} }, createElement() { return { href: '', download: '', click() { downloads.push({ href: this.href, file: this.download }); }, remove() {} }; } };
  const react = {
    useState(value) { const name = states[cursor++]; assert.ok(name, 'Estado inesperado'); if (!(name in state)) state[name] = typeof value === 'function' ? value() : value; return [state[name], next => { state[name] = typeof next === 'function' ? next(state[name]) : next; }]; },
    useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => effects.push(fn),
    useRef(value) { const position = refCursor++; return refs[position] ??= { current: value }; },
  };
  const workspace = load(path, {
    react, 'react/jsx-runtime': jsx,
    './cash.module.css': css,
    'next/link': { __esModule: true, default: props => jsx.jsx('a', { href: props.href, className: props.className, 'aria-current': props['aria-current'], 'aria-label': props['aria-label'], children: props.children }) },
    'next/image': { __esModule: true, default: props => jsx.jsx('img', props) },
    '@/app/dashboard/_components/dashboard-icon': nullComponent,
    '@/app/ventas/_components/sales-dashboard-parts': { SalesProfile: props => jsx.jsx('div', { 'data-profile': true, children: `${props.name} ${props.role}` }) },
    '@/lib/use-live-refresh': { useLiveRefresh() {} },
  }, {
    __capture: value => { captured = value; }, window, document,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const result = fetchImpl ? await fetchImpl(url, options) : { ok: true, data: uiData };
      return result instanceof Response ? result : { ok: result.ok, json: async () => result.data, blob: async () => new Blob(['xlsx QA']), headers: new Headers({ 'Content-Disposition': 'attachment; filename="filtered-qa.xlsx"' }) };
    },
  }, input => input.slice(0, finalReturn.getStart(ast)) + `__capture({${locals.join(',')}});\n` + input.slice(finalReturn.getStart(ast)));
  const instance = {
    state, calls, effects, timers, downloads,
    render() { cursor = 0; refCursor = 0; effects.length = 0; timers.length = 0; const tree = resolve(workspace.default()); return { tree }; },
    get view() { return captured; },
  };
  instance.render(); return instance;
}
function resolve(node) {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === 'function') return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
function elements(node) {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return textOf(node.props?.children);
}
function control(tree, predicate) { const found = elements(tree).find(predicate); assert.ok(found, 'Control esperado no encontrado'); return found; }

test('interfaz conserva las ocho columnas, rutas, perfil real y edición según rol', () => {
  for (const user of [administrator, auditor, supervisor]) {
    const { tree } = workspaceProbe({ initial: { user } }).render();
    assert.deepEqual(elements(tree).filter(node => node.type === 'th').map(textOf), ['ID', 'Tipo', 'Concepto', 'Valor', 'Descripción', 'Sede', 'Fecha', 'Acciones']);
    for (const href of ['/dashboard', '/ventas', '/inventario', '/prestamos', '/caja', '/dashboard/aprobaciones', '/caja/gestion', '/caja/arqueo']) assert.ok(elements(tree).some(node => node.type === 'a' && node.props.href === href));
    assert.equal(control(tree, node => node.type === 'a' && node.props.href === '/caja').props['aria-current'], 'page');
    assert.ok(textOf(tree).includes(user.nombre)); assert.ok(textOf(tree).includes(user.rolNombre));
    assert.equal(elements(tree).filter(node => node.type === 'button' && textOf(node) === 'Editar').length, user === supervisor ? 0 : 1);
    assert.equal(elements(tree).some(node => node.type === 'a' && node.props.href === '/dashboard/sedes'), user !== supervisor);
  }
});

test('interfaz muestra importes completos, saldo negativo con signo y último movimiento del universo consultado', () => {
  const { tree } = workspaceProbe({ initial: { page: 2, data: { ...uiData, page: 2 } } }).render(); const text = textOf(tree);
  assert.ok(text.includes('$ 4.819.431.650,87')); assert.ok(text.includes('-$ 964.217.723,88'));
  assert.ok(text.includes('$ 1.000,25')); assert.ok(text.includes('$ 2.000,75')); assert.ok(text.includes('Último real fuera de página QA'));
  const negative = control(tree, node => node.type === 'strong' && textOf(node) === '-$ 964.217.723,88'); assert.ok(negative.props.className.split(' ').includes('negativeBalance'));
});

test('fecha visible mantiene segundos y timestamp de origen con huso Bogotá en cualquier dispositivo', () => {
  const priorTimeZone = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Bogota', 'Asia/Tokyo', 'Pacific/Honolulu']) {
      process.env.TZ = zone;
      const stamp = '2026-10-09T01:34:27.123Z'; const data = { ...uiData, movimientos: [{ ...uiRow, createdAt: stamp }] };
      const { tree } = workspaceProbe({ initial: { data } }).render();
      const time = control(tree, node => node.type === 'time' && node.props.dateTime === stamp);
      assert.match(textOf(time), /08\/10\/2026/); assert.match(textOf(time), /8:34:27/);
    }
  } finally { if (priorTimeZone === undefined) delete process.env.TZ; else process.env.TZ = priorTimeZone; }
});

test('consulta y descarga comparten búsqueda aplicada y filtros; Excel no recibe página ni tamaño', async () => {
  for (const user of [administrator, supervisor]) {
    const instance = workspaceProbe({ initial: { user, sedeFiltroId: '2', fechaDesde: '2026-10-01', fechaHasta: '2026-10-09', busqueda: 'borrador', busquedaAplicada: 'agua', page: 2, pageSize: 20 } });
    await instance.view.cargarCaja(); instance.render(); await instance.view.exportarExcel();
    const list = new URL(instance.calls[0].url, 'http://qa.local'); const excel = new URL(instance.calls[1].url, 'http://qa.local');
    assert.equal(list.searchParams.get('paginated'), '1'); assert.equal(list.searchParams.get('page'), '2'); assert.equal(list.searchParams.get('pageSize'), '20');
    assert.equal(excel.pathname, '/api/caja/export'); assert.equal(excel.searchParams.get('page'), null); assert.equal(excel.searchParams.get('pageSize'), null); assert.equal(excel.searchParams.get('limit'), null);
    for (const key of ['sedeId', 'fechaDesde', 'fechaHasta', 'q']) assert.equal(excel.searchParams.get(key), list.searchParams.get(key));
    assert.equal(excel.searchParams.get('q'), 'agua'); assert.equal(excel.searchParams.get('sedeId'), user === supervisor ? null : '2');
    assert.equal(instance.calls[0].options.cache, 'no-store'); assert.equal(instance.calls[1].options.cache, 'no-store');
    assert.ok(instance.downloads.some(download => download.file === 'filtered-qa.xlsx'));
  }
  const pending = workspaceProbe({ initial: { busqueda: 'nuevo', busquedaAplicada: 'anterior' } });
  assert.equal(control(pending.render().tree, node => node.type === 'button' && textOf(node) === 'Exportar Excel').props.disabled, true);
});

test('cambiar cobertura, fechas o filas reinicia página sin perder búsqueda; paginar conserva filtros', () => {
  for (const target of ['sede', 'desde', 'hasta', 'filas']) {
    const instance = workspaceProbe({ initial: { sedeFiltroId: '2', fechaDesde: '2026-10-01', fechaHasta: '2026-10-09', busquedaAplicada: 'agua', page: 3 } });
    const { tree } = instance.render();
    const field = control(tree, node => target === 'sede' ? node.type === 'select' && node.props.value === '2' : target === 'filas' ? node.type === 'select' && node.props.value === 10 : node.type === 'input' && node.props.type === 'date' && node.props.value === (target === 'desde' ? '2026-10-01' : '2026-10-09'));
    field.props.onChange({ target: { value: target === 'filas' ? '20' : target === 'sede' ? '1' : '2026-10-05' } });
    assert.equal(instance.state.page, 1); assert.equal(instance.state.busquedaAplicada, 'agua'); assert.equal(instance.state.cargandoCaja, true);
  }
  const instance = workspaceProbe({ initial: { page: 2, busquedaAplicada: 'agua', sedeFiltroId: '2', fechaDesde: '2026-10-01', data: { ...uiData, page: 2 } } });
  const { tree } = instance.render(); assert.ok(textOf(tree).includes('Mostrando 11–20 de 36 movimientos'));
  control(tree, node => node.type === 'button' && node.props['aria-label'] === 'Página siguiente').props.onClick();
  assert.equal(instance.state.page, 3); assert.equal(instance.state.busquedaAplicada, 'agua'); assert.equal(instance.state.sedeFiltroId, '2'); assert.equal(instance.state.fechaDesde, '2026-10-01');
});

test('búsqueda aplica el texto completo con debounce, reinicia página y limpiar periodo conserva otros filtros', () => {
  const instance = workspaceProbe({ initial: { busqueda: '  fuera de página  ', busquedaAplicada: 'anterior', page: 3, sedeFiltroId: '2', fechaDesde: '2026-10-01', fechaHasta: '2026-10-09' } });
  instance.effects[1](); assert.equal(instance.state.busquedaAplicada, 'anterior'); instance.timers[0]();
  assert.equal(instance.state.busquedaAplicada, 'fuera de página'); assert.equal(instance.state.page, 1);
  control(instance.render().tree, node => node.type === 'button' && textOf(node) === 'Limpiar periodo').props.onClick();
  assert.equal(instance.state.fechaDesde, ''); assert.equal(instance.state.fechaHasta, ''); assert.equal(instance.state.sedeFiltroId, '2'); assert.equal(instance.state.busquedaAplicada, 'fuera de página');
});

test('editar conserva centavos sin truncar, permisos y consulta aplicada al guardar', async () => {
  const instance = workspaceProbe({ initial: { busquedaAplicada: 'agua', sedeFiltroId: '2', fechaDesde: '2026-10-01', page: 2, data: { ...uiData, page: 2 } }, fetchImpl: async (_url, options) => options.method === 'PUT' ? { ok: true, data: { mensaje: 'Guardado QA' } } : { ok: true, data: { ...uiData, page: 2 } } });
  instance.view.iniciarEdicion(uiRow); assert.equal(instance.state.valorEdicion, '1000.25');
  let tree = instance.render().tree;
  assert.equal(control(tree, node => node.type === 'input' && node.props.type === 'number').props.step, 'any');
  control(tree, node => node.type === 'input' && node.props.type === 'number').props.onChange({ target: { value: '1234567.89' } });
  instance.render(); await instance.view.guardarEdicion();
  const request = instance.calls.find(call => call.options.method === 'PUT'); const payload = JSON.parse(request.options.body);
  assert.equal(payload.valor, 1234567.89); assert.equal(payload.sedeId, 1); assert.equal(payload.concepto, uiRow.concepto); assert.equal(instance.state.editandoMovimiento, null);
  assert.equal(instance.state.busquedaAplicada, 'agua'); assert.equal(instance.state.sedeFiltroId, '2'); assert.equal(instance.state.page, 2);
  const own = workspaceProbe({ initial: { user: supervisor } }); own.view.iniciarEdicion(uiRow); assert.equal(own.state.editandoMovimiento, null);
  const automatic = workspaceProbe(); automatic.view.iniciarEdicion({ ...uiRow, editable: false }); assert.equal(automatic.state.editandoMovimiento, null);
});

test('respuesta abortada de consulta previa no sustituye datos ni indicadores nuevos', async () => {
  let release; const oldResponse = new Promise(resolve => { release = resolve; });
  const fresh = { ...uiData, movimientos: [{ ...uiRow, id: 999 }], resumen: { ...uiData.resumen, saldo: 111.25 }, total: 1, totalPages: 1 };
  const instance = workspaceProbe({ initial: { busquedaAplicada: 'anterior' }, fetchImpl: async url => new URL(url, 'http://qa.local').searchParams.get('q') === 'anterior' ? oldResponse : { ok: true, data: fresh } });
  const prior = instance.view.cargarCaja(); instance.state.busquedaAplicada = 'nueva'; instance.render(); await instance.view.cargarCaja();
  assert.deepEqual(instance.state.data.movimientos.map(row => row.id), [999]); assert.equal(instance.state.data.resumen.saldo, 111.25);
  release({ ok: true, data: uiData }); await prior;
  assert.deepEqual(instance.state.data.movimientos.map(row => row.id), [999]); assert.equal(instance.state.data.resumen.saldo, 111.25); assert.equal(instance.state.cargandoCaja, false);
});

test('carga, error y vacío no muestran acciones obsoletas y rango inválido impide consulta y Excel', async () => {
  for (const initial of [{ cargandoCaja: true }, { errorCaja: 'Error QA' }, { data: { ...uiData, movimientos: [], total: 0 } }]) {
    const { tree } = workspaceProbe({ initial }).render();
    assert.equal(elements(tree).filter(node => node.type === 'button' && textOf(node) === 'Editar').length, 0);
  }
  for (const fetchImpl of [async () => ({ ok: false, data: { error: 'Permiso QA' } }), async () => { throw Error('Sin red QA'); }]) {
    const instance = workspaceProbe({ fetchImpl }); await instance.view.cargarCaja(); const { tree } = instance.render();
    assert.equal(instance.state.data, null); assert.equal(instance.state.cargandoCaja, false); assert.ok(instance.state.errorCaja);
    assert.ok(elements(tree).some(node => node.props?.role === 'alert')); assert.equal(control(tree, node => node.type === 'button' && textOf(node) === 'Exportar Excel').props.disabled, true);
  }
  const instance = workspaceProbe({ initial: { fechaDesde: '2026-10-10', fechaHasta: '2026-10-09' } });
  await instance.view.cargarCaja(); instance.render(); await instance.view.exportarExcel(); assert.deepEqual(instance.calls, []); assert.equal(instance.state.cargandoCaja, false);
});
