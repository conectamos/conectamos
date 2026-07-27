import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

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

function functionNamed(parsed, name) {
  const matches = descendants(
    parsed.sourceFile,
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name
  );

  assert.equal(
    matches.length,
    1,
    `Se esperaba una funcion ${name} en ${parsed.relativePath}`
  );
  return matches[0];
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

function calleeName(call) {
  if (ts.isIdentifier(call.expression)) {
    return call.expression.text;
  }

  if (ts.isPropertyAccessExpression(call.expression)) {
    return call.expression.name.text;
  }

  return null;
}

function callsNamed(node, name) {
  return descendants(
    node,
    (current) =>
      ts.isCallExpression(current) &&
      calleeName(current) === name
  );
}

test("el modo mensual incluye exactamente las cuatro financieras solicitadas", () => {
  const parsed = parseSource(
    "app/api/vendedor/registros/inconsistencias/route.ts"
  );
  const providers = variableNamed(parsed, "PROVEEDORES_MENSUALES");
  const values = descendants(
    providers.initializer,
    (node) => ts.isStringLiteralLike(node)
  ).map((node) => node.text);

  assert.deepEqual(values, ["PAYJOY", "SUMASPAY", "ESMIO", "ADDI"]);
});

test("la revision mensual usa mes completo, pagina grupos y no aplica el tope diario", () => {
  const parsed = parseSource(
    "app/api/vendedor/registros/inconsistencias/route.ts"
  );
  const monthly = functionNamed(parsed, "revisarInconsistenciasMensuales");
  const text = monthly.getText(parsed.sourceFile);
  const takeProperties = descendants(
    monthly,
    (node) =>
      ts.isPropertyAssignment(node) &&
      node.name.getText(parsed.sourceFile) === "take"
  );

  assert.ok(text.includes("getBogotaMonthRangeFromInput(mes)"));
  assert.ok(text.includes('url.searchParams.get("cursor")'));
  assert.ok(text.includes("claveGrupoMensual(item)"));
  assert.equal(
    takeProperties.length,
    0,
    "El modo mensual no puede truncar silenciosamente a 60 registros"
  );
});

test("en mensual solo el valor autorizado puede generar diferencia financiera", () => {
  const parsed = parseSource(
    "app/api/vendedor/registros/inconsistencias/route.ts"
  );
  const monthly = functionNamed(parsed, "revisarInconsistenciasMensuales");
  const comparisons = callsNamed(monthly, "compararNumero");

  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0].arguments[1].getText(parsed.sourceFile), '"Credito autorizado"');

  const text = monthly.getText(parsed.sourceFile);
  assert.equal(text.includes("La cedula del registro no coincide"), false);
  assert.equal(text.includes("El IMEI del registro no coincide"), false);
  assert.equal(text.includes("Fecha del credito:"), false);
});

test("la pantalla solicita cada financiera por mes y conserva el modo diario", () => {
  const parsed = parseSource(
    "app/vendedor/registros/inconsistencias/workspace.tsx"
  );

  assert.ok(parsed.sourceText.includes('type="month"'));
  assert.ok(parsed.sourceText.includes('type="date"'));
  assert.ok(parsed.sourceText.includes("PROVEEDORES_MENSUALES"));
  assert.ok(parsed.sourceText.includes("mes,"));
  assert.ok(parsed.sourceText.includes("proveedor,"));
  assert.ok(parsed.sourceText.includes("cursor: String(cursor)"));
  assert.ok(
    parsed.sourceText.includes(
      "Solo se valida el valor del credito; no se comparan cuota, plazo, inicial ni frecuencia."
    )
  );
});

test("los helpers mensuales son separados de los helpers del registro", () => {
  const contracts = [
    [
      "lib/payjoy-retail.ts",
      "obtenerCreditosPayJoyEnRango",
      "obtenerCreditoPayJoyPorImei",
    ],
    [
      "lib/sumasconsulta.ts",
      "obtenerCreditosSumasPayPorCedulasEnRango",
      "obtenerCreditoSumasPayPorCedula",
    ],
    [
      "lib/esmiopcionconsulta.ts",
      "obtenerCreditosEsmioOpcionPorCedulasEnRango",
      "obtenerCreditoEsmioOpcionPorCedula",
    ],
    [
      "lib/addiconsulta.ts",
      "obtenerCreditosAddiPorCedulasEnRango",
      "obtenerCreditoAddiPorCedula",
    ],
  ];

  for (const [path, monthlyName, registrationName] of contracts) {
    const parsed = parseSource(path);

    functionNamed(parsed, monthlyName);
    functionNamed(parsed, registrationName);
  }
});

test("PayJoy mensual no consulta cuotas ni el credito activo del cliente", () => {
  const parsed = parseSource("lib/payjoy-retail.ts");
  const monthly = functionNamed(parsed, "obtenerCreditosPayJoyEnRango");

  assert.equal(callsNamed(monthly, "completeWithPaymentSnapshot").length, 0);
  assert.equal(callsNamed(monthly, "getPayJoyPaymentSnapshot").length, 0);
  assert.equal(callsNamed(monthly, "lookupCustomerFinanceByImei").length, 0);
  assert.equal(
    monthly.getText(parsed.sourceFile).includes('"list-transactions.php"'),
    true
  );
});
