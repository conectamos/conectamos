import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const administrator = { id: 1, nombre: 'Administrador QA', rolNombre: 'ADMIN', perfilTipo: 'ADMINISTRADOR', sedeId: 1 };
const auditor = { ...administrator, rolNombre: 'AUDITOR', perfilTipo: 'AUDITOR' };
const supervisor = { ...administrator, rolNombre: 'USUARIO', perfilTipo: 'SUPERVISOR_TIENDA' };

function load(path, imports = {}) {
  const output = ts.transpileModule(readFileSync(join(ROOT, path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', 'console', output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loadedModule, loadedModule.exports, { error() {} });
  return loadedModule.exports;
}

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => value && typeof value === 'object'
    ? 'not' in value ? row[key] !== value.not : matches(row[key] || {}, value)
    : row[key] === value);
}

function project(row, select) {
  if (!row) return null;
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(select).filter(([, enabled]) => enabled).map(([key, value]) => {
    const actual = row[key];
    if (value === true || actual == null) return [key, actual];
    if (Array.isArray(actual)) return [key, actual.map(item => project(item, value.select))];
    return [key, project(actual, value.select)];
  }));
}

const integration = {
  facturacionNombre: 'Razón social QA', facturacionTipoDocumento: 'NIT', facturacionDocumento: '901000123',
  facturacionCorreo: 'facturas@qa.example', facturacionTelefono: '3000000000', facturacionDireccion: 'Calle 10 # 20-30 QA',
  siigoEnabled: true, siigoInvoiceDocumentId: 101, siigoSellerId: 202, siigoPaymentTypeId: 303,
  siigoItemCode: '0001', siigoCostCenterId: 404, siigoDefaultCountryCode: 'CO',
  siigoDefaultStateCode: '73', siigoDefaultCityCode: '73001', siigoDefaultPostalCode: '730001',
  siigoStampSend: true, siigoMailSend: true, siigoPaymentDueDays: 30,
};
const initialSites = [
  { id: 1, nombre: 'SEDE 1', codigo: 'SEDE-1', activa: true, soloInventarioPorCobrar: true, ...integration },
  { id: 2, nombre: 'SEDE 2', codigo: 'SEDE-2', activa: true, soloInventarioPorCobrar: false, ...integration, siigoEnabled: false },
  { id: 3, nombre: 'SIN ACCESO QA', codigo: null, activa: false, soloInventarioPorCobrar: false, ...integration },
  ...Array.from({ length: 21 }, (_, index) => ({
    id: index + 4, nombre: `SEDE QA ${index + 4}`, codigo: `QA-${index + 4}`, activa: true,
    soloInventarioPorCobrar: false, ...integration, siigoEnabled: index % 2 === 0,
  })),
];
const initialUsers = [
  { id: 1, nombre: 'Administrador QA', usuario: 'adminqa', activo: true, rolId: 1, sedeId: 1, claveHash: 'hash-administrador-oculto', rol: { nombre: 'ADMIN' } },
  { id: 11, nombre: 'Usuario SEDE 1', usuario: 'sede1', activo: false, rolId: 2, sedeId: 1, claveHash: 'hash-sede1-oculto', rol: { nombre: 'USUARIO' } },
  { id: 12, nombre: 'Acceso adicional QA', usuario: 'sede1extra', activo: true, rolId: 2, sedeId: 1, claveHash: 'hash-extra-oculto', rol: { nombre: 'USUARIO' } },
  { id: 21, nombre: 'Usuario SEDE 2', usuario: 'sede2', activo: true, rolId: 2, sedeId: 2, claveHash: 'hash-sede2-oculto', rol: { nombre: 'USUARIO' } },
];

