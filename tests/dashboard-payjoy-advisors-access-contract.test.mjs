import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const operations = readFileSync(
  join(ROOT, "app/dashboard/_components/operations-dashboard.tsx"),
  "utf8"
);
const dashboard = readFileSync(join(ROOT, "app/dashboard/page.tsx"), "utf8");
const accessControl = readFileSync(join(ROOT, "lib/access-control.ts"), "utf8");

test("el ranking PAYJOY usa el control administrativo existente", () => {
  assert.match(
    dashboard,
    /const esAdmin = esRolAdministrativo\(session\.rolNombre\)/
  );
  assert.match(dashboard, /esAdmin=\{esAdmin\}/);
  assert.match(
    accessControl,
    /return esRolAdmin\(rolNombre\) \|\| esRolAuditor\(rolNombre\)/
  );
});

test("todo el panel PAYJOY incluido su error queda limitado a ADMIN y AUDITOR", () => {
  const panelIndex = operations.indexOf("<PayJoyAdvisorsPanel");
  assert.ok(panelIndex > 0, "Debe existir el panel de asesores PAYJOY");

  const guardIndex = operations.lastIndexOf("{esAdmin ? (", panelIndex);
  assert.ok(guardIndex > 0, "El panel debe estar dentro de la rama esAdmin");

  const guardEnd = operations.indexOf(") : null}", panelIndex);
  assert.ok(guardEnd > panelIndex, "La rama administrativa debe cerrarse despues del panel");

  const guardedMarkup = operations.slice(guardIndex, guardEnd);
  assert.match(guardedMarkup, /<PayJoyAdvisorsPanel/);
  assert.match(guardedMarkup, /Datos no disponibles temporalmente/);
  assert.equal((operations.match(/<PayJoyAdvisorsPanel/g) || []).length, 1);
});

test("el ranking conserva el limite top 10 y no muestra montos", () => {
  const start = operations.indexOf("function PayJoyAdvisorsPanel(");
  const end = operations.indexOf("function QuickActions(", start);
  const panel = operations.slice(start, end);

  assert.match(panel, /asesores\.slice\(0, 10\)/);
  assert.doesNotMatch(panel, /asesor\.monto|formatoPesos/);
  assert.match(panel, /Puestos 4-10/);
});