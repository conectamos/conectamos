import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildPrincipalWarehouseAvailability } from "../lib/radar-inventory-export.ts";

const ROOT = process.cwd();

test("agrupa referencias disponibles de bodega principal sin duplicar variantes", () => {
  const rows = buildPrincipalWarehouseAvailability([
    { referencia: "Samsung A16" },
    { referencia: " samsung   a16 " },
    { referencia: "MOTOROLA G55" },
    { referencia: "SAMSUNG A16" },
  ]);

  assert.deepEqual(rows, [
    { referencia: "SAMSUNG A16", cantidad: 3 },
    { referencia: "MOTOROLA G55", cantidad: 1 },
  ]);
});

test("aplica la busqueda del radar al archivo de bodega principal", () => {
  const rows = buildPrincipalWarehouseAvailability(
    [
      { referencia: "Samsung A16" },
      { referencia: "Motorola G55" },
      { referencia: "Samsung A26" },
    ],
    "sámsung"
  );

  assert.deepEqual(rows, [
    { referencia: "SAMSUNG A16", cantidad: 1 },
    { referencia: "SAMSUNG A26", cantidad: 1 },
  ]);
});

test("el exportador consulta solo BODEGA y conserva los permisos del Radar", () => {
  const route = readFileSync(
    join(ROOT, "app/api/dashboard/radar/export/route.ts"),
    "utf8"
  );
  const workspace = readFileSync(
    join(ROOT, "app/dashboard/radar/workspace.tsx"),
    "utf8"
  );

  assert.match(route, /estado:\s*"BODEGA"/);
  assert.match(route, /esRolAdministrativo\(session\.rolNombre\)/);
  assert.match(route, /esPerfilSupervisor\(session\.perfilTipo\)/);
  assert.match(route, /esPerfilApoyoOperativo\(session\.perfilTipo\)/);
  assert.match(route, /CANTIDAD DISPONIBLE/);
  assert.match(workspace, /<option value="PRINCIPAL">Bodega principal<\/option>/);
  assert.match(workspace, /\/api\/dashboard\/radar\/export/);
});