function probe(user = administrator, { failAt = '', missingUserRole = false } = {}) {
  let state = structuredClone({ sites: initialSites, users: initialUsers });
  const calls = []; const mutations = []; const hashes = [];
  let schemaChecks = 0; let committedTransactions = 0;
  function failure(method) {
    if (method === failAt) throw Error(`Fallo controlado QA: ${method}`);
  }
  function database(forState, inTransaction = false) {
    const record = (method, args) => { calls.push({ method, ...args }); failure(method); };
    return {
      sede: {
        findUnique: async args => {
          record('sede.findUnique', args);
          const row = forState.sites.find(site => matches(site, args.where));
          return project(row ? { ...row, usuarios: forState.users.filter(account => account.sedeId === row.id).sort((a, b) => a.id - b.id) } : null, args.select);
        },
        findFirst: async args => { record('sede.findFirst', args); return project(forState.sites.find(row => matches(row, args.where)), args.select); },
        findMany: async args => {
          record('sede.findMany', args);
          return [...forState.sites].sort((a, b) => a.id - b.id).map(site => project({
            ...site, usuarios: forState.users.filter(account => account.sedeId === site.id).sort((a, b) => a.id - b.id),
          }, args.select));
        },
        create: async args => {
          assert.ok(inTransaction, 'La sede y su acceso deben crearse dentro de una transacción');
          mutations.push({ method: 'sede.create', ...args }); failure('sede.create');
          const row = { id: Math.max(...forState.sites.map(site => site.id)) + 1, ...args.data };
          forState.sites.push(row); return project(row, args.select);
        },
        update: async args => {
          assert.ok(inTransaction, 'La sede y su acceso deben editarse dentro de una transacción');
          mutations.push({ method: 'sede.update', ...args }); failure('sede.update');
          const row = forState.sites.find(site => site.id === args.where.id);
          Object.assign(row, args.data); return project(row, args.select);
        },
      },
      usuario: {
        findUnique: async args => { record('usuario.findUnique', args); return project(forState.users.find(row => matches(row, args.where)), args.select); },
        findFirst: async args => { record('usuario.findFirst', args); return project(forState.users.find(row => matches(row, args.where)), args.select); },
        create: async args => {
          assert.ok(inTransaction); mutations.push({ method: 'usuario.create', ...args }); failure('usuario.create');
          const row = { id: Math.max(...forState.users.map(account => account.id)) + 1, ...args.data, rol: { nombre: 'USUARIO' } };
          forState.users.push(row); return project(row, args.select);
        },
        update: async args => {
          assert.ok(inTransaction); mutations.push({ method: 'usuario.update', ...args }); failure('usuario.update');
          const row = forState.users.find(account => account.id === args.where.id);
          Object.assign(row, args.data); return project(row, args.select);
        },
      },
      rol: { findUnique: async args => { record('rol.findUnique', args); return missingUserRole ? null : { id: 2 }; } },
    };
  }
  const prisma = {
    ...database(state),
    $transaction: async callback => {
      failure('$transaction');
      const pending = structuredClone(state);
      const result = await callback(database(pending, true));
      state.sites.splice(0, state.sites.length, ...pending.sites);
      state.users.splice(0, state.users.length, ...pending.users);
      committedTransactions++;
      return result;
    },
  };
  const api = load('app/api/sedes/admin/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => Response.json(body, options) } },
    '@/lib/prisma': { __esModule: true, default: prisma },
    '@/lib/auth': { getSessionUser: async () => user },
    '@/lib/password': { hashPassword: value => { hashes.push(value); return `hash-qa:${value}`; } },
    '@/lib/vendor-profile-schema': { ensureVendorProfilesSchema: async () => { schemaChecks++; failure('schema'); } },
  });
  return { ...api, calls, mutations, hashes, state: () => structuredClone(state), schemaChecks: () => schemaChecks, committedTransactions: () => committedTransactions };
}

const createPayload = { nombre: 'SEDE NUEVA QA', codigo: 'NUEVA-QA', usuario: 'nuevaqa', clave: 'clave-inicial-QA', soloInventarioPorCobrar: true, ...integration };
const editPayload = { sedeId: 1, nombre: 'SEDE 1', codigo: 'SEDE-1', usuario: 'sede1', clave: '', soloInventarioPorCobrar: true, ...integration };
async function request(instance, method, payload) {
  const response = method === 'GET' ? await instance.GET() : await instance[method](new Request('http://qa.local/api/sedes/admin', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }));
  return { response, body: await response.json() };
}

