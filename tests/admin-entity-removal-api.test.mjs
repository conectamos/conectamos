import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, imports = {}) {
  const output = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', 'console', output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`); return imports[name];
  }, loadedModule, loadedModule.exports, { error() {} });
  return loadedModule.exports;
}
const access = load('lib/access-control.ts');
const removalAccess = load('lib/admin-entity-removal-access.ts', { '@/lib/access-control': access });
const operational = load('lib/active-operational-entities.ts');
const admin = { id: 1, usuario: 'central-qa', sedeId: 1, rolNombre: 'ADMIN', perfilTipo: 'ADMINISTRADOR' };

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(option => matches(row, option));
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('notIn' in value) return !value.notIn.includes(row[key]);
      return matches(row[key] || {}, value);
    }
    return row[key] === value;
  });
}
function probe({ user = admin, rows = {}, failAt = '' } = {}) {
  let state = {
    sede: [{ id: 1, nombre: 'BODEGA PRINCIPAL', codigo: 'PRINCIPAL', activa: true, eliminadoEn: null }, { id: 2, nombre: 'SEDE QA', codigo: 'QA', activa: true, eliminadoEn: null }],
    usuario: [{ id: 2, sedeId: 2, activo: true, rol: { nombre: 'USUARIO' }, activeSessionKey: 'secret-session', activeSessionLastSeenAt: new Date() }],
    perfilVendedor: [{ id: 9, nombre: 'Vendedor QA', tipo: 'VENDEDOR', activo: true, eliminadoEn: null, activeSessionKey: 'secret-profile', activeSessionLastSeenAt: new Date() }],
    inventarioSede: [], inventario: [], inventarioPrincipal: [], prestamoSede: [], registroVendedorVenta: [], facturaInventarioStand: [], ...structuredClone(rows),
  };
  let schemaChecks = 0; let committed = 0; let queue = Promise.resolve();
  const calls = [];
  function db(data) {
    const db = { $queryRaw: async (strings, ...values) => { calls.push({ method: 'lock', sql: strings.join('?'), values }); return []; } };
    for (const name of Object.keys(data)) {
      db[name] = {
        findUnique: async args => { calls.push({ method: `${name}.findUnique`, args }); return data[name].find(row => matches(row, args.where)) || null; },
        findMany: async args => { calls.push({ method: `${name}.findMany`, args }); return data[name].filter(row => matches(row, args.where)).map(row => name === 'sede' ? { ...row, usuarios: data.usuario.filter(account => account.sedeId === row.id) } : row); },
        count: async args => { calls.push({ method: `${name}.count`, args }); return data[name].filter(row => matches(row, args.where)).length; },
        update: async args => {
          calls.push({ method: `${name}.update`, args });
          if (`${name}.update` === failAt) throw Error('Fallo QA');
          const row = data[name].find(row => matches(row, args.where));
          if (!row) throw Object.assign(Error('No encontrado'), { code: 'P2025' });
          Object.assign(row, args.data); return row;
        },
        updateMany: async args => {
          calls.push({ method: `${name}.updateMany`, args });
          if (`${name}.updateMany` === failAt) throw Error('Fallo QA');
          const selected = data[name].filter(row => matches(row, args.where)); selected.forEach(row => Object.assign(row, args.data)); return { count: selected.length };
        },
      };
    }
    return db;
  }
  const prisma = { ...db(state), $transaction: callback => {
    const run = queue.then(async () => {
      const draft = structuredClone(state); const result = await callback(db(draft));
      for (const name of Object.keys(state)) state[name].splice(0, state[name].length, ...draft[name]);
      committed++; return result;
    }); queue = run.catch(() => {}); return run;
  } };
  const imports = {
    'next/server': { NextResponse: { json: (body, opts) => Response.json(body, opts) } },
    '@/lib/prisma': { __esModule: true, default: prisma }, '@/lib/access-control': access,
    '@/lib/admin-entity-removal-access': removalAccess,
    '@/lib/active-operational-entities': operational,
    '@/lib/vendor-profile-schema': { ensureVendorProfilesSchema: async () => { schemaChecks++; } },
    '@/lib/password': { hashPassword: value => `hash:${value}` },
    '@/lib/auth': { getSessionUser: async () => user },
  };
  const service = load('lib/admin-entity-removal.ts', imports);
  imports['@/lib/admin-entity-removal'] = service;
  imports['@/lib/vendor-profiles'] = {
    obtenerPerfilesVendedor: async () => state.perfilVendedor.filter(row => !row.eliminadoEn),
    normalizarTipoPerfilVendedor: tipo => tipo,
    normalizarNombrePerfilVendedor: valor => String(valor || '').trim(),
    normalizarSedeIdsPerfilVendedor: values => values || [], PerfilBodegaValidationError: class extends Error {},
  };
  return { service, sedes: load('app/api/sedes/admin/route.ts', imports), perfiles: load('app/api/perfiles-vendedor/route.ts', imports), calls, state: () => structuredClone(state), schemaChecks: () => schemaChecks, committed: () => committed };
}
const request = payload => new Request('http://qa.local/api/removal', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

test('eliminación: únicamente ADMIN central, sin heredar permiso desde una cuenta base ADMIN', () => {
  for (const perfilTipo of [undefined, '', 'ADMINISTRADOR', ' administrador ']) assert.equal(removalAccess.puedeEliminarEntidadesCentrales({ rolNombre: 'ADMIN', perfilTipo }), true);
  for (const user of [null, {}, { rolNombre: 'AUDITOR' }, { rolNombre: 'BODEGA' }, { rolNombre: 'ADMIN', perfilTipo: 'VENDEDOR' }, { rolNombre: 'ADMIN', perfilTipo: 'AUDITOR' }, { rolNombre: 'ADMIN', perfilTipo: 'BODEGA' }]) assert.equal(removalAccess.puedeEliminarEntidadesCentrales(user), false);
  for (const tipo of ['VENDEDOR', 'APOYO_OPERATIVO', 'SUPERVISOR_TIENDA']) assert.equal(removalAccess.puedeEliminarPerfilComercial(tipo), true);
  for (const tipo of ['ADMINISTRADOR', 'AUDITOR', 'BODEGA', 'FACTURADOR', '', null]) assert.equal(removalAccess.puedeEliminarPerfilComercial(tipo), false);
});

test('DELETE: rechaza autorización, confirmación e IDs inválidos antes de mutar', async () => {
  for (const user of [null, { ...admin, rolNombre: 'AUDITOR' }, { ...admin, perfilTipo: 'VENDEDOR' }]) {
    const p = probe({ user });
    for (const route of [p.sedes, p.perfiles]) assert.equal((await route.DELETE(request({ id: 9, sedeId: 2, confirmed: true }))).status, user ? 403 : 401);
    assert.equal(p.schemaChecks(), 0); assert.deepEqual(p.calls, []);
  }
  for (const payload of [{ sedeId: 2 }, { sedeId: 2, confirmed: 'true' }, [], null]) {
    const p = probe(); assert.equal((await p.sedes.DELETE(request(payload))).status, 400); assert.equal(p.schemaChecks(), 0);
  }
  for (const id of [null, '2', 0, -1, 1.5, 2_147_483_648, {}, []]) {
    const p = probe(); assert.equal((await p.sedes.DELETE(request({ sedeId: id, confirmed: true }))).status, 400); assert.equal(p.schemaChecks(), 0);
  }
});

test('sede: retirada atómica revoca sesiones, conserva histórico y reintentos no sobrescriben auditoría', async () => {
  const history = { id: 101, sedeId: 2, eliminadoEn: null, ventaIdRelacionada: 55, estadoVentaRegistro: 'CONVERTIDO_EN_VENTA' };
  const p = probe({ rows: { registroVendedorVenta: [history], prestamoSede: [{ id: 6, sedeOrigenId: 2, sedeDestinoId: 1, estado: 'FINALIZADO' }], inventarioSede: [{ id: 7, sedeId: 2, estadoActual: 'VENDIDO', estadoFinanciero: 'PAGO' }] } });
  const [a, b] = await Promise.all([p.sedes.DELETE(request({ sedeId: 2, confirmed: true })), p.sedes.DELETE(request({ sedeId: 2, confirmed: true }))]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal((await a.json()).sedes.some(s => s.id === 2), false);
  const state = p.state(); assert.equal(state.sede[1].activa, false); assert.ok(state.sede[1].eliminadoEn instanceof Date); assert.match(state.sede[1].eliminadoPor, /central-qa \(#1\)/);
  assert.equal(state.usuario[0].activo, false); assert.equal(state.usuario[0].activeSessionKey, null); assert.equal(state.usuario[0].activeSessionLastSeenAt, null);
  assert.deepEqual(state.registroVendedorVenta[0], history); assert.equal(state.prestamoSede.length, 1); assert.equal(state.inventarioSede.length, 1);
  assert.equal(p.calls.filter(c => c.method === 'sede.update').length, 1);
  assert.ok(p.calls.some(c => c.sql?.includes('pg_advisory_xact_lock'))); assert.ok(p.calls.some(c => c.sql?.includes('FOR UPDATE')));
  assert.equal(p.calls.some(c => /delete/i.test(c.method)), false);
  assert.equal((await p.sedes.GET()).status, 200);
});

test('sede: protege bodega, sede actual, accesos ADMIN y cada clase de operación pendiente', async () => {
  const cases = [
    { rows: { sede: [{ id: 2, nombre: ' BODEGA   PRINCIPAL ', codigo: 'QA', activa: true, eliminadoEn: null }] } },
    { rows: { sede: [{ id: 2, nombre: 'Nombre cambiado', codigo: 'BODEGA-PRINCIPAL', activa: true, eliminadoEn: null }] } },
    { user: { ...admin, sedeId: 2 } },
    { rows: { usuario: [{ id: 3, sedeId: 2, activo: true, rol: { nombre: 'ADMIN' } }] } },
    { rows: { inventarioSede: [{ sedeId: 2, estadoActual: 'BODEGA' }] } },
    { rows: { inventario: [{ sedeActualId: 2, estadoActual: 'GARANTIA' }] } },
    { rows: { inventarioSede: [{ sedeId: 2, estadoActual: 'VENDIDO', estadoFinanciero: 'DEUDA' }] } },
    { rows: { inventarioPrincipal: [{ sedeDestinoId: 2, estadoCobro: 'PENDIENTE' }] } },
    ...['PENDIENTE', 'APROBADO', 'PAGO_PENDIENTE_APROBACION', 'DEVOLUCION_PENDIENTE'].map(estado => ({ rows: { prestamoSede: [{ sedeOrigenId: 1, sedeDestinoId: 2, estado }] } })),
    { rows: { registroVendedorVenta: [{ sedeId: 2, eliminadoEn: null, ventaIdRelacionada: null, estadoVentaRegistro: 'PENDIENTE' }] } },
    { rows: { facturaInventarioStand: [{ sedeId: 2, estado: 'PROCESANDO' }] } },
  ];
  for (const options of cases) {
    const p = probe(options); const response = await p.sedes.DELETE(request({ sedeId: 2, confirmed: true }));
    assert.equal(response.status, 409, JSON.stringify(options)); assert.ok((await response.json()).error); assert.equal(p.calls.some(c => c.method.endsWith('.update') || c.method.endsWith('.updateMany')), false);
  }
});

test('perfil: elimina solo comerciales, revoca sesión y conserva ventas y asignaciones históricas', async () => {
  for (const tipo of ['VENDEDOR', 'SUPERVISOR_TIENDA', 'APOYO_OPERATIVO']) {
    const history = { id: 60, perfilVendedorId: 9, sedeId: 2, estadoVentaRegistro: 'PENDIENTE', eliminadoEn: null, ventaIdRelacionada: null };
    const p = probe({ rows: { perfilVendedor: [{ id: 9, nombre: 'QA', tipo, activo: true, eliminadoEn: null, activeSessionKey: 'old' }], registroVendedorVenta: [history] } });
    const response = await p.perfiles.DELETE(request({ id: 9, confirmed: true })); assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).perfiles, []); const perfil = p.state().perfilVendedor[0];
    assert.equal(perfil.activo, false); assert.equal(perfil.activeSessionKey, null); assert.ok(perfil.eliminadoEn); assert.deepEqual(p.state().registroVendedorVenta[0], history);
    await p.perfiles.DELETE(request({ id: 9, confirmed: true })); assert.equal(p.calls.filter(c => c.method === 'perfilVendedor.update').length, 1);
  }
  for (const tipo of ['ADMINISTRADOR', 'AUDITOR', 'BODEGA', 'FACTURADOR']) {
    const p = probe({ rows: { perfilVendedor: [{ id: 9, nombre: 'QA', tipo, activo: true, eliminadoEn: null }] } });
    assert.equal((await p.perfiles.DELETE(request({ id: 9, confirmed: true }))).status, 409);
  }
  const own = probe({ user: { ...admin, perfilId: 9 } }); assert.equal((await own.perfiles.DELETE(request({ id: 9, confirmed: true }))).status, 409);
});

test('fallo al revocar sesiones revierte toda la retirada y permite reintentar', async () => {
  const p = probe({ failAt: 'usuario.updateMany' }); const before = p.state();
  const response = await p.sedes.DELETE(request({ sedeId: 2, confirmed: true }));
  assert.equal(response.status, 500); assert.equal((await response.json()).ok, undefined); assert.deepEqual(p.state(), before); assert.equal(p.committed(), 0);
});

test('operaciones: locks estables de sedes/perfiles y rechazo de retirados antes de inserciones', async () => {
  const calls = []; const tx = {
    $queryRaw: async (strings, ...values) => { calls.push([strings.join('?'), ...values]); },
    sede: { findUnique: async ({ where }) => ({ activa: where.id !== 9 }) },
    perfilVendedor: { findUnique: async ({ where }) => ({ activo: where.id !== 9 }) },
  };
  await operational.validarSedesActivasOperacion(tx, [3, 2, 3]); assert.deepEqual(calls.map(c => c[1]), [2, 3]); assert.ok(calls.every(c => c[0].includes('FOR KEY SHARE')));
  await assert.rejects(operational.validarSedesActivasOperacion(tx, [9]), error => error.status === 409);
  await assert.rejects(operational.validarPerfilActivoOperacion(tx, 9), error => error.status === 409);
  await operational.validarPerfilActivoOperacion(tx, 3);
});

test('auth: una sede retirada invalida también una sesión ya emitida', async () => {
  let profileQueries = 0;
  const auth = load('lib/auth.ts', {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'qa-token' }) }) },
    '@/lib/prisma': { __esModule: true, default: { usuario: { findUnique: async () => ({ id: 2, activo: true, sede: { activa: false } }) }, perfilVendedor: { findUnique: async () => { profileQueries++; } } } },
    '@/lib/access-control': access, '@/lib/vendor-profiles': { etiquetaTipoPerfilVendedor: tipo => tipo },
    '@/lib/session': { SESSION_COOKIE_NAME: 'session', verifySessionToken: () => ({ userId: 2, profileId: 9, sessionKey: 'old' }) },
    '@/lib/session-state': { isSessionIdle: () => false },
  });
  assert.equal(await auth.getSessionUser(), null); assert.equal(profileQueries, 0);
});

