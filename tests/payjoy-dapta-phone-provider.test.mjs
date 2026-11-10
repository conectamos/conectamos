import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/payjoy-dapta-phone-provider.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let read = async () => { throw new Error("Unexpected read; live network is forbidden in tests"); };
const module = { exports: {} };
new Function("require", "module", "exports", code)((name) => {
  if (name === "server-only") return {};
  assert.equal(name, "@/lib/payjoy");
  return { readPayJoyCreditPaymentPayload: (...args) => read(...args) };
}, module, module.exports);
const { parsePayJoyDaptaPhone: parse, readPayJoyDaptaPhone: lookup } = module.exports;
const tag = "DTEST123";
// Synthetic offline fixtures only, shaped after the observed provider contract.
const payload = () => ({ valid: true, formattedPhone: "300 1112233", deviceDetails: {
  deviceTag: tag, country: "CO", phoneNumber: "573001112233", name: "DO_NOT_RETURN",
  email: "private@example.test", merchantPhone: "573009998877",
}, supportPhone: "573008887766", token: "DO_NOT_RETURN" });
const rejectsCode = (fn, code) => assert.throws(fn, error => error.code === code);

test("extracts only the matching device phone and normalizes Colombian formats", () => {
  for (const value of ["573001112233", "+573001112233", "300 1112233", "+57 (300) 111-2233"]) {
    const data = payload(); data.deviceDetails.phoneNumber = value;
    assert.deepEqual(parse(" dtest123 ", data), { phone: "+573001112233", source: "PAYJOY_NEQUI_PREFILL" });
  }
  assert.doesNotMatch(JSON.stringify(parse(tag, payload())), /DO_NOT_RETURN|private@|9998877|8887766/);
});

test("rejects mismatched tags, unconfirmed countries and invalid responses", () => {
  const data = payload(); data.deviceDetails.deviceTag = "DOTHER99";
  rejectsCode(() => parse(tag, data), "DEVICE_MISMATCH");
  for (const country of ["MX", "", null, undefined]) {
    const data = payload(); data.deviceDetails.country = country;
    rejectsCode(() => parse(tag, data), "UNSUPPORTED_COUNTRY");
  }
  rejectsCode(() => parse(tag, { ...payload(), valid: false }), "NOT_FOUND");
  rejectsCode(() => parse(tag, { ...payload(), valid: "true" }), "NOT_FOUND");
  rejectsCode(() => parse(tag, []), "INVALID_RESPONSE");
  rejectsCode(() => parse("https://example.test/", payload()), "INVALID_INPUT");
});

test("missing structured number never uses merchant, support or display numbers", () => {
  const data = payload(); delete data.deviceDetails.phoneNumber;
  assert.deepEqual(parse(tag, data), { phone: null, source: null });
  data.deviceDetails.phoneNumber = null;
  assert.deepEqual(parse(tag, data), { phone: null, source: null });
});

test("refuses contradictory numbers, landlines, truncation and extension suffixes", () => {
  const data = payload(); data.formattedPhone = "300 9998877";
  rejectsCode(() => parse(tag, data), "PHONE_CONFLICT");
  for (const value of ["57300111223399", "6011112233", "3001112233 ext 5", "001573001112233", "+3001112233", 573001112233, "3001112233<script>"]) {
    const data = payload(); data.deviceDetails.phoneNumber = value;
    rejectsCode(() => parse(tag, data), "INVALID_RESPONSE");
  }
});

test("uses the existing read-only server adapter once and sanitizes its errors", async () => {
  const calls = [];
  read = async (...args) => { calls.push(args); return payload(); };
  assert.equal((await lookup(" dtest123 ")).phone, "+573001112233");
  assert.deepEqual(calls, [[tag]]);
  read = async () => { throw Object.assign(new Error("private payload and token"), { code: "TIMEOUT" }); };
  await assert.rejects(lookup(tag), error => error.code === "TIMEOUT" && !/private|token/.test(error.message));
  read = async () => { throw Object.assign(new Error("sensitive"), { code: "UNKNOWN_SECRET" }); };
  await assert.rejects(lookup(tag), error => error.code === "UNAVAILABLE" && !error.message.includes("sensitive"));
});
