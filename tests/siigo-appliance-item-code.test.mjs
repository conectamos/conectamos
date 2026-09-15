import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("electrodomesticos usan el producto Siigo 001 con IVA 19", async () => {
  const siigoSource = await readFile(
    new URL("../lib/siigo.ts", import.meta.url),
    "utf8",
  );
  const sedesSource = await readFile(
    new URL("../app/dashboard/sedes/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(siigoSource, /applianceItemCode:\s*"001"/);
  assert.doesNotMatch(
    siigoSource,
    /SIIGO_APPLIANCE_ITEM_CODE[^\n]*\|\|\s*"002"/,
  );
  assert.match(
    sedesSource,
    /Electrodomestico siempre usa 001 con IVA 19%\./,
  );
});