test('sedes: GET, POST y PATCH rechazan usuarios sin permiso antes de leer o escribir datos', async () => {
  for (const user of [null, supervisor, { ...supervisor, rolNombre: 'VENDEDOR' }, { ...supervisor, perfilTipo: 'ADMINISTRADOR' }]) {
    const instance = probe(user);
    for (const method of ['GET', 'POST', 'PATCH']) {
      const { response, body } = await request(instance, method, method === 'POST' ? createPayload : editPayload);
      assert.equal(response.status, user ? 403 : 401); assert.ok(body.error); assert.equal(body.ok, undefined);
    }
    assert.deepEqual(instance.calls, []); assert.deepEqual(instance.mutations, []); assert.equal(instance.schemaChecks(), 0);
  }
});

test('sedes: ADMIN y AUDITOR conservan el listado completo de todas las sedes', async () => {
  for (const user of [administrator, auditor, { ...auditor, rolNombre: ' auditor ' }]) {
    const instance = probe(user); const { response, body } = await request(instance, 'GET');
    assert.equal(response.status, 200); assert.equal(body.ok, true); assert.equal(body.sedes.length, initialSites.length);
    assert.deepEqual(body.sedes.map(row => row.id), initialSites.map(row => row.id));
    const query = instance.calls.find(call => call.method === 'sede.findMany');
    assert.equal(query.take, undefined); assert.equal(query.where, undefined); assert.equal(instance.schemaChecks(), 1);
  }
});

test('sedes: las respuestas jamás exponen claves ni hashes, incluso al crear o cambiar una clave', async () => {
  for (const [method, payload] of [['GET', undefined], ['POST', createPayload], ['PATCH', { ...editPayload, clave: 'nueva-clave-privada-QA' }]]) {
    const instance = probe(); const { response, body } = await request(instance, method, payload);
    assert.equal(response.status, 200);
    const responseText = JSON.stringify(body);
    assert.doesNotMatch(responseText, /claveHash|password|hash-sede|hash-administrador|clave-inicial-QA|nueva-clave-privada-QA/);
    for (const query of instance.calls.filter(call => call.select)) assert.doesNotMatch(JSON.stringify(query.select), /clave|password/i);
  }
});

test('sedes: acceso representa al primer usuario USUARIO de la sede y respeta su estado activo real', async () => {
  const { body } = await request(probe(), 'GET');
  assert.deepEqual(body.sedes[0].acceso, { id: 11, nombre: 'Usuario SEDE 1', usuario: 'sede1', activo: false });
  assert.equal(body.sedes[1].acceso.activo, true); assert.equal(body.sedes[2].acceso, null); assert.equal(body.sedes[2].activa, false);
  for (const [key, value] of Object.entries(integration)) assert.equal(body.sedes[0][key], value);
  assert.equal(body.sedes[0].soloInventarioPorCobrar, true);
});

test('sedes: creación válida normaliza datos y crea sede y acceso con hash en una sola transacción', async () => {
  const instance = probe(auditor);
  const { response, body } = await request(instance, 'POST', {
    ...createPayload, nombre: '  SEDE   Nueva QA  ', codigo: ' nueva-qa ', usuario: ' Ñuéva . QA ', clave: '  clave-inicial-QA  ',
  });
  assert.equal(response.status, 200); assert.equal(body.ok, true); assert.equal(body.mensaje, 'Sede creada correctamente');
  const created = body.sedes.at(-1);
  assert.equal(created.nombre, 'SEDE Nueva QA'); assert.equal(created.codigo, 'NUEVA-QA'); assert.equal(created.acceso.usuario, 'nuevaqa');
  assert.equal(created.activa, true); assert.equal(created.acceso.activo, true); assert.equal(created.soloInventarioPorCobrar, true);
  assert.equal(instance.committedTransactions(), 1); assert.deepEqual(instance.hashes, ['clave-inicial-QA']);
  const account = instance.state().users.find(row => row.sedeId === created.id);
  assert.equal(account.claveHash, 'hash-qa:clave-inicial-QA'); assert.equal(account.rolId, 2); assert.equal(account.nombre, 'Usuario SEDE Nueva QA');
  for (const [key, value] of Object.entries(integration)) assert.equal(created[key], value);
});

