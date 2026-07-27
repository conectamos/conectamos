import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CIERRE_PATH = "app/api/caja/cierre-dia/route.ts";
const EDITOR_PATH = "app/ventas/editar/[id]/page.tsx";

function parseSource(relativePath) {
  const absolutePath = join(ROOT, relativePath);
  const sourceText = readFileSync(absolutePath, "utf8");

  return {
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

function functionNamed(parsed, name) {
  const matches = descendants(
    parsed.sourceFile,
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name
  );

  assert.equal(matches.length, 1, `No se encontro una unica funcion ${name}`);
  return matches[0];
}

function callsNamed(node, name) {
  return descendants(
    node,
    (current) =>
      ts.isCallExpression(current) &&
      ((ts.isIdentifier(current.expression) &&
        current.expression.text === name) ||
        (ts.isPropertyAccessExpression(current.expression) &&
          current.expression.name.text === name))
  );
}

test("el cierre usa Venta como unica fuente de financieras e ingresos", () => {
  const parsed = parseSource(CIERRE_PATH);
  const financials = functionNamed(parsed, "financierasVentaDetalle");
  const incomes = functionNamed(parsed, "buildIngresosVenta");

  assert.equal(financials.parameters.length, 1);
  assert.equal(incomes.parameters.length, 1);
  assert.equal(
    financials.getText(parsed.sourceFile).includes("registro"),
    false
  );
  assert.equal(incomes.getText(parsed.sourceFile).includes("registro"), false);

  for (const call of callsNamed(
    parsed.sourceFile,
    "financierasVentaDetalle"
  )) {
    assert.equal(call.arguments.length, 1);
  }

  for (const call of callsNamed(parsed.sourceFile, "buildIngresosVenta")) {
    assert.equal(call.arguments.length, 1);
  }
});

test("el cierre prioriza la descripcion editada de Venta", () => {
  const parsed = parseSource(CIERRE_PATH);
  const equipment = functionNamed(parsed, "buildEquipoVenta");
  const body = equipment.getText(parsed.sourceFile);
  const saleDescriptionIndex = body.indexOf("venta.descripcion");
  const legacyReferenceIndex = body.indexOf("registro?.referenciaEquipo");

  assert.ok(saleDescriptionIndex >= 0);
  assert.ok(legacyReferenceIndex >= 0);
  assert.ok(
    saleDescriptionIndex < legacyReferenceIndex,
    "La descripcion actual de Venta debe preceder al fallback del registro"
  );
});

test("el editor conserva el tipo real del primer ingreso", () => {
  const parsed = parseSource(EDITOR_PATH);

  assert.match(
    parsed.sourceText,
    /const \[tipoIngreso1,\s*setTipoIngreso1\] = useState\("EFECTIVO"\)/
  );
  assert.match(parsed.sourceText, /setTipoIngreso1\(tipoPrincipal\)/);
  assert.match(parsed.sourceText, /tipoIngreso1,\s*\n\s*ingreso2Base:/);
  assert.equal(parsed.sourceText.includes("Tipo fijo: EFECTIVO"), false);
});
