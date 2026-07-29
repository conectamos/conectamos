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

test("el centro de operaciones muestra Panel analítico en una rama visible para supervisores", () => {
  const parsed = parseSource(
    "app/dashboard/_components/operations-dashboard.tsx"
  );
  const toolGroups = variableNamed(parsed, "defaultToolGroups");
  const supervisorBranches = descendants(
    toolGroups,
    (node) => {
      if (!ts.isConditionalExpression(node)) return false;

      const condition = node.condition
        .getText(parsed.sourceFile)
        .replace(/\s+/g, "");

      return (
        condition.includes("esAdmin") &&
        condition.includes("esSupervisor") &&
        condition.includes("||")
      );
    }
  );

  assert.ok(
    supervisorBranches.length > 0,
    "Debe existir una rama de herramientas habilitada para administrador o supervisor"
  );

  const supervisorVisibleText = supervisorBranches
    .map((branch) => branch.whenTrue.getText(parsed.sourceFile))
    .join("\n");

  assert.ok(
    supervisorVisibleText.includes('href: "/dashboard/analitico"'),
    "La rama visible para supervisores debe enlazar directamente al panel analítico"
  );
  assert.ok(
    supervisorVisibleText.includes('label: "Panel analítico"'),
    "El enlace para supervisores debe mostrarse explícitamente como Panel analítico"
  );
});

test("el dashboard identifica al supervisor y entrega esa condición al panel operativo", () => {
  const parsed = parseSource("app/dashboard/page.tsx");
  const esSupervisor = variableNamed(parsed, "esSupervisor");
  const initializer = esSupervisor.initializer?.getText(parsed.sourceFile) ?? "";

  assert.ok(
    initializer.includes("esPerfilSupervisor(session.perfilTipo)"),
    "El dashboard debe reconocer el perfil SUPERVISOR_TIENDA"
  );
  assert.ok(
    initializer.includes('"SUPERVISOR"'),
    "El dashboard debe conservar compatibilidad con el rol supervisor"
  );
  assert.ok(
    parsed.sourceText.includes("esSupervisor={esSupervisor}"),
    "OperationsDashboard debe recibir la condición real de supervisor"
  );
});

test("el layout permite llegar al panel y conserva la clave de sede para supervisores", () => {
  const parsed = parseSource("app/dashboard/analitico/layout.tsx");

  assert.ok(parsed.sourceText.includes("await requireNonVendorPage()"));
  assert.ok(
    parsed.sourceText.includes("if (!esPerfilSupervisor(user.perfilTipo))")
  );
  assert.ok(parsed.sourceText.includes("return children"));
  assert.ok(parsed.sourceText.includes("allowAdminBypass: false"));
  assert.ok(parsed.sourceText.includes("<FinancialAccessGate"));
});

test("la API no rechaza supervisores y limita su consulta a la sede activa", () => {
  const parsed = parseSource("app/api/dashboard/analitico/route.ts");
  const get = functionNamed(parsed, "GET");
  const accessDenials = descendants(
    get,
    (node) =>
      ts.isIfStatement(node) &&
      node.expression
        .getText(parsed.sourceFile)
        .includes("esPerfilRegistroVenta")
  );

  assert.equal(
    accessDenials.length,
    1,
    "Debe existir una única validación que rechace perfiles de registro de venta"
  );

  const deniedCondition = accessDenials[0].expression.getText(parsed.sourceFile);
  assert.ok(deniedCondition.includes("esPerfilFacturador"));
  assert.equal(
    deniedCondition.includes("esPerfilSupervisor"),
    false,
    "El supervisor no puede quedar incluido en la condición de acceso denegado"
  );

  const supervisorChecks = descendants(
    get,
    (node) =>
      ts.isIfStatement(node) &&
      node.expression
        .getText(parsed.sourceFile)
        .includes("esPerfilSupervisor(user.perfilTipo)")
  );

  assert.equal(
    supervisorChecks.length,
    1,
    "La API debe validar el acceso de sede del supervisor"
  );

  const supervisorBlock = supervisorChecks[0].thenStatement.getText(
    parsed.sourceFile
  );
  assert.ok(supervisorBlock.includes("getFinancialAccessState"));
  assert.ok(supervisorBlock.includes("!access.authorized"));
  assert.ok(
    get.getText(parsed.sourceFile).includes(": user.sedeId"),
    "Un supervisor solo debe consultar la sede de su sesión"
  );
});
