/* eslint-disable @typescript-eslint/no-require-imports -- This regression loads the real CommonJS PDFKit runtime. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const PDFDocument = require("pdfkit");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const FONT_PATHS = ["LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf"]
  .map((name) => path.join(ROOT, "public", "pdf-fonts", name));

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
  const originalFragment = PDFDocument.prototype._fragment;
  const pages = new Map();
  const observed = { afmReads: 0, bundledFontReads: new Set(), texts: [], fragments: [], pages };

  t.mock.method(fs, "existsSync", (filename) => {
    const value = String(filename);
    if (value.toLowerCase().endsWith(".ttf") && !FONT_PATHS.includes(value)) return false;
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
    if (FONT_PATHS.includes(value)) observed.bundledFontReads.add(value);
    return originalReadFileSync(filename, ...args);
  });
  t.mock.method(PDFDocument.prototype, "text", function (value, ...args) {
    observed.texts.push(String(value).replace(/\s+/g, " "));
    return originalText.call(this, value, ...args);
  });
  // Observe lines actually emitted, including wrapped text on continuation pages.
  // This catches PDF clipping and overlapping values, which text-only assertions miss.
  t.mock.method(PDFDocument.prototype, "_fragment", function (value, x, y, options) {
    const text = String(value).replace(/\n/g, "");
    if (text.trim()) {
      if (!pages.has(this.page)) pages.set(this.page, pages.size + 1);
      const width = this.widthOfString(text, options);
      let left = x;
      if (options.width && options.align === "right") left += options.lineWidth - width;
      if (options.width && options.align === "center") left += options.lineWidth / 2 - options.textWidth / 2;
      observed.fragments.push({
        text, x: left, y, width, height: this.currentLineHeight(),
        page: pages.get(this.page), pageWidth: this.page.width, pageHeight: this.page.height,
        availableWidth: options.lineWidth || options.width,
      });
    }
    return originalFragment.call(this, value, x, y, options);
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

function assertEmbeddedPdf(buffer, observed, receiptNumber = "PROV-00000001") {
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
  const content = buffer.toString("latin1");
  assert.match(content, /\/Type \/Page\b/);
  assert.match(content, /\/FontFile2 \d+ 0 R/);
  assert.match(content, /%%EOF\s*$/);
  assert.ok(buffer.length > 5000);
  assert.equal(observed.afmReads, 0, "The receipt must never load Helvetica AFM");
  assert.equal(observed.bundledFontReads.size, 2, "The regular and bold bundled TTFs must be loaded");
  assert.ok(observed.texts.includes(receiptNumber));
  assert.ok(observed.texts.includes("FACTURA-001"));
}

function pageCount(buffer) {
  return [...buffer.toString("latin1").matchAll(/\/Type \/Page\b/g)].length;
}

function assertPrintBounds(observed) {
  for (const line of observed.fragments) {
    assert.ok(line.x >= 28 - 0.1, `Text reaches the left print margin: ${line.text}`);
    assert.ok(line.x + line.width <= line.pageWidth - 28 + 0.1,
      `Text reaches the right print margin: ${line.text}`);
    assert.ok(line.y >= 20 && line.y + line.height <= line.pageHeight - 20,
      `Text reaches the vertical print margin on page ${line.page}: ${line.text}`);
  }
}

function amountLines(observed) {
  return observed.fragments.filter((line) => /^\$\s?\d[\d.,]*$/.test(line.text.trim()));
}

test("el entorno reproduce Helvetica.afm ausente en producción", (t) => {
  const observed = simulateProductionFonts(t);
  assert.throws(() => new PDFDocument(), { code: "ENOENT" });
  assert.equal(observed.afmReads, 1);
});

test("el recibo parcial incrusta ambas fuentes sin depender del sistema ni de AFM", async (t) => {
  const observed = simulateProductionFonts(t);
  const generate = loadReceiptGenerator();
  const buffer = await generate(PAYMENT);

  assertEmbeddedPdf(buffer, observed);
  assert.ok(observed.texts.includes("Abono aplicado"));
  assert.ok(!observed.texts.some((value) => /Factura pagada|liquidada|paz y salvo/i.test(value)));
  assert.ok(observed.texts.includes("$300,25"));
  assert.ok(observed.texts.includes("$700,25"));
  assert.ok(observed.texts.includes("Datos del proveedor"));
  assert.ok(observed.texts.includes("Detalle del abono"));
  assert.ok(observed.texts.includes("Saldo antes del abono"));
  assert.ok(observed.texts.includes("Saldo pendiente"));
  assert.equal(pageCount(buffer), 1, "A normal receipt must fit on one A4 page");
  assertPrintBounds(observed);

  if (process.env.PROVEEDORES_RECIBO_QA === "1") {
    const directory = path.join(ROOT, "tmp", "pdfs");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "recibo-regresion.pdf"), buffer);
  }
});

test("el recibo del pago final conserva saldo cero y muestra factura pagada", async (t) => {
  const observed = simulateProductionFonts(t);
  const generate = loadReceiptGenerator();
  const buffer = await generate({
    ...PAYMENT,
    saldoAnterior: "700.25",
    saldoPosterior: "0.00",
    valor: "700.25",
  });

  assertEmbeddedPdf(buffer, observed);
  assert.ok(observed.texts.includes("Factura pagada"));
  assert.ok(observed.texts.includes("Abono aplicado"));
  assert.ok(observed.texts.includes("$700,25"));
  assert.ok(observed.texts.includes("$0,00"));
  assert.equal(pageCount(buffer), 1);
  assertPrintBounds(observed);
});

test("consecutivo, factura y referencia conservan ceros iniciales como texto", async (t) => {
  const observed = simulateProductionFonts(t);
  const generate = loadReceiptGenerator();
  await generate({ ...PAYMENT, id: 7, numeroFactura: "00000456", referencia: "0000007297" });
  assert.ok(observed.texts.includes("PROV-00000007"));
  assert.ok(observed.texts.includes("00000456"));
  assert.ok(observed.texts.includes("0000007297"));
});

test("la fecha y hora del registro usan America/Bogota sin cambiar el vencimiento", async (t) => {
  const observed = simulateProductionFonts(t);
  const generate = loadReceiptGenerator();
  await generate({ ...PAYMENT, aprobadoEn: new Date("2026-10-13T03:32:00.000Z"), fechaVencimiento: "2026-10-09" });
  const text = observed.texts.join(" ").replaceAll("\u00a0", " ");
  assert.match(text, /12 de octubre de 2026/);
  assert.match(text, /10:32\s*p\.?\s*m\.?/i);
  assert.match(text, /9 de octubre de 2026/);
});

test("varios abonos y descargas posteriores preservan cada saldo histórico", async (t) => {
  const observed = simulateProductionFonts(t);
  const generate = loadReceiptGenerator();
  const first = Object.freeze({ ...PAYMENT });
  await generate(first);
  const initialTexts = [...observed.texts];
  observed.texts.length = 0;
  await generate({ ...PAYMENT, id: 2, saldoAnterior: "700.25", saldoPosterior: "0.00", valor: "700.25" });
  assert.ok(observed.texts.includes("$700,25"));
  assert.ok(observed.texts.includes("$0,00"));
  observed.texts.length = 0;
  await generate(first);
  assert.deepEqual(observed.texts, initialTexts, "A later payment cannot change earlier receipt content");
  assert.ok(observed.texts.includes("$1.000,50"));
  assert.ok(observed.texts.includes("$700,25"));
  assert.ok(!observed.texts.includes("Factura pagada"));
});

test("saldos históricos ausentes o inconsistentes fallan en lugar de inventar un saldo actual", async (t) => {
  simulateProductionFonts(t);
  const generate = loadReceiptGenerator();
  for (const overrides of [
    { saldoAnterior: "importe inválido" }, { saldoPosterior: "600.25" },
    { saldoAnterior: "1200.50" }, { valor: "0.00" }, { saldoPosterior: "-1.00" },
  ]) {
    await assert.rejects(generate({ ...PAYMENT, ...overrides }), /históric|consistentes/i);
  }
});

for (const estado of ["ANULADO", "PENDIENTE"]) {
  test(`el estado ${estado} no presenta un abono como vigente ni una factura como pagada`, async (t) => {
    const observed = simulateProductionFonts(t);
    const generate = loadReceiptGenerator();
    await generate({ ...PAYMENT, estado, saldoPosterior: "0.00", valor: "1000.50" });
    const text = observed.texts.join(" ");
    assert.match(text, estado === "ANULADO" ? /Abono anulado/i : /Abono no aplicado/i);
    assert.ok(!observed.texts.includes("Abono aplicado"));
    assert.doesNotMatch(text, /Factura pagada|liquidada|paz y salvo/i);
  });
}

test("importes máximos permitidos permanecen completos en una línea sin superponerse", async (t) => {
  const observed = simulateProductionFonts(t);
  const generate = loadReceiptGenerator();
  const buffer = await generate({
    ...PAYMENT, valorFactura: "999999999999.99", saldoAnterior: "999999999999.99",
    valor: "499999999999.99", saldoPosterior: "500000000000.00",
  });
  assert.equal(pageCount(buffer), 1);
  assert.ok(observed.texts.includes("$999.999.999.999,99"));
  assert.ok(observed.texts.includes("$499.999.999.999,99"));
  assert.ok(observed.texts.includes("$500.000.000.000,00"));
  const amounts = amountLines(observed);
  assert.equal(amounts.length, 5, "The headline and all four table amounts must remain single lines");
  for (const amount of amounts) {
    // Values are emitted as single fitted lines with explicit coordinates;
    // PDFKit's internal wrapping width is intentionally not used for them.
    // Require the right-hand numeric column plus printable page bounds, then
    // reject an intersection with any other rendered text on that page.
    assert.ok(amount.x >= amount.pageWidth / 2 - 5, `Amount leaves the right-hand numeric column: ${amount.text}`);
    assert.ok(amount.x + amount.width <= amount.pageWidth - 45,
      `Amount exceeds the numeric cell's right padding: ${amount.text}`);
    for (const other of observed.fragments) {
      if (other === amount || other.page !== amount.page) continue;
      const verticalOverlap = amount.y < other.y + other.height - 0.2 && other.y < amount.y + amount.height - 0.2;
      const horizontalOverlap = amount.x < other.x + other.width - 0.2 && other.x < amount.x + amount.width - 0.2;
      assert.ok(!(verticalOverlap && horizontalOverlap), `Amount overlaps ${other.text}: ${amount.text}`);
    }
  }
  assertPrintBounds(observed);
});

test("contenido largo fluye a páginas adicionales con todos los datos y márgenes imprimibles", async (t) => {
  const observed = simulateProductionFonts(t);
  const generate = loadReceiptGenerator();
  const observation = Array.from({ length: 90 }, (_, index) =>
    `Detalle ${index + 1}: entrega verificada y documentación del abono conservada para consulta del proveedor.`).join("\n") + " FIN OBSERVACIÓN";
  const buffer = await generate({
    ...PAYMENT,
    aliado: "COMERCIALIZADORA DE EQUIPOS Y ACCESORIOS DE PRUEBA CON NOMBRE EXTENSO S.A.S.",
    numeroFactura: "00000-FACTURA-CON-IDENTIFICADOR-EXTENSO-1234567890",
    aprobadoPorNombre: "Operador de prueba con nombre completo y segundo apellido extenso",
    referencia: "000000-REFERENCIA-EXTENSA-" + "1234567890".repeat(18),
    observacion: observation,
  });
  assert.ok(pageCount(buffer) >= 2, "Long content needs continuation pages");
  const lines = observed.fragments.map((line) => line.text).join(" ");
  assert.match(lines, /FIN OBSERVACIÓN/);
  assert.match(lines, /Detalle 90:/);
  assertPrintBounds(observed);
  assert.ok(observed.pages.size >= 2);
  const imageObjects = [...buffer.toString("latin1").matchAll(/\/Subtype \/Image\b/g)].length;
  assert.ok(imageObjects <= 4, "Only the official logo may be raster; receipt text remains selectable");
});
