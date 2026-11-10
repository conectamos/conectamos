// Read-only diagnostic. Never prints full phone numbers or raw provider data.
import { readFileSync } from "node:fs";
import ts from "typescript";

const tag = process.argv[2]?.trim().toUpperCase();
if (!tag || !/^D[A-Z0-9]{5,31}$/.test(tag)) {
  console.error("Uso: node scripts/verify-payjoy-dapta-phone.mjs CODIGO_PAYJOY");
  process.exit(1);
}
function load(relativePath, dependencies = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error("Dependencia no admitida en el diagnóstico.");
  }, mod, mod.exports);
  return mod.exports;
}
try {
  const payments = load("../lib/payjoy.ts");
  const provider = load("../lib/payjoy-dapta-phone-provider.ts", { "@/lib/payjoy": payments });
  const result = await provider.readPayJoyDaptaPhone(tag);
  console.log(JSON.stringify({
    deviceTag: tag, found: result.phone !== null,
    phoneMasked: result.phone ? `+57 *** *** ${result.phone.slice(-4)}` : null,
    source: result.source, sendingEnabled: false,
  }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: typeof error?.code === "string" ? error.code : "UNAVAILABLE" }));
  process.exitCode = 1;
}
