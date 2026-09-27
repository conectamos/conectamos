import assert from "node:assert/strict";
import test from "node:test";

import {
  esCorreoRegistroValido,
  normalizarCorreoRegistro,
  obtenerErrorCorreoRegistro,
} from "../lib/vendor-sale-email.ts";

test("rechaza la letra ñ en cualquier parte del correo", () => {
  for (const correo of [
    "peña@gmail.com",
    "PEÑA@GMAIL.COM",
    "pen\u0303a@gmail.com",
    "cliente@gmaíl.ñom",
  ]) {
    assert.equal(esCorreoRegistroValido(correo), false);
    assert.equal(normalizarCorreoRegistro(correo), null);
    assert.equal(
      obtenerErrorCorreoRegistro(correo),
      "El correo no puede contener la letra ñ"
    );
  }
});

test("conserva los correos validos de los dominios autorizados", () => {
  assert.equal(
    normalizarCorreoRegistro("  CLIENTE@GMAIL.COM  "),
    "cliente@gmail.com"
  );
  assert.equal(esCorreoRegistroValido("cliente@hotmail.com"), true);
  assert.equal(obtenerErrorCorreoRegistro("cliente@hotmail.com"), null);
});

test("mantiene el rechazo de dominios no autorizados", () => {
  assert.equal(normalizarCorreoRegistro("cliente@yahoo.com"), null);
  assert.match(
    obtenerErrorCorreoRegistro("cliente@yahoo.com") || "",
    /correo valido terminado en/
  );
});
