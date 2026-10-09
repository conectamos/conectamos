import assert from "node:assert/strict";
import test from "node:test";
import {
  extraerImeisMasivos,
  normalizarSeparadoresImeisMasivos,
  revisarEntradasImeis,
} from "../lib/inventory-imeis.ts";

const CSV_USUARIO =
  "869580085463900,869580085463942,869580085467380,869580085478601,869580085479021,869580085479286,869580085479344,869580085479369,869580085479583,869580085488287,869580085488725,869580085488782,869580085503101,869580085505304,869580085518885,869580085521889,869580085522085,869580085522168,869580085537745,869580085537828,869580085538065,869580085538347,869580085538362,869580085538420,869580085542521,869580085542604,869580085542620";

test("organiza la lista CSV del usuario con un IMEI por linea", () => {
  const expected = CSV_USUARIO.split(",");
  const formatted = normalizarSeparadoresImeisMasivos(CSV_USUARIO);

  assert.equal(formatted, expected.join("\n"));
  assert.deepEqual(extraerImeisMasivos(formatted), expected);
  assert.equal(expected.length, 27);
  assert.equal(expected.every((imei) => /^\d{15}$/.test(imei)), true);
});

test("acepta delimitadores habituales y elimina separadores vacios", () => {
  const input = "001234567890123; 101234567890123\t201234567890123|\r\n301234567890123,";

  assert.deepEqual(extraerImeisMasivos(input), [
    "001234567890123",
    "101234567890123",
    "201234567890123",
    "301234567890123",
  ]);
});

test("la normalizacion es idempotente y conserva un salto final", () => {
  const formatted = normalizarSeparadoresImeisMasivos(
    "869580085463900, 869580085463942\n"
  );

  assert.equal(formatted, "869580085463900\n869580085463942\n");
  assert.equal(normalizarSeparadoresImeisMasivos(formatted), formatted);
});

test("no repara identificadores incorrectos ni pierde ceros iniciales", () => {
  const entries = extraerImeisMasivos("001234567890123,35A123456789012;3.55123456789012e14");
  assert.deepEqual(entries, ["001234567890123", "35A123456789012", "3.55123456789012e14"]);
  const reviewed = revisarEntradasImeis(entries);
  assert.deepEqual(reviewed.imeisValidos, ["001234567890123"]);
  assert.equal(reviewed.incorrectos, 2);
});

test("separa entradas incorrectas, repetidas y existentes sin sumar las excluidas", () => {
  const reviewed = revisarEntradasImeis([
    "001234567890123", "001234567890123", "101234567890123", 201234567890123, "corto",
  ], new Set(["101234567890123"]));
  assert.equal(reviewed.detectados, 5);
  assert.equal(reviewed.validos, 1);
  assert.equal(reviewed.repetidos, 1);
  assert.equal(reviewed.existentes, 1);
  assert.equal(reviewed.incorrectos, 2);
  assert.deepEqual(reviewed.entradas.map(entry => entry.estado), ["VALIDO", "REPETIDO", "EXISTENTE", "INCORRECTO", "INCORRECTO"]);
});
