/* eslint-disable @typescript-eslint/no-require-imports -- This regression loads the real CommonJS PDFKit runtime. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const PDFDocument = require("pdfkit");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const FONT_PATH = path.join(ROOT, "public", "pdf-fonts", "Geist-Regular.ttf");

// Resolve the application's TypeScript and alias imports without Next or a DB.
// PDFKit, receipt formatting, and all supplier helpers remain real.
function loadReceiptGenerator() {
  const modules = new Map();

  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;

    const source = fs.readFileSync(filename, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: filename,
    }).outputText;
    const loaded = new Module(filename, module);
    modules.set(filename, loaded);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const nativeRequire = loaded.require.bind(loaded);

    loaded.require = (id) => {
      if (id === "server-only") return {};
      if (id.startsWith("@/") || id.startsWith(".")) {
        const resolved = id.startsWith("@/")
          ? path.join(ROOT, id.slice(2))
          : path.resolve(path.dirname(filename), id);
        const typescriptFile = resolved + ".ts";
        if (fs.existsSync(typescriptFile)) return load(typescriptFile);
      }
      return nativeRequire(id);
    };
    loaded._compile(compiled, filename);
    return loaded.exports;
  }

  return load(path.join(ROOT, "lib", "proveedores-recibo.ts"))
    .generarReciboAbonoProveedorPdf;
}

function simulateProductionFonts(t) {
  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;
  const originalText = PDFDocument.prototype.text;
  const observed = { afmReads: 0, bundledFontReads: 0, texts: [] };

  t.mock.method(fs, "existsSync", (filename) => {
    const value = String(filename);
    if (value.toLowerCase().endsWith(".ttf") && value !== FONT_PATH) return false;
    return originalExistsSync(filename);
  });
  t.mock.method(fs, "readFileSync", (filename, ...args) => {
    const value = String(filename);
    if (value.toLowerCase().endsWith(".afm")) {
      observed.afmReads += 1;
      throw Object.assign(new Error("ENOENT: font metrics unavailable: " + value), {
        code: "ENOENT",
      });
    }
    if (value === FONT_PATH) observed.bundledFontReads += 1;
    return originalReadFileSync(filename, ...args);
  });
  t.mock.method(PDFDocument.prototype, "text", function (value, ...args) {
    observed.texts.push(String(value).replace(/\s+/g, " "));
    return originalText.call(this, value, ...args);
  });
  return observed;
}

const PAYMENT = {
  aliado: "PROVEEDOR DE PRUEBA",
  aprobadoEn: new Date("2026-09-10T16:00:00.000Z"),
  aprobadoPorNombre: "Operador de prueba",
  facturaId: 3,
  fechaVencimiento: new Date("2026-09-15T00:00:00.000Z"),
  id: 1,
  numeroFactura: "FACTURA-001",
  observacion: "Comprobante generado sin acceso a la base de datos.",
  referencia: "TRANSFERENCIA-001",
  saldoAnterior: "1000.50",
  saldoPosterior: "700.25",
  valor: "300.25",
  valorFactura: "1000.50",
};

function assertEmbeddedPdf(buffer, observed) {
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
  const content = buffer.toString("latin1");
  assert.match(content, /\/Type \/Page\b/);
  assert.match(content, /\/FontFile2 \d+ 0 R/);
  assert.match(content, /%%EOF\s*$/);
  assert.ok(buffer.length > 5000);
  assert.equal(observed.afmReads, 0, "The receipt must never load Helvetica AFM");
  assert.ok(observed.bundledFontReads > 0, "The bundled TTF must be loaded");
  assert.ok(observed.texts.includes("PROV-00000001"));
  assert.ok(observed.texts.includes("FACTURA-001"));
}

test("el entorno reproduce Helvetica.afm ausente en producción", (t) => {
  const observed = simulateProductionFonts(t);
  assert.throws(() => new PDFDocument(), { code: "ENOENT" });
  assert.equal(observed.afmReads, 1);
});

test("el recibo de abono parcial incrusta Geist sin fuentes del sistema ni AFM", async (t) => {
  const observed = simulateProductionFonts(t);
  const generate = loadReceiptGenerator();
  const buffer = await generate(PAYMENT);

  assertEmbeddedPdf(buffer, observed);
  assert.ok(observed.texts.includes("ABONO APLICADO"));
  assert.ok(!observed.texts.includes("FACTURA LIQUIDADA"));
  assert.ok(observed.texts.includes("$ 300,25"));
  assert.ok(observed.texts.includes("$ 700,25"));

  if (process.env.PROVEEDORES_RECIBO_QA === "1") {
    const directory = path.join(ROOT, "tmp", "pdfs");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "recibo-regresion.pdf"), buffer);
  }
});

test("el recibo del pago final conserva saldo cero y factura liquidada", async (t) => {
  const observed = simulateProductionFonts(t);
  const generate = loadReceiptGenerator();
  const buffer = await generate({
    ...PAYMENT,
    saldoAnterior: "700.25",
    saldoPosterior: "0.00",
    valor: "700.25",
  });

  assertEmbeddedPdf(buffer, observed);
  assert.ok(observed.texts.includes("FACTURA LIQUIDADA"));
  assert.ok(!observed.texts.includes("ABONO APLICADO"));
  assert.ok(observed.texts.includes("$ 700,25"));
  assert.ok(observed.texts.includes("$ 0,00"));
});
