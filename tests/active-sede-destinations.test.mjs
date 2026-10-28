import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sedes = [
  { id: 1, nombre: 'BODEGA PRINCIPAL', activa: true },
  { id: 2, nombre: 'SEDE ACTIVA', activa: true },
  { id: 3, nombre: 'SEDE RETIRADA', activa: false },
  { id: 4, nombre: 'VENTAS', activa: true },
  { id: 5, nombre: 'SEDE RESPUESTA ANTERIOR' },
];
const operativa = nombre => nombre !== 'VENTAS';
function readVariable(path, name, variables) {
  const ast = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  const declaration = page.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []).find(node => node.name.getText(ast) === name);
  assert.ok(declaration?.initializer, `Falta variable ${name}`);
  return new Function('useMemo', ...Object.keys(variables), `return (${declaration.initializer.getText(ast)});`)(fn => fn(), ...Object.values(variables));
}

test('API sedes conserva sedes retiradas para históricos e informa activa sin ampliar acceso anónimo', async () => {
  let query; let authenticated = true;
  const output = ts.transpileModule(source('app/api/sedes/route.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const imports = {
    'next/server': { NextResponse: { json: (data, opts) => Response.json(data, opts) } },
    '@/lib/auth': { getSessionUser: async () => authenticated ? { id: 1 } : null },
    '@/lib/prisma': { __esModule: true, default: { sede: { findMany: async args => { query = args; return sedes.map(sede => Object.fromEntries(Object.keys(args.select).map(key => [key, sede[key]]))); } } } },
  };
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => { assert.ok(name in imports); return imports[name]; }, loadedModule, loadedModule.exports);
  const response = await loadedModule.exports.GET(); const data = await response.json();
  assert.equal(response.status, 200); assert.equal(query.where, undefined);
  assert.deepEqual(query.select, { id: true, nombre: true, activa: true });
  assert.deepEqual(data.map(sede => sede.id), sedes.map(sede => sede.id)); assert.equal(data.find(sede => sede.id === 3).activa, false);
  authenticated = false; query = undefined; assert.equal((await loadedModule.exports.GET()).status, 401); assert.equal(query, undefined);
});

test('inventario mantiene sedes históricas pero excluye retiradas de préstamo masivo e individual', () => {
  const path = 'app/inventario/page.tsx';
  const destinations = readVariable(path, 'sedesDestinoMasivo', { sedes, esSedeOperativaInventario: operativa, itemsSeleccionadosParaPrestamo: [{ sedeId: 1 }] });
  assert.deepEqual(destinations.map(sede => sede.id), [2, 5]); assert.equal(sedes.length, 5);
  const ast = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let predicate;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast).replace(/\s+/g, '') === 'sedes.filter' && node.arguments[0]?.getText(ast).includes('itemPrestamo.sedeId')) predicate = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(predicate);
  const single = new Function('itemPrestamo', 'esSedeOperativaInventario', `return (${predicate});`)({ sedeId: 1 }, operativa);
  assert.deepEqual(sedes.filter(single).map(sede => sede.id), [2, 5]);
});

test('nuevo préstamo ofrece solo origen y destino activos, sin perder respuesta antigua compatible', () => {
  const path = 'app/prestamos/nuevo/page.tsx';
  const operativas = readVariable(path, 'sedesOperativasInventario', { sedes, esSedeOperativaInventario: operativa });
  assert.deepEqual(operativas.map(sede => sede.id), [1, 2, 5]);
  const destinations = readVariable(path, 'sedesDestinoDisponibles', { sedesOperativasInventario: operativas, sedeOrigenId: '1' });
  assert.deepEqual(destinations.map(sede => sede.id), [2, 5]);
});

test('principal conserva deudores retirados consultables y separa destinos activos de despacho', () => {
  const path = 'app/inventario-principal/page.tsx';
  const historical = readVariable(path, 'sedesDestinoOperativas', { sedes, esSedeOperativaInventario: operativa, NOMBRE_SEDE_BODEGA: 'BODEGA PRINCIPAL' });
  const active = readVariable(path, 'sedesDestinoActivas', { sedesDestinoOperativas: historical });
  assert.deepEqual(historical.map(sede => sede.id), [2, 3, 5]);
  assert.deepEqual(active.map(sede => sede.id), [2, 5]);
});
