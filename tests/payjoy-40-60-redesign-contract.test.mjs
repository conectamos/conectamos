import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(
  new URL("../app/dashboard/payjoy/40-60/page.tsx", import.meta.url),
  "utf8"
);
const workspaceSource = await readFile(
  new URL(
    "../app/dashboard/payjoy/_components/payjoy-40-60-workspace.tsx",
    import.meta.url
  ),
  "utf8"
);

test("PayJoy 40/60 conserva acceso ADMIN/AUDITOR y borrado exclusivo de ADMIN", () => {
  assert.match(pageSource, /\["ADMIN", "AUDITOR"\]/);
  assert.match(pageSource, /puedeEliminar=.*=== "ADMIN"/s);
  assert.match(workspaceSource, /\{puedeEliminar && \(/);
  assert.match(workspaceSource, /method: "DELETE"/);
});

test("el rediseño usa el shell operativo compartido y muestra la sesión", () => {
  assert.match(workspaceSource, /DashboardSidebar/);
  assert.match(workspaceSource, /activeHref="\/caja"/);
  assert.match(workspaceSource, /LogoutButton/);
  assert.match(workspaceSource, /Validación PayJoy 40\/60/);
  assert.match(workspaceSource, /Acceso: ADMIN \/ AUDITOR/);
  assert.match(pageSource, /user=\{\{/);
});

test("el flujo de carga, WEEK y persistencia conserva los endpoints existentes", () => {
  for (const endpoint of [
    "/api/payjoy/40-60/weeks",
    "/api/payjoy/40-60",
    "/api/payjoy/40-60/registros",
  ]) {
    assert.ok(workspaceSource.includes(endpoint), `Falta el endpoint ${endpoint}`);
  }

  assert.match(workspaceSource, /formData\.append\("file", selectedFile\)/);
  assert.match(workspaceSource, /formData\.append\("week", selectedWeek\)/);
  assert.match(workspaceSource, /method: "POST"/);
  assert.match(workspaceSource, /method: "PATCH"/);
});

test("la tabla pagina solo la vista pero guarda y resume todas las filas", () => {
  assert.match(workspaceSource, /const pageSize = 25/);
  assert.match(workspaceSource, /paginatedRows\.map/);
  assert.match(workspaceSource, /summary: liveSummary/);
  assert.match(workspaceSource, /rows,\s*\n\s*};/);
  assert.doesNotMatch(workspaceSource, /summary: summarizeRows\(paginatedRows\)/);
  assert.doesNotMatch(workspaceSource, /rows: paginatedRows/);
});

test("el historial se puede consultar antes de procesar un archivo", () => {
  const historyIndex = workspaceSource.indexOf("Historial disponible");
  const processedDataIndex = workspaceSource.indexOf("{data && (");

  assert.ok(historyIndex > -1, "Falta el acceso inicial al historial");
  assert.ok(processedDataIndex > -1, "Falta el bloque de resultados procesados");
  assert.ok(
    historyIndex < processedDataIndex,
    "El historial inicial debe estar fuera del bloque condicionado por data"
  );
  assert.match(workspaceSource, /!data && \(/);
  assert.match(workspaceSource, /loadStoredRecord\(record\.id\)/);
});