test('perfiles: asignaciones retiradas siguen en histórico pero no bloquean la edición ni permiten acceso', async () => {
  const links = [
    { sede: { id: 2, nombre: 'SEDE ACTIVA', activa: true, eliminadoEn: null } },
    { sede: { id: 3, nombre: 'SEDE RETIRADA', activa: false, eliminadoEn: new Date() } },
    { sede: { id: 4, nombre: 'SEDE INACTIVA', activa: false, eliminadoEn: null } },
  ];
  let profileQueries = 0;
  const service = load('lib/vendor-profiles.ts', {
    '@/lib/prisma': { __esModule: true, default: {
      sede: { findUnique: async ({ where }) => links.find(link => link.sede.id === where.id)?.sede },
      perfilVendedor: {
        findMany: async args => {
          profileQueries++;
          return [{ id: 9, nombre: 'Vendedor QA', tipo: 'VENDEDOR', activo: true,
            sedes: links.filter(link => matches(link, args.select.sedes.where)) }];
        },
        findFirst: async () => { assert.fail('No validar PIN de un perfil asociado a una sede retirada'); },
      },
    } },
    '@/lib/access-control': access,
    '@/lib/active-operational-entities': operational,
    '@/lib/profile-avatars': load('lib/profile-avatars.ts'),
    '@/lib/password': { verifyPassword: () => true },
    '@/lib/vendor-profile-schema': { ensureVendorProfilesSchema: async () => {} },
  });
  const profiles = await service.obtenerPerfilesVendedor();
  assert.deepEqual(profiles[0].sedeIds, [2]); assert.equal(links.length, 3);
  assert.deepEqual(await service.obtenerPerfilesAccesoPorSede(3), []);
  assert.equal(await service.validarPerfilAccesoPorSede({ sedeId: 3, perfilId: 9, pin: '1234' }), null);
  assert.equal(profileQueries, 1);
});