test('sedes: edición con clave vacía conserva exactamente el hash existente y los estados de acceso', async () => {
  for (const clave of ['', '   ', null]) {
    const instance = probe(); const before = instance.state();
    const { response, body } = await request(instance, 'PATCH', { ...editPayload, nombre: 'SEDE RENOMBRADA QA', clave });
    assert.equal(response.status, 200); assert.equal(body.ok, true); assert.equal(body.sedes[0].nombre, 'SEDE RENOMBRADA QA');
    assert.deepEqual(instance.hashes, []);
    const update = instance.mutations.find(row => row.method === 'usuario.update'); assert.equal('claveHash' in update.data, false);
    assert.equal(instance.state().users.find(row => row.id === 11).claveHash, before.users.find(row => row.id === 11).claveHash);
    assert.equal(instance.state().users.find(row => row.id === 11).activo, false); assert.equal(body.sedes[0].acceso.activo, false);
    assert.equal(instance.state().users.find(row => row.id === 1).nombre, 'Administrador QA');
  }
});

test('sedes: cambiar clave actualiza únicamente el acceso de la sede seleccionada', async () => {
  const instance = probe(); const before = instance.state();
  const { response, body } = await request(instance, 'PATCH', { ...editPayload, clave: ' nueva-clave-QA ', usuario: 'sede1renombrada' });
  assert.equal(response.status, 200); assert.equal(body.ok, true); assert.deepEqual(instance.hashes, ['nueva-clave-QA']);
  const account = instance.state().users.find(row => row.id === 11);
  assert.equal(account.claveHash, 'hash-qa:nueva-clave-QA'); assert.equal(account.usuario, 'sede1renombrada');
  assert.deepEqual(instance.state().users.filter(row => row.id !== 11), before.users.filter(row => row.id !== 11));
});

test('sedes: guardar identidad conserva todos los campos Siigo, facturación y solo inventario por cobrar', async () => {
  const instance = probe(); const { response, body } = await request(instance, 'PATCH', { ...editPayload, nombre: 'SEDE MODIFICADA QA' });
  assert.equal(response.status, 200); assert.equal(body.ok, true);
  const site = instance.state().sites[0]; assert.equal(site.soloInventarioPorCobrar, true);
  for (const [key, value] of Object.entries(integration)) { assert.equal(site[key], value, key); assert.equal(body.sedes[0][key], value, key); }
  assert.deepEqual(instance.state().sites.slice(1), initialSites.slice(1));
});

test('sedes: configuración Siigo y facturación conserva códigos con ceros iniciales y normaliza IDs y correo', async () => {
  const instance = probe(); const { response, body } = await request(instance, 'PATCH', {
    ...editPayload, facturacionCorreo: ' FACTURAS@QA.EXAMPLE ', facturacionTipoDocumento: ' cc ', facturacionDocumento: '000123456',
    siigoInvoiceDocumentId: '501', siigoSellerId: '502', siigoPaymentTypeId: '503', siigoCostCenterId: '504',
    siigoItemCode: ' 0007 ', siigoDefaultCountryCode: ' co ', siigoDefaultStateCode: '05', siigoDefaultCityCode: '05001', siigoPaymentDueDays: '45',
    siigoStampSend: false, siigoMailSend: false, soloInventarioPorCobrar: false,
  });
  assert.equal(response.status, 200); const site = body.sedes[0];
  assert.equal(site.facturacionCorreo, 'facturas@qa.example'); assert.equal(site.facturacionTipoDocumento, 'CC'); assert.equal(site.facturacionDocumento, '000123456');
  assert.deepEqual([site.siigoInvoiceDocumentId, site.siigoSellerId, site.siigoPaymentTypeId, site.siigoCostCenterId], [501, 502, 503, 504]);
  assert.equal(site.siigoItemCode, '0007'); assert.equal(site.siigoDefaultCountryCode, 'CO'); assert.equal(site.siigoDefaultStateCode, '05'); assert.equal(site.siigoDefaultCityCode, '05001');
  assert.equal(site.siigoPaymentDueDays, 45); assert.equal(site.siigoStampSend, false); assert.equal(site.siigoMailSend, false); assert.equal(site.soloInventarioPorCobrar, false);
});

