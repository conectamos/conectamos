import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function load(path, imports) {
  const output = ts.transpileModule(readFileSync(join(ROOT, path), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, mod, mod.exports);
  return mod.exports;
}

const references = load("lib/inventory-references.ts", { "@/lib/prisma": {} });

function probe({ rows = [], schemaError = false, queryError = false } = {}) {
  const calls = { schema: 0, queries: [] };
  const { enriquecerRegistrosConCatalogo: enrich } = load("lib/record-catalog-media.ts", {
    "@/lib/prisma": {
      catalogoReferenciaInventario: {
        async findMany(args) {
          calls.queries.push(args);
          if (queryError) throw new Error("Catálogo no disponible");
          return rows.filter((row) =>
            args.where.nombreNormalizado.in.includes(row.nombreNormalizado)
            && row.eliminado === args.where.eliminado
          );
        },
      },
    },
    "@/lib/inventory-references": {
      ...references,
      async asegurarTablaCatalogoReferenciasInventario() {
        calls.schema++;
        if (schemaError) throw new Error("Esquema de catálogo no disponible");
      },
    },
  });
  return { enrich, calls };
}

const vivo = {
  nombre: "VIVO Y05",
  nombreNormalizado: "VIVO Y05",
  imagenUrl: "/productos/vivo-y05.webp",
  sistemaOperativo: "ANDROID",
  eliminado: false,
  activo: true,
};

test("asocia la foto exclusivamente a la referencia exacta normalizada", async () => {
  const { enrich } = probe({ rows: [vivo] });
  const result = await enrich([
    { id: 1, referenciaEquipo: "  vívo   y05 " },
    { id: 2, referenciaEquipo: "VIVO Y05 PRO" },
    { id: 3, referenciaEquipo: "VIVO" },
  ]);

  assert.deepEqual(result[0].catalogoEquipo, {
    referencia: "VIVO Y05", imagenUrl: vivo.imagenUrl, sistemaOperativo: "ANDROID",
  });
  assert.equal(result[1].catalogoEquipo, null);
  assert.equal(result[2].catalogoEquipo, null);
});

test("conserva orden, cifras, IMEI, documentos y evidencias sin mutar los registros autorizados", async () => {
  const source = [
    { id: 20, referenciaEquipo: "VIVO Y05", serialImei: "000123456789012", documentoNumero: "00123456", creditoAutorizado: 1_234_567.89, fotoEntregaDataUrl: "evidencia-del-cliente" },
    { id: 11, referenciaEquipo: "SIN CATÁLOGO", telefono: "3001234567", whatsapp: "3009876543", creditoAutorizado: null },
  ];
  const before = structuredClone(source);
  const { enrich } = probe({ rows: [vivo] });
  const result = await enrich(source);

  assert.deepEqual(source, before);
  assert.deepEqual(result.map((record) => Object.fromEntries(
    Object.entries(record).filter(([name]) => name !== "catalogoEquipo")
  )), before);
  assert.deepEqual(result.map((record) => record.id), [20, 11]);
  assert.equal(result[0].catalogoEquipo.imagenUrl, vivo.imagenUrl);
  assert.notEqual(result[0].catalogoEquipo.imagenUrl, source[0].fotoEntregaDataUrl);
  assert.equal(result[1].catalogoEquipo, null);
});

test("agrupa referencias repetidas en una sola consulta del catálogo", async () => {
  const { enrich, calls } = probe({ rows: [vivo] });
  const result = await enrich([
    { id: 1, referenciaEquipo: "VIVO Y05" },
    { id: 2, referenciaEquipo: "vivo y05" },
    { id: 3, referenciaEquipo: "  VIVO   Y05  " },
  ]);

  assert.equal(calls.schema, 1);
  assert.equal(calls.queries.length, 1);
  assert.deepEqual(calls.queries[0].where.nombreNormalizado.in, ["VIVO Y05"]);
  assert.equal(result.length, 3);
  assert.ok(result.every((record) => record.catalogoEquipo?.imagenUrl === vivo.imagenUrl));
});

test("ignora referencias eliminadas y conserva imágenes de referencias inactivas en registros históricos", async () => {
  const deleted = { ...vivo, nombre: "VIVO Y05 PRO", nombreNormalizado: "VIVO Y05 PRO", eliminado: true };
  const inactive = { ...vivo, activo: false };
  const { enrich, calls } = probe({ rows: [deleted, inactive] });
  const result = await enrich([
    { id: 1, referenciaEquipo: "VIVO Y05 PRO" },
    { id: 2, referenciaEquipo: "VIVO Y05" },
  ]);

  assert.equal(calls.queries[0].where.eliminado, false);
  assert.equal("activo" in calls.queries[0].where, false);
  assert.equal(result[0].catalogoEquipo, null);
  assert.equal(result[1].catalogoEquipo.imagenUrl, vivo.imagenUrl);
});

test("la ausencia de asociación no usa evidencias del registro como fotografía del equipo", async () => {
  const records = [{
    id: 1, referenciaEquipo: "IPHONE 16 PRO", firmaClienteDataUrl: "firma",
    fotoEntregaDataUrl: "entrega", facturaFotoDataUrl: "factura", cedulaFrenteDataUrl: "cédula",
  }];
  const { enrich } = probe();
  const result = await enrich(records);

  assert.deepEqual(result, records.map((record) => ({ ...record, catalogoEquipo: null })));
});

for (const failure of ["schemaError", "queryError"]) {
  test(`la búsqueda conserva sus datos si falla ${failure === "schemaError" ? "el esquema" : "la consulta"} del catálogo`, async () => {
    const records = [{ id: 1, referenciaEquipo: "VIVO Y05", serialImei: "000123456789012" }];
    const { enrich } = probe({ rows: [vivo], [failure]: true });

    assert.deepEqual(await enrich(records), records.map((record) => ({ ...record, catalogoEquipo: null })));
  });
}

test("sin registros autorizados o referencias no consulta ni crea el catálogo", async () => {
  const { enrich, calls } = probe();

  assert.deepEqual(await enrich([]), []);
  assert.deepEqual(await enrich([{ id: 1, referenciaEquipo: null }, { id: 2, referenciaEquipo: "   " }]), [
    { id: 1, referenciaEquipo: null, catalogoEquipo: null },
    { id: 2, referenciaEquipo: "   ", catalogoEquipo: null },
  ]);
  assert.deepEqual(calls, { schema: 0, queries: [] });
});
