import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
} from "node:fs";
import {
  join,
  relative,
} from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ALO_SOURCE_PATH = "lib/aloconsulta.ts";
const AUDITOR_ROUTE_PATH =
  "app/api/vendedor/registros/inconsistencias/route.ts";
const ALO_ROUTE_PATH = "app/api/vendedor/registros/alo-credito/route.ts";
const FINANCIAL_ROUTES_PATH =
  "app/api/vendedor/registros/creditos-financieras/route.ts";

const EXPECTED_ROUTE_CALLS = new Map([
  [ALO_ROUTE_PATH, "documento"],
  [FINANCIAL_ROUTES_PATH, "documento"],
  [AUDITOR_ROUTE_PATH, "identificador"],
]);

function parseSource(relativePath) {
  const absolutePath = join(ROOT, relativePath);
  const sourceText = readFileSync(absolutePath, "utf8");
  const scriptKind = relativePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;

  return {
    relativePath,
    sourceText,
    sourceFile: ts.createSourceFile(
      absolutePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
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
    `Se esperaba encontrar exactamente una funcion ${name} en ${parsed.relativePath}`
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
    `Se esperaba encontrar exactamente una variable ${name} en ${parsed.relativePath}`
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

function listSourceFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listSourceFiles(absolutePath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      files.push(absolutePath);
    }
  }

  return files;
}

function queryParameterNames(parsed) {
  return descendants(
    parsed.sourceFile,
    (node) => {
      if (
        !ts.isCallExpression(node) ||
        !ts.isPropertyAccessExpression(node.expression) ||
        node.expression.name.text !== "get" ||
        node.arguments.length !== 1 ||
        !ts.isStringLiteralLike(node.arguments[0])
      ) {
        return false;
      }

      const receiver = node.expression.expression;
      return (
        ts.isPropertyAccessExpression(receiver) &&
        receiver.name.text === "searchParams"
      );
    }
  ).map((call) => call.arguments[0].text.toLowerCase());
}

test("el helper de registro ALO recibe solo cedula y solo consulta PorCedula", () => {
  const parsed = parseSource(ALO_SOURCE_PATH);
  const unlocked = functionNamed(
    parsed,
    "obtenerCreditoAloParaRegistroUnlocked"
  );
  const publicHelper = functionNamed(
    parsed,
    "obtenerCreditoAloParaRegistro"
  );

  assert.equal(unlocked.parameters.length, 1);
  assert.equal(publicHelper.parameters.length, 1);
  assert.equal(unlocked.parameters[0].name.getText(parsed.sourceFile), "documentoValue");
  assert.equal(
    publicHelper.parameters[0].name.getText(parsed.sourceFile),
    "documentoValue"
  );

  const lookupCalls = descendants(
    unlocked,
    (node) =>
      ts.isCallExpression(node) &&
      String(calleeName(node) || "").startsWith("obtenerCreditoAlo")
  );

  assert.equal(lookupCalls.length, 1);
  assert.equal(calleeName(lookupCalls[0]), "obtenerCreditoAloPorCedula");
  assert.equal(lookupCalls[0].arguments.length, 1);
  assert.equal(
    lookupCalls[0].arguments[0].getText(parsed.sourceFile),
    "documento"
  );
  assert.equal(callsNamed(unlocked, "obtenerCreditoAloPorImei").length, 0);

  const unlockedCalls = callsNamed(
    publicHelper,
    "obtenerCreditoAloParaRegistroUnlocked"
  );
  assert.equal(unlockedCalls.length, 1);
  assert.equal(unlockedCalls[0].arguments.length, 1);
  assert.equal(
    unlockedCalls[0].arguments[0].getText(parsed.sourceFile),
    "documentoValue"
  );
});

test("el registro ALO por cedula conserva el enriquecimiento de cuota y plazo", () => {
  const parsed = parseSource(ALO_SOURCE_PATH);
  const byDocument = functionNamed(parsed, "obtenerCreditoAloPorCedula");
  const carteraCalls = callsNamed(
    byDocument,
    "completarCuotaPlazoDesdeCartera"
  );

  assert.equal(carteraCalls.length, 1);
  assert.deepEqual(
    carteraCalls[0].arguments.map((argument) =>
      argument.getText(parsed.sourceFile)
    ),
    ["session", "credito"]
  );
});

test("los tres callsites de rutas consultan ALO con un solo argumento", () => {
  const appDirectory = join(ROOT, "app");
  const calls = [];

  for (const absolutePath of listSourceFiles(appDirectory)) {
    const relativePath = relative(ROOT, absolutePath).replaceAll("\\", "/");
    const parsed = parseSource(relativePath);

    for (const call of callsNamed(
      parsed.sourceFile,
      "obtenerCreditoAloParaRegistro"
    )) {
      calls.push({ parsed, call });
    }
  }

  assert.deepEqual(
    calls.map(({ parsed }) => parsed.relativePath).sort(),
    [...EXPECTED_ROUTE_CALLS.keys()].sort()
  );

  for (const { parsed, call } of calls) {
    assert.equal(
      call.arguments.length,
      1,
      `${parsed.relativePath} debe consultar ALO solo por cedula`
    );
    assert.equal(
      call.arguments[0].getText(parsed.sourceFile),
      EXPECTED_ROUTE_CALLS.get(parsed.relativePath),
      `${parsed.relativePath} debe pasar el identificador de cedula esperado`
    );
  }
});

test("las rutas ALO no leen un IMEI desde los parametros de consulta", () => {
  for (const relativePath of EXPECTED_ROUTE_CALLS.keys()) {
    const parsed = parseSource(relativePath);
    const queryParameters = queryParameterNames(parsed);

    assert.equal(
      queryParameters.includes("imei"),
      false,
      `${relativePath} no debe leer el parametro imei para consultar ALO`
    );
    assert.equal(
      queryParameters.includes("serial"),
      false,
      `${relativePath} no debe usar serial como alias de IMEI para consultar ALO`
    );
  }
});

test("el auditor agrupa ALO por financiera y cedula, nunca por IMEI", () => {
  const parsed = parseSource(AUDITOR_ROUTE_PATH);
  const providers = variableNamed(parsed, "PROVEEDORES_POR_CEDULA");
  const providerNames = descendants(
    providers.initializer,
    (node) => ts.isStringLiteralLike(node)
  ).map((node) => node.text);

  assert.ok(providerNames.includes("ALO CREDIT"));

  const keyFunction = functionNamed(parsed, "claveConsulta");
  const conditionals = descendants(
    keyFunction,
    (node) => ts.isConditionalExpression(node)
  );
  assert.equal(conditionals.length, 1);

  const identifierChoice = conditionals[0];
  assert.equal(
    identifierChoice.condition.getText(parsed.sourceFile),
    "PROVEEDORES_POR_CEDULA.has(item.proveedor)"
  );
  assert.equal(
    identifierChoice.whenTrue.getText(parsed.sourceFile),
    "soloDigitos(item.documentoNumero)"
  );
  assert.equal(
    identifierChoice.whenFalse.getText(parsed.sourceFile),
    "soloDigitos(item.serialImei)"
  );

  const returns = descendants(
    keyFunction,
    (node) => ts.isReturnStatement(node)
  );
  assert.equal(returns.length, 1);
  assert.equal(
    returns[0].expression?.getText(parsed.sourceFile),
    "`${item.proveedor}:${identificador}`"
  );
});

test("el auditor compara IMEI solo en proveedores consultados por IMEI", () => {
  const parsed = parseSource(AUDITOR_ROUTE_PATH);
  const imeiComparisons = descendants(
    parsed.sourceFile,
    (node) => {
      if (!ts.isIfStatement(node)) {
        return false;
      }

      const conditionText = node.expression.getText(parsed.sourceFile);
      return (
        conditionText.includes("creditoPlataforma.imei") &&
        conditionText.includes("item.serialImei")
      );
    }
  );

  assert.equal(imeiComparisons.length, 1);
  assert.ok(
    imeiComparisons[0].expression
      .getText(parsed.sourceFile)
      .includes("!PROVEEDORES_POR_CEDULA.has(item.proveedor)"),
    "La comparacion de IMEI debe excluir todos los proveedores consultados por cedula"
  );
});

test("el auditor solo compara el credito autorizado como dato financiero", () => {
  const parsed = parseSource(AUDITOR_ROUTE_PATH);
  const financialComparisons = callsNamed(
    parsed.sourceFile,
    "compararNumero"
  ).map((call) =>
    call.arguments.length >= 2 && ts.isStringLiteralLike(call.arguments[1])
      ? call.arguments[1].text
      : null
  );

  assert.equal(
    financialComparisons.length,
    1,
    "El auditor no debe comparar cuota, plazo ni otros valores financieros"
  );
  assert.deepEqual(financialComparisons, ["Credito autorizado"]);
  assert.equal(
    parsed.sourceText.includes("Frecuencia: Conectamos"),
    false,
    "El auditor no debe comparar la frecuencia de pago"
  );
});
