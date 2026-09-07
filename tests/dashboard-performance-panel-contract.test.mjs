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

function performancePanelSource() {
  const start = operations.indexOf("function PerformancePanel(");
  const end = operations.indexOf("function LeadingFinancialPanel(", start);

  assert.ok(start >= 0, "Debe existir PerformancePanel");
  assert.ok(end > start, "PerformancePanel debe conservar un limite identificable");

  return operations.slice(start, end);
}

test("el numero de ventas conserva jerarquia explicita y siempre visible", () => {
  const panel = performancePanelSource();
  const marker = panel.indexOf("data-performance-sales-count");

  assert.ok(marker > 0, "El conteo principal debe marcarse como ventas del rendimiento");

  const tagStart = panel.lastIndexOf("<", marker);
  const tagEnd = panel.indexOf(">", marker);
  const closeStart = panel.indexOf("</", tagEnd);
  const salesMarkup = panel.slice(tagStart, closeStart);

  assert.match(salesMarkup, /item\.ventas/);
  assert.match(salesMarkup, /text-(?:base|lg|xl|2xl)/);
  assert.match(salesMarkup, /font-(?:extrabold|black)/);
  assert.doesNotMatch(
    salesMarkup,
    /mostrarSoloVentas/,
    "La cifra de ventas no debe depender del modo monetario"
  );
});

test("la utilidad permanece oculta cuando mostrarSoloVentas esta activo", () => {
  const panel = performancePanelSource();
  const utilityGuard = panel.indexOf("{!mostrarSoloVentas && (");
  const salesMetric = panel.indexOf("data-performance-sales-count", utilityGuard);
  const utilityMatches = [
    ...panel.matchAll(/formatoPesos\(item\.utilidad\)/g),
  ];

  assert.ok(utilityGuard > 0, "La utilidad debe conservar una guarda explicita");
  assert.ok(salesMetric > utilityGuard, "La guarda debe cerrar antes de la metrica de ventas");
  assert.ok(utilityMatches.length > 0, "Debe mostrarse la utilidad real de la sede");
  assert.ok(
    utilityMatches.every(
      (match) => match.index > utilityGuard && match.index < salesMetric
    ),
    "La utilidad solo debe renderizarse dentro de !mostrarSoloVentas"
  );
  assert.doesNotMatch(panel, /formatoPesos\(item\.ingresos\)/);
});

test("la utilidad inicia enmascarada y se revela por mouse o teclado", () => {
  const panel = performancePanelSource();

  assert.match(panel, /Utilidad:/);
  assert.match(panel, /\*\*\*\*/);
  assert.match(panel, /group-hover\/utility:hidden/);
  assert.match(panel, /group-hover\/utility:inline/);
  assert.match(panel, /group-focus-within\/utility:hidden/);
  assert.match(panel, /group-focus-within\/utility:inline/);
});

test("el modo supervisor sigue ocultando montos sin afectar al administrador", () => {
  assert.match(
    operations,
    /const modoSupervisorSinMontos = esSupervisor && !esAdmin;/
  );
  assert.match(
    operations,
    /<PerformancePanel[\s\S]*?mostrarSoloVentas=\{modoSupervisorSinMontos\}[\s\S]*?\/>/
  );
});
