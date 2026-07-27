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

function functionContainingAll(parsed, fragments) {
  const matches = descendants(
    parsed.sourceFile,
    (node) =>
      ts.isFunctionDeclaration(node) &&
      fragments.every((fragment) =>
        node.getText(parsed.sourceFile).includes(fragment)
      )
  );

  assert.equal(
    matches.length,
    1,
    `Se esperaba una funcion en ${parsed.relativePath} que contenga ${fragments.join(
      ", "
    )}`
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

test("la revision por periodo incluye exactamente las cuatro financieras solicitadas", () => {
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

test("la API acepta desde, hasta y una financiera por solicitud", () => {
  const parsed = parseSource(
    "app/api/vendedor/registros/inconsistencias/route.ts"
  );
  const flexible = functionContainingAll(parsed, [
    'url.searchParams.get("desde")',
    'url.searchParams.get("hasta")',
    'url.searchParams.get("proveedor")',
  ]);
  const text = flexible.getText(parsed.sourceFile);
  const takeProperties = descendants(
    flexible,
    (node) =>
      ts.isPropertyAssignment(node) &&
      node.name.getText(parsed.sourceFile) === "take"
  );

  assert.ok(text.includes("gte: rango.start"));
  assert.ok(text.includes("lt: rango.end"));
  assert.ok(text.includes('url.searchParams.get("cursor")'));
  assert.ok(text.includes('url.searchParams.get("snapshot")'));
  assert.ok(text.includes("proveedorDetalle !== proveedor"));
  assert.equal(
    takeProperties.length,
    0,
    "La revision por rango no puede truncar silenciosamente los registros"
  );
});

test("GET enruta desde y hasta al informe flexible sin limitarlo a hoy o ayer", () => {
  const parsed = parseSource(
    "app/api/vendedor/registros/inconsistencias/route.ts"
  );
  const get = functionNamed(parsed, "GET");
  const text = get.getText(parsed.sourceFile);

  assert.ok(text.includes('url.searchParams.has("desde")'));
  assert.ok(text.includes('url.searchParams.has("hasta")'));
  assert.ok(
    text.indexOf('url.searchParams.has("desde")') <
      text.indexOf("const hoy = getTodayBogotaDateKey()"),
    "La ruta flexible debe evaluarse antes del flujo historico de hoy/ayer"
  );
});

test("en cualquier periodo solo el valor autorizado puede generar diferencia financiera", () => {
  const parsed = parseSource(
    "app/api/vendedor/registros/inconsistencias/route.ts"
  );
  const flexible = functionContainingAll(parsed, [
    'url.searchParams.get("desde")',
    'url.searchParams.get("hasta")',
    'url.searchParams.get("proveedor")',
  ]);
  const comparisons = callsNamed(flexible, "compararNumero");

  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0].arguments[1].getText(parsed.sourceFile), '"Credito autorizado"');

  const text = flexible.getText(parsed.sourceFile);
  assert.equal(text.includes("La cedula del registro no coincide"), false);
  assert.equal(text.includes("El IMEI del registro no coincide"), false);
  assert.equal(text.includes("Fecha del credito:"), false);
  assert.equal(text.includes('"Valor cuota"'), false);
  assert.equal(text.includes('"Cuota inicial"'), false);
  assert.equal(text.includes('"Numero de cuotas"'), false);
  assert.equal(text.includes('"Frecuencia"'), false);
});

test("la pantalla permite DIA, RANGO o MES y seleccion multiple de financieras", () => {
  const parsed = parseSource(
    "app/vendedor/registros/inconsistencias/workspace.tsx"
  );

  assert.ok(parsed.sourceText.includes('type="month"'));
  assert.ok(parsed.sourceText.includes('type="date"'));
  assert.ok(parsed.sourceText.includes('"DIA"'));
  assert.ok(parsed.sourceText.includes('"RANGO"'));
  assert.ok(parsed.sourceText.includes('"MES"'));
  assert.ok(parsed.sourceText.includes("PROVEEDORES_MENSUALES"));
  assert.ok(parsed.sourceText.includes("proveedoresSeleccionados"));
  assert.ok(parsed.sourceText.includes("setProveedoresSeleccionados"));
  assert.ok(parsed.sourceText.includes('type="checkbox"'));
  assert.ok(
    parsed.sourceText.includes(
      "for (const proveedor of proveedoresSeleccionados)"
    )
  );
});

test("la pantalla normaliza dia, rango y mes a parametros desde/hasta", () => {
  const parsed = parseSource(
    "app/vendedor/registros/inconsistencias/workspace.tsx"
  );

  assert.ok(parsed.sourceText.includes("desde,"));
  assert.ok(parsed.sourceText.includes("hasta,"));
  assert.ok(parsed.sourceText.includes("proveedor,"));
  assert.ok(parsed.sourceText.includes("cursor: String(cursor)"));
  assert.ok(
    parsed.sourceText.includes(
      "Solo se valida el valor del credito; no se comparan cuota, plazo, inicial ni frecuencia."
    )
  );
});

test("los helpers por rango son separados de los helpers del registro", () => {
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

test("PayJoy por rango no consulta cuotas y limita el respaldo de cliente al periodo", () => {
  const parsed = parseSource("lib/payjoy-retail.ts");
  const monthly = functionNamed(parsed, "obtenerCreditosPayJoyEnRango");

  assert.equal(callsNamed(monthly, "completeWithPaymentSnapshot").length, 0);
  assert.equal(callsNamed(monthly, "getPayJoyPaymentSnapshot").length, 0);
  assert.equal(callsNamed(monthly, "lookupCustomerFinanceByImei").length, 0);
  assert.equal(
    monthly.getText(parsed.sourceFile).includes('"list-transactions.php"'),
    true
  );
  assert.equal(
    monthly.getText(parsed.sourceFile).includes('"lookup-customer.php"'),
    true
  );
  assert.ok(
    monthly
      .getText(parsed.sourceFile)
      .includes("fechaCreacionCredito >= fechaDesde")
  );
  assert.ok(
    monthly
      .getText(parsed.sourceFile)
      .includes("fechaCreacionCredito <= fechaHasta")
  );
});

test("PayJoy por rango consulta cada IMEI objetivo con el filtro oficial", () => {
  const payjoy = parseSource("lib/payjoy-retail.ts");
  const rangeLookup = functionNamed(
    payjoy,
    "obtenerCreditosPayJoyEnRango"
  );

  assert.equal(
    rangeLookup.parameters.length,
    3,
    "El helper por rango debe recibir identificadores, fecha inicial y fecha final"
  );
  assert.equal(
    rangeLookup.parameters[0].name.getText(payjoy.sourceFile),
    "identificadores",
    "El primer argumento debe ser la lista de IMEIs que se revisaran"
  );

  const transactionCalls = callsNamed(rangeLookup, "fetchPayJoy").filter(
    (call) =>
      call.arguments[0]?.getText(payjoy.sourceFile) ===
      '"list-transactions.php"'
  );

  assert.ok(
    transactionCalls.length > 0,
    "El helper por rango debe consultar list-transactions.php"
  );

  for (const call of transactionCalls) {
    const params = call.arguments[1];

    assert.ok(
      params && ts.isObjectLiteralExpression(params),
      "La consulta PayJoy debe declarar sus parametros de forma verificable"
    );

    const filter = params.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) &&
        property.name.getText(payjoy.sourceFile) === "filter"
    );

    assert.ok(
      filter && ts.isPropertyAssignment(filter),
      "Cada consulta por rango debe filtrar en la API por el IMEI objetivo"
    );
    assert.match(
      filter.initializer.getText(payjoy.sourceFile),
      /device\.imei:/,
      "Debe usarse el filtro oficial filter=device.imei:<imei>"
    );
  }

  const route = parseSource(
    "app/api/vendedor/registros/inconsistencias/route.ts"
  );
  const providerLookup = functionNamed(route, "consultarCreditosMensuales");
  const rangeCalls = callsNamed(
    providerLookup,
    "obtenerCreditosPayJoyEnRango"
  );

  assert.equal(rangeCalls.length, 1);
  assert.deepEqual(
    rangeCalls[0].arguments.map((argument) =>
      argument.getText(route.sourceFile)
    ),
    ["identificadores", "fechaInicio", "fechaFin"],
    "La ruta debe entregar al helper exactamente los IMEIs incluidos en el informe"
  );
});

test("un credito existente ya consumido por otro registro se muestra como duplicidad", () => {
  const parsed = parseSource(
    "app/api/vendedor/registros/inconsistencias/route.ts"
  );
  const flexible = functionContainingAll(parsed, [
    'url.searchParams.get("desde")',
    'url.searchParams.get("hasta")',
    'url.searchParams.get("proveedor")',
  ]);
  const text = flexible.getText(parsed.sourceFile);

  assert.ok(text.includes("const creditoYaAsignado"));
  assert.ok(text.includes('estado = "REVISAR"'));
  assert.ok(text.includes("si devolvio el credito"));
  assert.ok(text.includes("creditoParaMostrar"));
});
