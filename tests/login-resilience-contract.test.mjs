import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fetchJsonWithTimeout } from "../lib/fetch-json-with-timeout.ts";

const ROOT = process.cwd();

function source(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("el formulario de acceso configura timeout y recupera el boton", () => {
  const page = source("app/page.tsx");
  const fetchHelper = source("lib/fetch-json-with-timeout.ts");

  assert.match(page, /LOGIN_REQUEST_TIMEOUT_MS\s*=\s*20_000/);
  assert.match(page, /fetchJsonWithTimeout<LoginApiPayload>/);
  assert.match(fetchHelper, /new AbortController\(\)/);
  assert.match(fetchHelper, /\(\) => controller\.abort\(\)/);
  assert.match(fetchHelper, /signal:\s*controller\.signal/);
  assert.match(page, /El servidor tardó demasiado en responder/);
  assert.match(page, /finally\s*{\s*setCargando\(false\)/);
});

test("cancela de verdad un fetch que queda pendiente", async () => {
  let aborted = false;
  const pendingFetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          aborted = true;
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        },
        { once: true }
      );
    });

  await assert.rejects(
    fetchJsonWithTimeout("https://example.invalid", undefined, 10, pendingFetch),
    (error) => error instanceof Error && error.name === "AbortError"
  );
  assert.equal(aborted, true);
});

test("rechaza una respuesta exitosa que no contiene JSON", async () => {
  const htmlFetch = async () =>
    new Response("<html>Error del proxy</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });

  await assert.rejects(
    fetchJsonWithTimeout("https://example.invalid", undefined, 100, htmlFetch),
    /respuesta inválida/
  );
});

test("el acceso y las sesiones no ejecutan DDL durante solicitudes HTTP", () => {
  const requestPathFiles = [
    "app/api/login/route.ts",
    "app/api/login/perfil/route.ts",
    "app/api/login/perfil/cambiar-pin/route.ts",
    "app/api/session/heartbeat/route.ts",
    "app/api/logout/route.ts",
    "app/api/admin/cambiar-clave/route.ts",
    "lib/session-state.ts",
  ];

  for (const path of requestPathFiles) {
    const fileSource = source(path);
    assert.doesNotMatch(fileSource, /ensureSessionStateSchema/);
    assert.doesNotMatch(fileSource, /ALTER TABLE/);
  }

  const vendorProfiles = source("lib/vendor-profiles.ts");
  const vendorEarnings = source("lib/vendor-earnings.ts");
  const accessFunctions = vendorProfiles.slice(
    vendorProfiles.indexOf("export async function obtenerPerfilesAccesoPorSede"),
    vendorProfiles.indexOf("export async function crearPerfilVendedor")
  );
  assert.doesNotMatch(accessFunctions, /ensureVendorProfilesSchema/);
  assert.doesNotMatch(vendorEarnings, /ensureVendorProfilesSchema/);
});

test("la migracion de sesiones es explicita, aditiva y tiene limites de bloqueo", () => {
  const migration = source("scripts/apply-session-state-schema.sql");
  const prisma = source("lib/prisma.ts");

  assert.match(migration, /SET LOCAL lock_timeout = '5s'/);
  assert.match(migration, /SET LOCAL statement_timeout = '30s'/);
  assert.match(migration, /ALTER TABLE "Usuario"/);
  assert.match(migration, /ALTER TABLE "PerfilVendedor"/);
  assert.equal((migration.match(/ADD COLUMN IF NOT EXISTS/g) || []).length, 4);
  assert.match(prisma, /connectionTimeoutMillis:\s*10_000/);
  assert.match(prisma, /lock_timeout:\s*10_000/);
  assert.match(prisma, /query_timeout:\s*60_000/);
  assert.match(prisma, /statement_timeout:\s*60_000/);
  assert.match(prisma, /globalForPrisma\.prisma = prisma/);
  assert.doesNotMatch(prisma, /NODE_ENV\s*!==\s*["']production["']/);
});
