/* eslint-disable @typescript-eslint/no-require-imports -- Loads Next's actual CommonJS build output. */
// Run after next build. Exercises the deployed bundle with synthetic data only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const buildDir = path.resolve(".next");
  const route = "server/app/api/proveedores/[id]/abonos/[abonoId]/recibo/route.js";
  const routeFile = path.join(buildDir, route);
  const source = fs.readFileSync(routeFile, "utf8");
  const runtime = require(path.join(buildDir, "server/chunks/[turbopack]_runtime.js"))(route);
  let generatorId;

  // Load only registered chunks, not the route/session/database handler.
  for (const [, chunk] of source.matchAll(/R\.c\("([^"]+)"\)/g)) {
    runtime.c(chunk);
    const modules = require(path.join(buildDir, chunk));
    for (let i = 1; i < modules.length; i++) {
      if (
        typeof modules[i] === "function" &&
        modules[i].toString().includes('"generarReciboAbonoProveedorPdf"') &&
        modules[i].toString().includes("RECIBO DE ABONO A PROVEEDOR")
      ) {
        generatorId = modules[i - 1];
      }
    }
  }
  assert.notEqual(generatorId, undefined, "Receipt generator must exist in the built route");

  const trace = JSON.parse(fs.readFileSync(routeFile + ".nft.json", "utf8"));
  for (const asset of [
    "public/pdf-fonts/Geist-Regular.ttf",
    "public/branding/conectamos-logo.png",
  ]) {
    assert.ok(trace.files.some((file) => file.replaceAll("\\", "/").endsWith(asset)),
      "Receipt trace must include " + asset);
    assert.ok(fs.existsSync(path.resolve(asset)), "Receipt asset must be available: " + asset);
  }

  const originalExists = fs.existsSync;
  const originalRead = fs.readFileSync;
  let afmAttempts = 0;
  let bundledFontReads = 0;
  fs.existsSync = function (file) {
    if (/[/\\]arial(?:bd)?\.ttf$/i.test(String(file))) return false;
    return originalExists.apply(this, arguments);
  };
  fs.readFileSync = function (file) {
    if (/\.afm$/i.test(String(file))) {
      afmAttempts++;
      throw Object.assign(new Error("AFM unavailable in production"), { code: "ENOENT" });
    }
    if (String(file).endsWith("Geist-Regular.ttf")) bundledFontReads++;
    return originalRead.apply(this, arguments);
  };
  try {
    const { generarReciboAbonoProveedorPdf } = runtime.m(generatorId).exports;
    const pdf = await generarReciboAbonoProveedorPdf({
      aliado: "ALIADO DE PRUEBA",
      aprobadoEn: new Date("2026-09-09T17:00:00Z"),
      aprobadoPorNombre: "Prueba automatizada",
      facturaId: 999999,
      fechaVencimiento: "2026-09-10",
      id: 999999,
      numeroFactura: "PRUEBA-SIN-REGISTRO",
      observacion: "Documento de prueba. No registra ni modifica pagos.",
      referencia: "PRUEBA PDF",
      saldoAnterior: "100000",
      saldoPosterior: "60000",
      valor: "40000",
      valorFactura: "100000",
    });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.match(pdf.subarray(-100).toString(), /%%EOF/);
    assert.ok(pdf.includes(Buffer.from("/FontFile2")), "TTF must be embedded");
    assert.equal(afmAttempts, 0, "Must never request default PDFKit fonts");
    assert.ok(bundledFontReads > 0, "Must use the deployed Geist font");
    console.log(JSON.stringify({
      ok: true,
      artifact: "production-bundle",
      bytes: pdf.length,
      afmAttempts,
      bundledFontReads,
      databaseAccess: false,
    }));
  } finally {
    fs.existsSync = originalExists;
    fs.readFileSync = originalRead;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