test('sedes: creación valida nombre, usuario y clave antes de cualquier escritura', async () => {
  for (const [overrides, error] of [
    [{ nombre: ' ' }, 'El nombre de la sede es obligatorio'],
    [{ usuario: ' ... ' }, 'El usuario de acceso es obligatorio'],
    [{ clave: ' ' }, 'La clave es obligatoria'],
  ]) {
    const instance = probe(); const { response, body } = await request(instance, 'POST', { ...createPayload, ...overrides });
    assert.equal(response.status, 400); assert.equal(body.error, error); assert.deepEqual(instance.mutations, []); assert.equal(instance.committedTransactions(), 0);
  }
});

test('sedes: creación rechaza nombre, código o usuario duplicados tras normalizarlos', async () => {
  for (const [overrides, error] of [
    [{ nombre: '  SEDE   1 ' }, 'Ya existe una sede con ese nombre'],
    [{ codigo: ' sede-2 ' }, 'Ese codigo de sede ya existe'],
    [{ usuario: ' Séde.2 ' }, 'Ese usuario de acceso ya existe'],
  ]) {
    const instance = probe(); const { response, body } = await request(instance, 'POST', { ...createPayload, ...overrides });
    assert.equal(response.status, 400); assert.equal(body.error, error); assert.deepEqual(instance.mutations, []); assert.deepEqual(instance.hashes, []);
  }
});

test('sedes: edición rechaza conflictos con otras sedes y permite conservar los valores propios', async () => {
  for (const [overrides, error] of [
    [{ nombre: 'SEDE 2' }, 'Ya existe otra sede con ese nombre'],
    [{ codigo: ' sede-2 ' }, 'Ya existe otra sede con ese codigo'],
    [{ usuario: ' Séde 2 ' }, 'Ese usuario de acceso ya existe'],
  ]) {
    const instance = probe(); const { response, body } = await request(instance, 'PATCH', { ...editPayload, ...overrides });
    assert.equal(response.status, 400); assert.equal(body.error, error); assert.deepEqual(instance.mutations, []);
  }
  assert.equal((await request(probe(), 'PATCH', editPayload)).response.status, 200);
});

test('sedes: ID inválido o inexistente no escribe ni crea accesos', async () => {
  for (const sedeId of [0, -1, 1.5, 'abc', null, 99999]) {
    const instance = probe(); const { response, body } = await request(instance, 'PATCH', { ...editPayload, sedeId });
    assert.equal(response.status, sedeId === 99999 ? 404 : 400); assert.ok(body.error); assert.deepEqual(instance.mutations, []);
  }
});

test('sedes: crear acceso para una sede sin usuario requiere usuario y clave inicial', async () => {
  const payload = { ...editPayload, sedeId: 3, nombre: 'SIN ACCESO QA', codigo: null, usuario: '', clave: '' };
  for (const [overrides, error] of [
    [{}, 'Debes definir el usuario de acceso para esta sede'],
    [{ usuario: 'sinaccesoqa' }, 'Debes definir la clave inicial para esta sede'],
  ]) {
    const instance = probe(); const { response, body } = await request(instance, 'PATCH', { ...payload, ...overrides });
    assert.equal(response.status, 400); assert.equal(body.error, error); assert.deepEqual(instance.mutations, []);
  }
  const instance = probe(); const { response, body } = await request(instance, 'PATCH', { ...payload, usuario: 'sinaccesoqa', clave: 'inicial-QA' });
  assert.equal(response.status, 200); assert.equal(body.mensaje, 'Acceso de sede creado correctamente'); assert.equal(body.sedes[2].acceso.usuario, 'sinaccesoqa');
  assert.equal(body.sedes[2].acceso.activo, true); assert.equal(body.sedes[2].activa, false); assert.deepEqual(instance.hashes, ['inicial-QA']);
});

test('sedes: rol USUARIO ausente impide creaciones sin producir cambios parciales', async () => {
  for (const [method, payload] of [['POST', createPayload], ['PATCH', { ...editPayload, sedeId: 3, nombre: 'SIN ACCESO QA', codigo: null, usuario: 'sinaccesoqa', clave: 'inicial-QA' }]]) {
    const instance = probe(administrator, { missingUserRole: true }); const { response, body } = await request(instance, method, payload);
    assert.equal(response.status, 500); assert.equal(body.error, 'No existe el rol USUARIO en el sistema'); assert.deepEqual(instance.mutations, []);
  }
});

