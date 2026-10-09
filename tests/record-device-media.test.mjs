import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const runtime = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");
function loadTypeScript(path, imports = {}) {
  const source = ts.transpileModule(readFileSync(join(root, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    if (name === "react/jsx-runtime") return runtime;
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, mod, mod.exports);
  return mod.exports;
}
const helpers = loadTypeScript("lib/record-device-media.ts");
const { getRecordDeviceFallback, getRecordCatalogImageSource, recordCatalogReferenceMatches, resolveRecordDeviceVisual } = helpers;

test("iPhone sin foto acepta espacios iniciales y mayúsculas o minúsculas", () => {
  for (const reference of ["IPHONE 15 128GB", "   iPhone 16 PRO", "\tiphone SE 64GB"]) {
    assert.equal(getRecordDeviceFallback({ reference }), "apple");
    assert.equal(resolveRecordDeviceVisual({ reference }).kind, "apple");
  }
});

test("Apple solo corresponde al prefijo IPHONE, sin falsos positivos por menciones", () => {
  for (const reference of ["ESTUCHE IPHONE 15", "CABLE PARA IPHONE", "APPLE WATCH", "OTRO IPHONE", ""]) {
    assert.equal(getRecordDeviceFallback({ reference }), "device");
  }
});

test("Android reconoce referencias de teléfonos, pero TELEFONÍA sola no identifica el sistema", () => {
  for (const reference of ["Samsung A17 128GB", "INFINIX SMART 20 128GB", "VIVO Y05", "TECNO CAMON 50 PRO", "MOTOROLA G85", "XIAOMI REDMI 15C", "Google Pixel 9"]) {
    assert.equal(getRecordDeviceFallback({ reference, productType: "TELEFONÍA" }), "android", reference);
  }
  assert.equal(getRecordDeviceFallback({ reference: "MODELO DESCONOCIDO", productType: "TELEFONÍA" }), "device");
  assert.equal(getRecordDeviceFallback({ reference: "MODELO NUEVO", operatingSystem: "Android 15" }), "android");
});

test("otros productos y sistemas no se convierten automáticamente en Android", () => {
  for (const input of [
    { reference: "SAMSUNG 55", productType: "TELEVISORES" },
    { reference: "SAMSUNG GALAXY WATCH" },
    { reference: "TECNO CARGADOR" },
    { reference: "SAMSUNG BUDS", productType: "ACCESORIOS" },
    { reference: "NOKIA 105", productType: "TELEFONÍA" },
    { reference: "HUAWEI P60", operatingSystem: "HarmonyOS" },
    { reference: "SAMSUNG TV 50", operatingSystem: "Android TV" },
  ]) assert.equal(getRecordDeviceFallback(input), "device", JSON.stringify(input));
});

test("foto auténtica del catálogo tiene prioridad para iPhone, Android y otros productos", () => {
  for (const reference of ["IPHONE 15", "VIVO Y05", "MODELO OTRO"]) {
    const result = resolveRecordDeviceVisual({ reference, catalogReference: `  ${reference.toLowerCase()}  `, imageSrc: "https://catalog.example.test/modelo-exacto.webp" });
    assert.equal(result.kind, "photo");
    assert.equal(result.imageSrc, "https://catalog.example.test/modelo-exacto.webp");
  }
});

test("no usa una foto ni sistema de catálogo de otra referencia", () => {
  assert.equal(recordCatalogReferenceMatches("VIVO  Y05", "  vivo y05 "), true);
  assert.equal(recordCatalogReferenceMatches("vívo Y05", "VIVO Y05"), true);
  assert.equal(recordCatalogReferenceMatches("IPHONE 15", "IPHONE 15 PRO"), false);
  assert.equal(recordCatalogReferenceMatches("", ""), false);
  assert.deepEqual(resolveRecordDeviceVisual({ reference: "MODELO OTRO", catalogReference: "VIVO Y05", imageSrc: "/catalog/vivo-y05.jpg", operatingSystem: "Android" }), { kind: "device", imageSrc: null, fallback: "device" });
  assert.equal(resolveRecordDeviceVisual({ reference: "IPHONE 15", catalogReference: "IPHONE 15 PRO", imageSrc: "/catalog/iphone15pro.jpg" }).kind, "apple");
});

test("acepta fuentes de catálogo normales y rechaza protocolos ajenos a imágenes", () => {
  for (const imageSrc of ["https://catalog.example.test/img.jpg", "http://127.0.0.1:3003/img.png", "/catalog/img.webp", "data:image/png;base64,aGVsbG8=", "data:image/svg+xml,%3Csvg%3E%3C/svg%3E"]) {
    assert.equal(getRecordCatalogImageSource(imageSrc), imageSrc);
  }
  for (const imageSrc of ["javascript:alert(1)", "data:text/html,%3Cscript%3E", "file:///C:/image.png", "//unknown.test/img.jpg", "https://user:password@example.test/img.jpg", "/\\unknown.test/img.jpg", "https://example.test/\nimg.jpg", "", null]) {
    assert.equal(getRecordCatalogImageSource(imageSrc), null, String(imageSrc));
  }
});

test("cuando falla la foto mantiene la alternativa correcta sin cambiar de modelo", () => {
  for (const [reference, expected] of [["IPHONE 16", "apple"], ["SAMSUNG A17", "android"], ["EQUIPO NO IDENTIFICADO", "device"]]) {
    const result = resolveRecordDeviceVisual({ reference, imageSrc: "/catalog/modelo.jpg" }, true);
    assert.equal(result.kind, expected);
    assert.equal(result.imageSrc, "/catalog/modelo.jpg");
  }
});

function imageProbe() {
  let state = false;
  let key;
  let tree;
  const hooks = { useState: () => [state, (value) => { state = value; }] };
  const styles = new Proxy({}, { get: (_target, prop) => String(prop) });
  const { RecordDeviceVisual } = loadTypeScript("app/vendedor/registros/buscar/device-visual.tsx", {
    react: hooks,
    "@/lib/record-device-media": helpers,
    "./device-visual.module.css": { __esModule: true, default: styles },
  });
  function render(props) {
    const outer = RecordDeviceVisual(props);
    if (outer.key !== key) { state = false; key = outer.key; }
    tree = outer.type(outer.props);
    return renderToStaticMarkup(tree);
  }
  function fail() {
    const photo = tree.props.children;
    assert.equal(photo.type, "img");
    photo.props.onError();
  }
  return { render, fail, get key() { return key; } };
}

test("el componente muestra SVG accesible para iPhone, Android y equipo desconocido", () => {
  const probe = imageProbe();
  for (const [reference, kind, description] of [["  iPhone 16", "apple", "Logotipo de Apple"], ["VIVO Y05", "android", "Robot de Android"], ["OTRO EQUIPO", "device", "Icono de dispositivo"]]) {
    const html = probe.render({ reference });
    assert.ok(html.includes(`data-device-visual="${kind}"`));
    assert.ok(html.includes(description));
    assert.ok(html.includes("<svg"));
    assert.ok(!html.includes("<img"));
  }
});

test("el error real de imagen muestra la alternativa y una nueva fuente vuelve a intentar cargar", () => {
  const probe = imageProbe();
  const props = { reference: "IPHONE 16", imageSrc: "/catalog/iphone16.jpg" };
  const initial = probe.render(props);
  assert.ok(initial.includes('data-device-visual="photo"'));
  assert.ok(initial.includes('alt="Imagen de catálogo de IPHONE 16"'));
  const firstKey = probe.key;
  probe.fail();
  const failed = probe.render(props);
  assert.ok(failed.includes('data-device-visual="apple"'));
  assert.ok(!failed.includes("<img"));
  assert.ok(!probe.render(props).includes("<img"), "No debe reintentar infinitamente una URL fallida");
  const changed = probe.render({ ...props, imageSrc: "/catalog/iphone16-new.jpg" });
  assert.notEqual(probe.key, firstKey);
  assert.ok(changed.includes('data-device-visual="photo"'));
  assert.ok(changed.includes('src="/catalog/iphone16-new.jpg"'));
});

test("al pasar a otro registro restablece la imagen y conserva su propia alternativa", () => {
  const probe = imageProbe();
  const source = "/catalog/image.jpg";
  probe.render({ reference: "IPHONE 16", imageSrc: source });
  probe.fail();
  assert.ok(probe.render({ reference: "IPHONE 16", imageSrc: source }).includes('data-device-visual="apple"'));
  assert.ok(probe.render({ reference: "SAMSUNG A17", imageSrc: source }).includes('data-device-visual="photo"'));
  probe.fail();
  assert.ok(probe.render({ reference: "SAMSUNG A17", imageSrc: source }).includes('data-device-visual="android"'));
});

test("la foto conserva su proporción y el espacio estable en escritorio y móvil", () => {
  const css = readFileSync(join(root, "app/vendedor/registros/buscar/device-visual.module.css"), "utf8");
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
});
