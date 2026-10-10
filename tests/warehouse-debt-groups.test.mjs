import assert from "node:assert/strict";
import test from "node:test";
import { agruparDeudasPorSede, claveSedeDeudora } from "../lib/warehouse-debt-groups.ts";

const deuda = (sedeDestinoId, costo, extra = {}) => ({
  sedeDestinoId, costo, estadoCobro: "PENDIENTE", ...extra,
});

test("agrupa por ID sin fusionar sedes con el mismo nombre", () => {
  const grupos = agruparDeudasPorSede([
    deuda(2, 350000), deuda(3, 900000), deuda(2, 125000),
  ], [{ id: 2, nombre: "Stand Jesús" }, { id: 3, nombre: "Stand Jesús" }]);

  assert.deepEqual(grupos, [
    { key: "sede:3", sedeId: 3, nombre: "Stand Jesús", equipos: 1, totalPendiente: 900000 },
    { key: "sede:2", sedeId: 2, nombre: "Stand Jesús", equipos: 2, totalPendiente: 475000 },
  ]);
});

test("la deuda y su detalle siguen la sede actual después de un traslado", () => {
  const item = deuda(7, 725000, { sedeDestinoNombre: "SEDE 7", sedeOrigenId: 2 });
  const antes = agruparDeudasPorSede([item], []);
  const trasladado = { ...item, sedeDestinoId: 8, sedeDestinoNombre: "SEDE 8" };
  const despues = agruparDeudasPorSede([trasladado], []);

  assert.equal(antes[0].key, "sede:7");
  assert.equal(despues[0].key, "sede:8");
  assert.equal(despues[0].nombre, "SEDE 8");
  assert.equal(despues[0].totalPendiente, antes[0].totalPendiente);
  assert.equal(claveSedeDeudora(trasladado), despues[0].key);
});

test("prefiere el nombre actual de la API, luego catálogo e ID, sin inventar deudor", () => {
  const grupos = agruparDeudasPorSede([
    deuda(2, 1), deuda(2, 1, { sedeDestinoNombre: "  SEDE ACTUAL  " }),
    deuda(3, 1, { sedeDestinoNombre: "  " }), deuda(99, 1),
    deuda(null, 1, { sedeDestinoNombre: "Nombre sin ID" }), deuda(undefined, 1),
  ], [{ id: 2, nombre: "Nombre anterior" }, { id: 3, nombre: "  ONLINE  " }]);
  const porClave = Object.fromEntries(grupos.map((grupo) => [grupo.key, grupo]));

  assert.equal(porClave["sede:2"].nombre, "SEDE ACTUAL");
  assert.equal(porClave["sede:3"].nombre, "ONLINE");
  assert.equal(porClave["sede:99"].nombre, "Sede #99");
  assert.equal(porClave["sin-sede"].nombre, "Deudor no identificado");
  assert.equal(porClave["sin-sede"].equipos, 2);
  assert.equal(claveSedeDeudora({}), "sin-sede");
  assert.equal(claveSedeDeudora({ sedeDestinoId: 0 }), "sin-sede");
});

test("incluye únicamente cobros pendientes y respeta los filtros previos de la consulta", () => {
  const items = [
    deuda(2, 100, { estadoCobro: "pendiente" }),
    deuda(2, 25, { estadoCobro: " Pendiente " }),
    deuda(2, 1000, { estadoCobro: "PAGADO" }),
    deuda(2, 2000, { estadoCobro: null }),
    deuda(3, 350),
  ];
  const filtrados = items.filter((item) => item.sedeDestinoId === 2);
  assert.deepEqual(agruparDeudasPorSede(filtrados, [{ id: 2, nombre: "SEDE 2" }]), [
    { key: "sede:2", sedeId: 2, nombre: "SEDE 2", equipos: 2, totalPendiente: 125 },
  ]);
  assert.deepEqual(agruparDeudasPorSede([], []), []);
});

test("suma importes completos y centavos sin acumular deriva binaria", () => {
  const items = [deuda(2, 0.1), deuda(2, 0.2), deuda(2, 1234567.89), deuda(2, "2500000.01")];
  const grupos = agruparDeudasPorSede(items, []);
  assert.equal(grupos[0].totalPendiente, 3734568.2);
  assert.equal(grupos[0].equipos, 4);
  assert.equal(agruparDeudasPorSede([deuda(2, 0.1), deuda(2, 0.2)], [])[0].totalPendiente, 0.3);
  assert.equal(agruparDeudasPorSede([deuda(2, 1.005)], [])[0].totalPendiente, 1.01);
});

test("ordena por deuda, nombre y clave estable sin mutar los datos", () => {
  const items = Object.freeze([
    Object.freeze(deuda(10, 100)), Object.freeze(deuda(2, 100)),
    Object.freeze(deuda(4, 200)), Object.freeze(deuda(3, 100)),
  ]);
  const sedes = Object.freeze([
    { id: 10, nombre: "Alfa" }, { id: 2, nombre: "Alfa" },
    { id: 3, nombre: "Beta" }, { id: 4, nombre: "Mayor" },
  ]);
  const grupos = agruparDeudasPorSede(items, sedes);
  assert.deepEqual(grupos.map((grupo) => grupo.key), ["sede:4", "sede:2", "sede:10", "sede:3"]);
  assert.equal(grupos.reduce((sum, grupo) => sum + grupo.equipos, 0), items.length);
  assert.equal(grupos.reduce((sum, grupo) => sum + grupo.totalPendiente, 0), 500);
  assert.equal(items[0].sedeDestinoId, 10);
});
