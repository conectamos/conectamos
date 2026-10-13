import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
function load(filename, imports = {}) {
  const source = readFileSync(`${ROOT}${filename}`, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "console", output)(
    name => {
      assert.ok(name in imports, `Unexpected dependency: ${name}`);
      return imports[name];
    },
    loaded,
    loaded.exports,
    { error() {} },
  );
  return loaded.exports;
}

class NextResponse extends Response {
  static json(body, options = {}) {
    return new NextResponse(JSON.stringify(body), {
      ...options,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const access = load("lib/access-control.ts");
const proveedores = load("lib/proveedores.ts", {
  "@/lib/credit-date-utils": load("lib/credit-date-utils.ts"),
  "./proveedores-pagos": load("lib/proveedores-pagos.ts"),
});
const ADMIN = {
  id: 1,
  rolNombre: "ADMIN",
  perfilTipo: "ADMINISTRADOR",
  sedeId: 1,
};
const payment = {
  id: 7,
  facturaId: 6,
  valor: "7647690.01",
  saldoAnterior: "28779000.50",
  saldoPosterior: "21131310.49",
  aliadoSnapshot: "Proveedor histórico QA",
  numeroFacturaSnapshot: "0000-ONL318",
  valorFacturaSnapshot: "28779000.50",
  referencia: "00059700007297",
  observacion: "Abono parcial de prueba. No corresponde a una operación real.",
  aprobadoPorNombre: "Operador histórico QA",
  aprobadoEn: new Date("2026-10-13T15:32:00.000Z"),
  factura: {
    fechaVencimiento: new Date("2026-10-09T00:00:00.000Z"),
    aliado: "Nombre actual que no debe reemplazar el histórico",
    numeroFactura: "FACTURA-MODIFICADA",
    valorPagar: "99999999.00",
    estado: "PENDIENTE",
    saldoPendiente: "21131310.49",
    abonos: [],
  },
};

// The real GET, access policy and receipt number helper execute without a DB.
// The generator is a boundary spy: data mapping must remain historical and GET
// must not invoke any persistence method or a current-balance recalculation.
function receiptProbe({ session = ADMIN, payments = [structuredClone(payment)], failPdf = false } = {}) {
  const reads = [];
  const generated = [];
  const mutations = [];
  const unsupported = new Proxy({}, {
    get(_target, method) {
      return () => {
        mutations.push(String(method));
        throw new Error(`Receipt attempted persistence: ${String(method)}`);
      };
    },
  });
  const database = new Proxy({
    abonoFacturaProveedor: new Proxy({
      async findFirst(args) {
        reads.push(structuredClone(args));
        return structuredClone(payments.find(row => row.id === args.where.id && row.facturaId === args.where.facturaId) || null);
      },
    }, {
      get(target, method) {
        return method in target ? target[method] : unsupported[method];
      },
    }),
  }, {
    get(target, method) {
      return method in target ? target[method] : unsupported;
    },
  });
  const route = load("app/api/proveedores/[id]/abonos/[abonoId]/recibo/route.ts", {
    "next/server": { NextResponse },
    "@/lib/auth": { getSessionUser: async () => session },
    "@/lib/access-control": access,
    "@/lib/prisma": { __esModule: true, default: database },
    "@/lib/proveedores": proveedores,
    "@/lib/proveedores-recibo": {
      async generarReciboAbonoProveedorPdf(data) {
        generated.push(structuredClone(data));
        if (failPdf) throw new Error("Invalid historical snapshot");
        return Buffer.from("%PDF-1.7\nQA ONLY\n%%EOF");
      },
    },
  });
  return {
    payments, reads, generated, mutations,
    get: (id = "6", abonoId = "7") => route.GET(
      new Request(`https://qa.local/api/proveedores/${id}/abonos/${abonoId}/recibo`),
      { params: Promise.resolve({ id, abonoId }) },
    ),
  };
}

test("GET retains partial payment snapshots after later payments settle the invoice", async () => {
  const probe = receiptProbe();
  const first = await probe.get();
  assert.equal(first.status, 200);
  const firstData = probe.generated[0];
  assert.equal(firstData.valorFactura, "28779000.50");
  assert.equal(firstData.saldoAnterior, "28779000.50");
  assert.equal(firstData.valor, "7647690.01");
  assert.equal(firstData.saldoPosterior, "21131310.49");
  Object.assign(probe.payments[0].factura, {
    estado: "PAGADO",
    saldoPendiente: "0.00",
    abonos: [{ id: 8, valor: "10000000.00" }, { id: 9, valor: "11131310.49" }],
  });
  const downloadedAgain = await probe.get();
  assert.equal(downloadedAgain.status, 200);
  assert.deepEqual(probe.generated[1], firstData);
  assert.deepEqual(probe.mutations, []);
  assert.deepEqual(Object.keys(probe.reads[1].select.factura.select), ["fechaVencimiento"]);
});

test("GET maps final payment saldo cero without substituting the original invoice value", async () => {
  const final = {
    ...structuredClone(payment),
    id: 9,
    valor: "11131310.49",
    saldoAnterior: "11131310.49",
    saldoPosterior: "0.00",
  };
  const probe = receiptProbe({ payments: [structuredClone(payment), final] });
  const response = await probe.get("6", "9");
  assert.equal(response.status, 200);
  assert.equal(probe.generated[0].saldoPosterior, "0.00");
  assert.equal(probe.generated[0].saldoAnterior, "11131310.49");
  assert.equal(probe.generated[0].valorFactura, "28779000.50");
  assert.deepEqual(probe.mutations, []);
});

test("GET preserves text IDs, full observations, historical operator and dates", async () => {
  const text = "Observación de prueba con información adicional. ".repeat(80);
  const probe = receiptProbe({ payments: [{ ...structuredClone(payment), observacion: text }] });
  const response = await probe.get();
  const data = probe.generated[0];
  assert.equal(data.numeroFactura, "0000-ONL318");
  assert.equal(data.referencia, "00059700007297");
  assert.equal(data.aliado, payment.aliadoSnapshot);
  assert.equal(data.observacion, text);
  assert.equal(data.aprobadoPorNombre, payment.aprobadoPorNombre);
  assert.equal(data.aprobadoEn.toISOString(), "2026-10-13T15:32:00.000Z");
  assert.equal(data.fechaVencimiento.toISOString(), "2026-10-09T00:00:00.000Z");
  assert.equal(response.headers.get("Content-Disposition"), 'inline; filename="recibo-proveedor-PROV-00000007.pdf"');
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(Number(response.headers.get("Content-Length")), (await response.arrayBuffer()).byteLength);
});

test("GET requires authentication before accessing payment data", async () => {
  const probe = receiptProbe({ session: null });
  const response = await probe.get();
  assert.equal(response.status, 401);
  assert.deepEqual(probe.reads, []);
  assert.deepEqual(probe.generated, []);
  assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
});

test("GET preserves existing admin, auditor and supervisor permissions", async () => {
  for (const session of [
    ADMIN,
    { rolNombre: "AUDITOR", perfilTipo: "AUDITOR", sedeId: 2 },
    { rolNombre: "SEDE", perfilTipo: "SUPERVISOR_TIENDA", sedeId: 3 },
    { rolNombre: "SUPERVISOR", perfilTipo: null, sedeId: 4 },
  ]) {
    const probe = receiptProbe({ session });
    assert.equal((await probe.get()).status, 200);
    assert.deepEqual(probe.mutations, []);
  }
});

test("GET denies seller and unauthorized roles without exposing any data", async () => {
  for (const session of [
    { rolNombre: "SEDE", perfilTipo: "VENDEDOR" },
    { rolNombre: "SEDE", perfilTipo: "FACTURADOR" },
    { rolNombre: "SEDE", perfilTipo: "APOYO_OPERATIVO" },
    { rolNombre: "DESCONOCIDO", perfilTipo: null },
  ]) {
    const probe = receiptProbe({ session });
    const response = await probe.get();
    assert.equal(response.status, 403);
    assert.deepEqual(probe.reads, []);
    assert.deepEqual(probe.generated, []);
  }
});

test("GET prevents requesting a payment under another invoice", async () => {
  const probe = receiptProbe();
  const response = await probe.get("99", "7");
  assert.equal(response.status, 404);
  assert.deepEqual(probe.reads[0].where, { id: 7, facturaId: 99 });
  assert.deepEqual(probe.generated, []);
  assert.deepEqual(probe.mutations, []);
});

test("GET rejects invalid invoice and payment IDs before querying", async () => {
  for (const [id, abonoId] of [["0", "7"], ["6", "0"], ["-1", "7"], ["6.5", "7"], ["6", "foo"]]) {
    const probe = receiptProbe();
    assert.equal((await probe.get(id, abonoId)).status, 400);
    assert.deepEqual(probe.reads, []);
  }
});

test("GET reports PDF failure without fallback to current balance or persistence", async () => {
  const probe = receiptProbe({ failPdf: true });
  const response = await probe.get();
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.equal(probe.reads.length, 1);
  assert.deepEqual(probe.mutations, []);
  assert.deepEqual(await response.json(), { error: "Error generando el recibo del abono" });
});
