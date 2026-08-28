import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esServicioContadoRegistro } from "../lib/vendor-sale-service.ts";

const API_SOURCE = readFileSync(
  new URL("../app/api/vendedor/registros/route.ts", import.meta.url),
  "utf8"
);
const WORKSPACE_SOURCE = readFileSync(
  new URL("../app/vendedor/registros/workspace.tsx", import.meta.url),
  "utf8"
);

test("reconoce todos los aliases de venta de contado", () => {
  for (const servicio of [
    "CONTADO",
    " contado ",
    "CONTADO CLARO",
    "contado libres",
  ]) {
    assert.equal(esServicioContadoRegistro(servicio), true, servicio);
  }

  for (const servicio of [
    "FINANCIERA",
    "FINANCIERO",
    "PAYJOY",
    "",
    undefined,
    "DESCONOCIDO",
  ]) {
    assert.equal(esServicioContadoRegistro(servicio), false, String(servicio));
  }
});

test("la API omite lista negra solo despues de normalizar una venta como contado", () => {
  const normalizerStart = API_SOURCE.indexOf(
    "function normalizarServicioRegistro"
  );
  const normalizerEnd = API_SOURCE.indexOf(
    "function monedaMayorQueCero",
    normalizerStart
  );
  const normalizerSource = API_SOURCE.slice(normalizerStart, normalizerEnd);
  const helperStart = API_SOURCE.indexOf(
    "async function validarDocumentoNoReportado"
  );
  const helperEnd = API_SOURCE.indexOf(
    "async function validarCreditoPayJoy",
    helperStart
  );
  const helperSource = API_SOURCE.slice(helperStart, helperEnd);

  assert.ok(normalizerStart >= 0 && normalizerEnd > normalizerStart);
  assert.match(
    normalizerSource,
    /esServicioContado\(valor\) \|\| esServicioContado\(plataformaCredito\)/
  );
  assert.match(normalizerSource, /return "CONTADO";/);

  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.match(
    helperSource,
    /if \(esServicioContado\(plataformaCredito\)\) \{\s*return null;\s*\}/
  );
  assert.ok(
    helperSource.indexOf("esServicioContado(plataformaCredito)") <
      helperSource.indexOf("buscarDocumentoListaNegra(documentoNumero)"),
    "La salida para contado debe ocurrir antes de consultar la lista negra"
  );

  const postStart = API_SOURCE.indexOf("export async function POST");
  const patchStart = API_SOURCE.indexOf("export async function PATCH");
  const postSource = API_SOURCE.slice(postStart, patchStart);
  const patchSource = API_SOURCE.slice(patchStart);
  const llamadaNormalizada =
    /validarDocumentoNoReportado\(\s*payload\.data\.documentoNumero,\s*payload\.data\.plataformaCredito\s*\)/g;

  assert.ok(postStart >= 0 && patchStart > postStart);
  assert.equal(postSource.match(llamadaNormalizada)?.length, 1);
  assert.equal(patchSource.match(llamadaNormalizada)?.length, 1);
});

test("la pantalla consulta y bloquea lista negra unicamente en financiadas", () => {
  const endpointIndex = WORKSPACE_SOURCE.indexOf(
    "/api/vendedor/lista-negra/verificar"
  );
  const effectStart = WORKSPACE_SOURCE.lastIndexOf(
    "useEffect(() => {",
    endpointIndex
  );
  const effectEnd = WORKSPACE_SOURCE.indexOf(
    "\n  useEffect(() => {",
    endpointIndex
  );
  const blacklistEffectSource = WORKSPACE_SOURCE.slice(effectStart, effectEnd);

  assert.ok(endpointIndex >= 0 && effectStart >= 0 && effectEnd > endpointIndex);
  assert.match(
    blacklistEffectSource,
    /if \(!esServicioFinanciera\(form\.servicio\) \|\| documento\.length < 5\)/
  );
  assert.match(
    blacklistEffectSource,
    /setListaNegraAlerta\(null\);/
  );
  assert.match(
    blacklistEffectSource,
    /fetch\(\s*`\/api\/vendedor\/lista-negra\/verificar\?documento=/
  );
  assert.match(
    blacklistEffectSource,
    /\}, \[form\.documentoNumero, form\.servicio\]\);/
  );
  assert.match(
    WORKSPACE_SOURCE,
    /const listaNegraBloqueante = esServicioFinanciera\(form\.servicio\)/
  );
  assert.equal(
    WORKSPACE_SOURCE.match(/if \(listaNegraBloqueante\)/g)?.length,
    2,
    "Las validaciones por paso y final deben usar la regla financiada"
  );
  assert.match(
    WORKSPACE_SOURCE,
    /\{listaNegraBloqueante && !listaNegraModalCerrado && \(/
  );
  assert.match(
    WORKSPACE_SOURCE,
    /No se puede guardar una venta financiada con este documento\./
  );
});
