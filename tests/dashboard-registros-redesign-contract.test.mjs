import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const WORKSPACE_PATH = "app/facturador/registros/workspace.tsx";

function parseSource(relativePath) {
  const absolutePath = join(ROOT, relativePath);
  const sourceText = readFileSync(absolutePath, "utf8");

  return {
    relativePath,
    sourceText,
    sourceFile: ts.createSourceFile(
      absolutePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    ),
  };
}

function descendants(node, predicate) {
  const matches = [];

  const visit = (current) => {
    if (predicate(current)) {
      matches.push(current);
    }

    ts.forEachChild(current, visit);
  };

  visit(node);
  return matches;
}

function variableNamed(parsed, name) {
  const matches = descendants(
    parsed.sourceFile,
    (node) =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
  );

  assert.equal(
    matches.length,
    1,
    `Se esperaba una variable ${name} en ${parsed.relativePath}`
  );

  return matches[0];
}

function functionOrVariableNamed(parsed, name) {
  const functions = descendants(
    parsed.sourceFile,
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name
  );
  const variables = descendants(
    parsed.sourceFile,
    (node) =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
  );

  assert.equal(
    functions.length + variables.length,
    1,
    `Se esperaba una funcion o variable ${name} en ${parsed.relativePath}`
  );

  return functions[0] ?? variables[0];
}

test("el listado pagina localmente de 25 en 25 y renderiza solo la pagina activa", () => {
  const parsed = parseSource(WORKSPACE_PATH);
  const pageSize = variableNamed(parsed, "REGISTROS_POR_PAGINA");
  const paginated = variableNamed(parsed, "registrosPaginados");
  const pageSizeValue = pageSize.initializer?.getText(parsed.sourceFile);
  const paginationLogic = paginated.initializer?.getText(parsed.sourceFile) ?? "";

  assert.equal(
    pageSizeValue,
    "25",
    "El rediseño debe limitar cada pagina local a 25 registros"
  );
  assert.ok(
    paginationLogic.includes("registrosFiltrados.slice"),
    "registrosPaginados debe derivarse del resultado ya filtrado"
  );
  assert.ok(
    paginationLogic.includes("paginaActual") &&
      paginationLogic.includes("REGISTROS_POR_PAGINA"),
    "La ventana visible debe depender de la pagina actual y del tamaño configurado"
  );
  assert.ok(
    parsed.sourceText.includes("registrosPaginados.map((registro)"),
    "La tabla debe renderizar registrosPaginados y no todos los registros filtrados"
  );
  assert.ok(
    parsed.sourceText.includes("setPaginaActual"),
    "El listado debe conservar controles que permitan cambiar la pagina"
  );
});

test("el rediseño usa el shell operativo compartido y conserva el sidebar", () => {
  const parsed = parseSource(WORKSPACE_PATH);

  assert.ok(
    parsed.sourceText.includes("DashboardSidebar") &&
      parsed.sourceText.includes("<DashboardSidebar"),
    "La pantalla debe reutilizar DashboardSidebar"
  );
  assert.ok(
    parsed.sourceText.includes("<LogoutButton"),
    "El encabezado debe mantener el cierre de sesion del shell compartido"
  );
  assert.ok(
    parsed.sourceText.includes('className="lg:pl-[252px]"'),
    "El contenido debe reservar el ancho del sidebar en escritorio"
  );
  assert.ok(
    parsed.sourceText.includes('bg-[#f5f6f8]'),
    "El shell debe conservar el fondo neutro del sistema visual"
  );
});

test("el rediseño conserva los endpoints y las acciones operativas de registros y Siigo", () => {
  const parsed = parseSource(WORKSPACE_PATH);
  const requiredFunctions = [
    "cargarRegistros",
    "guardarFactura",
    "emitirFacturaSiigo",
    "reenviarCorreoSiigo",
    "facturarPendientesSiigo",
    "consultarReporteSiigo",
    "emitirNotaCreditoSiigo",
    "quitarFacturaBorradaSiigo",
    "guardarEdicion",
    "eliminarRegistro",
  ];

  for (const name of requiredFunctions) {
    functionOrVariableNamed(parsed, name);
  }

  for (const endpoint of [
    '"/api/facturador/registros"',
    '"/api/facturador/siigo"',
    "`/api/facturador/siigo/reporte?${params}`",
    '"/api/ventas/catalogo-personal"',
  ]) {
    assert.ok(
      parsed.sourceText.includes(endpoint),
      `Debe conservarse el endpoint ${endpoint}`
    );
  }

  for (const mode of [
    'modo: "REENVIAR_CORREO"',
    'modo: "FACTURAR_PENDIENTES"',
    'modo: "NOTA_CREDITO"',
    'modo: "QUITAR_FACTURA_BORRADA"',
    'modo: "EDITAR"',
    'modo: "ELIMINAR"',
  ]) {
    assert.ok(
      parsed.sourceText.includes(mode),
      `Debe conservarse la accion ${mode}`
    );
  }
});