test('sedes: fallo al crear acceso revierte la sede y nunca responde éxito', async () => {
  for (const failAt of ['sede.create', 'usuario.create', '$transaction']) {
    const instance = probe(administrator, { failAt }); const before = instance.state();
    const { response, body } = await request(instance, 'POST', createPayload);
    assert.equal(response.status, 500); assert.equal(body.error, 'Error creando sede'); assert.equal(body.ok, undefined);
    assert.deepEqual(instance.state(), before); assert.equal(instance.committedTransactions(), 0);
    if (failAt !== '$transaction') assert.ok(instance.mutations.some(row => row.method === failAt));
  }
});

test('sedes: fallo al actualizar acceso revierte nombre, Siigo y contraseña sin falso éxito', async () => {
  for (const failAt of ['sede.update', 'usuario.update', '$transaction']) {
    const instance = probe(administrator, { failAt }); const before = instance.state();
    const { response, body } = await request(instance, 'PATCH', { ...editPayload, nombre: 'CAMBIO QA', siigoEnabled: false, clave: 'otra-clave-QA' });
    assert.equal(response.status, 500); assert.equal(body.error, 'Error actualizando sede'); assert.equal(body.ok, undefined);
    assert.deepEqual(instance.state(), before); assert.equal(instance.committedTransactions(), 0);
    if (failAt !== '$transaction') assert.ok(instance.mutations.some(row => row.method === failAt));
  }
});

test('sedes: errores de lectura y esquema producen estado de error en lugar de listado vacío exitoso', async () => {
  for (const failAt of ['sede.findMany', 'schema']) {
    const instance = probe(administrator, { failAt }); const { response, body } = await request(instance, 'GET');
    assert.equal(response.status, 500); assert.equal(body.error, 'Error cargando sedes'); assert.equal(body.ok, undefined); assert.equal(body.sedes, undefined);
  }
});

const access = load('lib/access-control.ts');
const catalogs = {
  documentTypes: { results: [{ id: 101, prefix: 'SEDE-1' }] }, creditNoteDocumentTypes: [{ id: 102 }],
  users: [{ id: 202, name: 'Vendedor QA' }], paymentTypes: [{ id: 303, name: 'Efectivo QA' }],
  products: [{ id: 'prod-qa', code: '0001', name: 'Producto QA' }], costCenters: [{ id: 404, name: 'Centro QA' }],
};
function catalogProbe(user = administrator, fail = false) {
  let calls = 0;
  return {
    ...load('app/api/facturador/siigo/catalogos/route.ts', {
      'next/server': { NextResponse: { json: (body, options = {}) => Response.json(body, options) } },
      '@/lib/auth': { getSessionUser: async () => user }, '@/lib/access-control': access,
      '@/lib/siigo': {
        getSiigoSetupCatalogs: async () => { calls++; if (fail) throw Error('Siigo no disponible QA'); return catalogs; },
        getSiigoErrorMessage: error => error.message, getSiigoErrorStatus: () => 503,
      },
    }),
    calls: () => calls,
  };
}

test('catálogos Siigo: ADMIN y AUDITOR conservan resoluciones, vendedores, pagos, productos y centros de costo', async () => {
  for (const user of [administrator, auditor]) {
    const instance = catalogProbe(user); const { response, body } = await request(instance, 'GET');
    assert.equal(response.status, 200); assert.equal(body.ok, true); assert.deepEqual(body.catalogos, catalogs); assert.equal(instance.calls(), 1);
  }
});

test('catálogos Siigo: falta de permiso o caída del proveedor no devuelve catálogos vacíos exitosos', async () => {
  for (const user of [null, supervisor]) {
    const instance = catalogProbe(user); const { response, body } = await request(instance, 'GET');
    assert.equal(response.status, user ? 403 : 401); assert.ok(body.error); assert.equal(instance.calls(), 0);
  }
  const instance = catalogProbe(administrator, true); const { response, body } = await request(instance, 'GET');
  assert.equal(response.status, 503); assert.equal(body.error, 'Siigo no disponible QA'); assert.equal(body.ok, undefined); assert.equal(body.catalogos, undefined);
});