test('arranque: asegura columnas antes de aceptar solicitudes, sin depender del scheduler de cierre', async () => {
  const names = ['NEXT_PHASE', 'NEXT_RUNTIME', 'CIERRE_SYNC_ENABLED'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    delete process.env.NEXT_PHASE; process.env.NEXT_RUNTIME = 'nodejs'; delete process.env.CIERRE_SYNC_ENABLED;
    let release; let started = false; let completed = false;
    const schema = new Promise(resolve => { release = resolve; });
    const startup = load('instrumentation.ts', {
      '@/lib/vendor-profile-schema': { ensureVendorProfilesSchema: async () => { started = true; await schema; } },
    });
    const pending = startup.register().then(() => { completed = true; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(started, true); assert.equal(completed, false);
    release(); await pending; assert.equal(completed, true);
    process.env.NEXT_PHASE = 'phase-production-build'; started = false; await startup.register(); assert.equal(started, false);
    delete process.env.NEXT_PHASE;
    const broken = load('instrumentation.ts', { '@/lib/vendor-profile-schema': { ensureVendorProfilesSchema: async () => { throw Error('Schema QA no disponible'); } } });
    await assert.rejects(broken.register(), /Schema QA/);
  } finally {
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});

test('editar vendedor conserva enlaces históricos a sedes retiradas aunque el selector no los envíe', async () => {
  const sites = [{ id: 2, activa: true, eliminadoEn: null }, { id: 3, activa: false, eliminadoEn: new Date() }];
  let links = sites.map(sede => ({ perfilVendedorId: 9, sedeId: sede.id, sede }));
  const writes = [];
  const db = {
    $queryRaw: async () => [],
    sede: {
      count: async ({ where }) => sites.filter(site => matches(site, where)).length,
      findUnique: async ({ where }) => sites.find(site => site.id === where.id),
    },
    perfilVendedor: { update: async args => { writes.push(args); return { id: 9 }; } },
    perfilVendedorSede: {
      deleteMany: async ({ where }) => { links = links.filter(link => !matches(link, where)); },
      createMany: async ({ data }) => { links.push(...data.map(link => ({ ...link, sede: sites.find(site => site.id === link.sedeId) }))); },
    },
  };
  db.$transaction = async callback => callback(db);
  const service = load('lib/vendor-profiles.ts', {
    '@/lib/prisma': { __esModule: true, default: db }, '@/lib/access-control': access,
    '@/lib/active-operational-entities': operational, '@/lib/profile-avatars': load('lib/profile-avatars.ts'),
    '@/lib/password': {}, '@/lib/vendor-profile-schema': { ensureVendorProfilesSchema: async () => {} },
  });
  await service.actualizarPerfilVendedor(9, { nombre: 'Vendedor QA', documento: null, correo: null, telefono: null, activo: true, tipo: 'VENDEDOR', avatarKey: 'VENDEDOR', sedeIds: [2] });
  assert.equal(writes.length, 1); assert.equal(writes[0].where.eliminadoEn, null);
  assert.deepEqual(links.map(link => link.sedeId).sort(), [2, 3]);
});
