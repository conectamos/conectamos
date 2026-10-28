import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const imei = '359999999999991';
const tag = 'DCREDIT1';
const secret = 'server-key-NEVER-EXPOSE';
const time = 1793134800;
const iso = new Date(time * 1000).toISOString();
const retail = changes => ({ valid: true,
  device: { imei, deviceTag: tag, validThrough: time, model: { name: 'Equipo de prueba' }, lastSeen: time, secureStatus: 'Device Active And Secured' },
  financeOrder: { id: 400001, currency: 'COP', remainingBalance: 900000, financeAmount: 1000000, downPayment: 200000, purchaseAmount: 1200000, months: 12, weeklyCost: 20000, monthlyCost: 80000 },
  customer: { name: 'Private name', nationalId: '123123123', id: 555 },
  paymentHistory: [{ amount: '20000', timestamp: String(time) }],
  ...changes,
});
const payment = changes => ({ valid: true, currency: 'COP', remainingBalance: 850000,
  deviceDetails: { deviceTag: tag, validThrough: time, cost7: 20000, cost30: 80000, months: 12 }, ...changes });
function fixture({ retailPayload = retail(), paymentPayload = payment(), configured = true, stored = null, storedError, retailResponse, paymentResponse } = {}) {
  const calls = [], associations = [], cache = new Map();
  const fetch = async (url, init = {}) => {
    const address = new URL(url);
    calls.push({ url: address, init });
    if (address.hostname === 'retail.example.test') return retailResponse ? retailResponse(address, init) : Response.json(retailPayload);
    assert.equal(address.href, 'https://www.payjoy.com/payments/pay-cc.php');
    return paymentResponse ? paymentResponse(address, init) : Response.json(paymentPayload);
  };
  const mocks = {
    'server-only': {}, '@/lib/credit-date-utils': {},
    '@/lib/payjoy-credit-device-store': { findStoredPayJoyCreditDevice: async value => { associations.push(value); if (storedError) throw storedError; return stored; } },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'exports', 'fetch', 'process', code)(id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`);
      throw new Error(`Unexpected import ${id}`);
    }, exports, fetch, { env: { PAYJOY_RETAIL_API_BASE_URL: 'https://retail.example.test/v1', ...(configured ? { PAYJOY_RETAIL_API_KEY: secret } : {}) } });
    return exports;
  }
  return { ...load('lib/payjoy-credit-provider.ts'), calls, associations, load };
}

test('ficha reúne Retail y saldo reutilizando sólo las dos consultas existentes y elimina datos privados', async () => {
  const f = fixture();
  const result = await f.readPayJoyCreditSnapshot(imei);
  assert.equal(result.source, 'RETAIL_AND_PAYMENT');
  assert.equal(result.deviceTag, tag); assert.equal(result.imei, imei);
  assert.equal(result.financeOrderId, '400001');
  assert.equal(result.remainingBalance, 850000); assert.equal(result.financeAmount, 1000000);
  assert.equal(result.downPayment, 200000); assert.equal(result.purchaseAmount, 1200000);
  assert.equal(result.validThrough, iso); assert.equal(result.lastSeen, iso);
  assert.equal(result.secureStatus, 'Device Active And Secured');
  assert.equal(result.paymentsAvailability, 'INFORMADO');
  assert.deepEqual(result.payments, [{ amount: 20000, currency: 'COP', paidAt: iso }]);
  assert.equal(result.fortnightlyCost, null); assert.equal(result.paidInFull, null);
  assert.doesNotMatch(JSON.stringify(result), /Private name|123123123|customer|server-key|message|deviceDetails/);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].url.pathname, '/v1/lookup-customer.php');
  assert.equal(f.calls[0].url.searchParams.get('customerLocator'), imei);
  assert.equal(f.calls[0].url.searchParams.get('key'), secret);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(f.calls[1].init.body)), {
    deviceTag: tag, endpoint: 'pay-payment-api-html', 'type[paymentApiType]': 'WOMPI', 'type[countryCode]': 'CO', 'type[vendor]': 'NEQUI',
  });
  for (const { init } of f.calls) { assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.ok(init.signal); }
});

test('saldo cero no demuestra pagado y cuota quincenal sólo aparece si PayJoy la informa', async () => {
  for (const paidInFull of [undefined, false, true]) {
    const f = fixture({ configured: false, paymentPayload: payment({ remainingBalance: 0, ...(paidInFull === undefined ? {} : { paidInFull }) }) });
    const result = await f.readPayJoyCreditSnapshot(` ${tag.toLowerCase()} `);
    assert.equal(result.remainingBalance, 0); assert.equal(result.paidInFull, paidInFull ?? null); assert.equal(result.fortnightlyCost, null);
  }
  const f = fixture({ configured: false, paymentPayload: payment({ deviceDetails: { deviceTag: tag, cost7: 20000, feeSchema: JSON.stringify({ installmentFees: { cost14: 39999 } }) } }) });
  assert.equal((await f.readPayJoyCreditSnapshot(tag)).fortnightlyCost, 39999);
});

test('mensaje de pagado debe coincidir exactamente y no se expone el texto remoto', async () => {
  for (const message of ['Pagado por completo.', 'PAID IN FULL', 'No debe un pago adicional']) {
    const f = fixture({ configured: false, paymentPayload: { valid: false, message } });
    const result = await f.readPayJoyCreditSnapshot(tag);
    assert.equal(result.paidInFull, true); assert.equal(result.remainingBalance, null);
    assert.equal(result.currency, null); assert.doesNotMatch(JSON.stringify(result), /message/);
  }
  for (const payload of [{ valid: false, message: 'No está paid in full' }, { valid: true, message: 'not paid off' }]) {
    await assert.rejects(fixture({ configured: false, paymentPayload: payload }).readPayJoyCreditSnapshot(tag));
  }
});

test('respuesta Retail vacía y ausencia de clave admiten código directo sin inventar identidad o historial', async () => {
  for (const options of [{ retailPayload: { valid: true } }, { configured: false }]) {
    const f = fixture(options);
    const result = await f.readPayJoyCreditSnapshot(tag);
    assert.equal(result.source, 'PAYMENT'); assert.equal(result.imei, null); assert.equal(result.financeOrderId, null);
    assert.equal(result.paymentsAvailability, 'NO_DISPONIBLE'); assert.deepEqual(result.payments, []);
    assert.ok(result.warnings.length); assert.deepEqual(f.associations, [tag]);
  }
});

test('IMEI exige resolución única al tag y puede usar el respaldo verificado ante Retail vacío o no configurado', async () => {
  for (const options of [{ retailPayload: { valid: true } }, { configured: false }]) {
    const f = fixture({ ...options, stored: { imei, deviceTag: tag } });
    const result = await f.readPayJoyCreditSnapshot(imei);
    assert.equal(result.imei, imei); assert.equal(result.deviceTag, tag);
    assert.deepEqual(f.associations, [imei]);
  }
  const missing = fixture({ retailPayload: { valid: true } });
  await assert.rejects(missing.readPayJoyCreditSnapshot(imei), { code: 'DEVICE_UNRESOLVED' });
  assert.equal(missing.calls.length, 1);
  await assert.rejects(fixture({ configured: false, stored: { imei: '359999999999992', deviceTag: tag } }).readPayJoyCreditSnapshot(imei), { code: 'INVALID_RESPONSE' });
  await assert.rejects(fixture({ configured: false, storedError: { code: 'DEVICE_ASSOCIATION_CONFLICT' } }).readPayJoyCreditSnapshot(tag), { code: 'DEVICE_ASSOCIATION_CONFLICT' });
});

test('Retail completo sin tag conserva ficha parcial si no hay asociación, sin consultar saldo de otro dispositivo', async () => {
  const f = fixture({ retailPayload: retail({ device: { imei } }) });
  const result = await f.readPayJoyCreditSnapshot(imei);
  assert.equal(result.source, 'RETAIL'); assert.equal(result.deviceTag, null); assert.equal(result.imei, imei);
  assert.ok(result.warnings.length); assert.equal(f.calls.length, 1);
});

test('campos ausentes o malformados permanecen desconocidos y pagos incompletos no se inventan', async () => {
  const f = fixture({ retailPayload: retail({
    financeOrder: { id: 'secret?key=bad', currency: 'COP', financeAmount: '', downPayment: -1, months: 0, weeklyCost: 'Infinity' },
    device: { imei, deviceTag: tag, lastSeen: 'bad', secureStatus: '<script>bad</script>' },
    paymentHistory: [{ amount: '20', timestamp: time }, { amount: '-1', timestamp: time }, { amount: 0, timestamp: time }, { amount: 5, timestamp: 'bad' }, { amount: 5, timestamp: time, currency: 'invalid' }, { amount: 5, timestamp: Math.floor(Date.now() / 1000) + 86400 }],
  }), paymentResponse: async () => { throw new Error('secret network details'); } });
  const result = await f.readPayJoyCreditSnapshot(tag);
  for (const field of ['financeOrderId', 'financeAmount', 'downPayment', 'months', 'weeklyCost', 'lastSeen', 'secureStatus', 'remainingBalance']) assert.equal(result[field], null);
  assert.equal(result.paymentsAvailability, 'INFORMADO'); assert.deepEqual(result.payments, [{ amount: 20, currency: 'COP', paidAt: iso }]);
  assert.equal(result.source, 'RETAIL'); assert.ok(result.warnings.length >= 2);
  assert.doesNotMatch(JSON.stringify(result), /secret|network details|script/);
});

test('historial vacío se distingue del no informado sin certificar ausencia de pagos', async () => {
  for (const [paymentHistory, availability] of [[[], 'INFORMADO'], [undefined, 'NO_DISPONIBLE'], [null, 'NO_DISPONIBLE']]) {
    const result = await fixture({ retailPayload: retail({ paymentHistory }) }).readPayJoyCreditSnapshot(tag);
    assert.equal(result.paymentsAvailability, availability); assert.deepEqual(result.payments, []);
    assert.equal(result.paidInFull, null);
  }
});

test('rechaza contradicciones de identidad, moneda y estado incluso cuando otra fuente podría devolver datos', async () => {
  for (const options of [
    { retailPayload: retail({ device: { imei: '359999999999992', deviceTag: tag } }) },
    { paymentPayload: payment({ deviceDetails: { deviceTag: 'DOTHER1' } }) },
    { paymentPayload: payment({ currency: 'USD' }) },
    { paymentPayload: payment({ paidInFull: true }) },
    { paymentPayload: payment({ paidInFull: true, fullyPaid: false }) },
    { paymentPayload: payment({ message: 'Paid off', paidInFull: false }) },
    { retailPayload: retail({ financeOrder: { currency: 'COP', remainingBalance: 0, paidInFull: true } }) },
    { paymentPayload: payment({ remainingBalance: undefined, paidInFull: true }) },
  ]) await assert.rejects(fixture(options).readPayJoyCreditSnapshot(imei), { code: 'INVALID_RESPONSE' });
});

test('no aplica moneda de otra fuente a importes que PayJoy entregó sin moneda', async () => {
  const f = fixture({ paymentPayload: payment({ currency: undefined, remainingBalance: 500, deviceDetails: { deviceTag: tag, cost7: 1, validThrough: time + 60 } }) });
  const result = await f.readPayJoyCreditSnapshot(tag);
  assert.equal(result.remainingBalance, 900000); assert.equal(result.weeklyCost, 20000);
  assert.equal(result.validThrough, new Date((time + 60) * 1000).toISOString());
  assert.match(result.warnings.join(' '), /moneda verificable/);
  const onlyPublic = await fixture({ configured: false, paymentPayload: payment({ currency: undefined }) }).readPayJoyCreditSnapshot(tag);
  assert.equal(onlyPublic.remainingBalance, null); assert.equal(onlyPublic.weeklyCost, null); assert.equal(onlyPublic.currency, null);
  const unknownRetail = await fixture({ retailPayload: retail({ financeOrder: { financeAmount: 100, remainingBalance: 60, weeklyCost: 5 } }) }).readPayJoyCreditSnapshot(tag);
  assert.equal(unknownRetail.financeAmount, null); assert.equal(unknownRetail.remainingBalance, 850000); assert.equal(unknownRetail.currency, 'COP');
});

test('fallos Retail de autorización, transporte o respuesta contradictoria no activan respaldo', async () => {
  for (const [status, code] of [[401, 'AUTH'], [403, 'AUTH'], [404, 'NOT_FOUND'], [408, 'TIMEOUT'], [429, 'RATE_LIMIT'], [500, 'UNAVAILABLE']]) {
    const f = fixture({ retailResponse: async () => new Response(`private ${secret}`, { status }) });
    await assert.rejects(f.readPayJoyCreditSnapshot(tag), { code });
    assert.equal(f.calls.length, 1); assert.equal(f.associations.length, 0);
  }
  for (const retailPayload of [{ valid: true, customer: { id: 8 } }, { valid: true, device: { imei: 'wrong' } }, { valid: false }]) {
    const f = fixture({ retailPayload });
    await assert.rejects(f.readPayJoyCreditSnapshot(tag)); assert.equal(f.calls.length, 1);
  }
});

test('lector público clasifica HTTP, JSON y timeout sin filtrar mensajes remotos ni claves', async () => {
  for (const [response, expected] of [
    [async () => new Response(secret, { status: 403 }), 'AUTH'], [async () => new Response(secret, { status: 404 }), 'NOT_FOUND'],
    [async () => new Response(secret, { status: 429 }), 'RATE_LIMIT'], [async () => new Response(secret), 'INVALID_RESPONSE'],
    [async () => { throw Object.assign(new Error(secret), { name: 'AbortError' }); }, 'TIMEOUT'],
    [async () => { throw new Error(secret); }, 'UNAVAILABLE'],
  ]) {
    const f = fixture({ configured: false, paymentResponse: response });
    await assert.rejects(f.readPayJoyCreditSnapshot(tag), error => error.code === expected && !error.message.includes(secret));
    assert.equal(f.calls.length, 1);
  }
});

test('lectores limitan cuerpo anunciado y transferido aunque el proveedor omita Content-Length', async () => {
  const tooLarge = 'x'.repeat(262145);
  for (const response of [() => new Response('{}', { headers: { 'content-length': '262145' } }), () => new Response(tooLarge)]) {
    await assert.rejects(fixture({ retailResponse: async () => response() }).readPayJoyCreditSnapshot(tag), { code: 'INVALID_RESPONSE' });
    await assert.rejects(fixture({ configured: false, paymentResponse: async () => response() }).readPayJoyCreditSnapshot(tag), { code: 'INVALID_RESPONSE' });
  }
});

test('valida el identificador antes de leer almacenes o consultar proveedores', async () => {
  const f = fixture();
  for (const input of [null, 123, '', '1118196418', 'D123', 'https://payjoy.com', `${tag}/select`, 'D'.repeat(33)]) {
    await assert.rejects(f.readPayJoyCreditSnapshot(input), { code: 'INVALID_INPUT' });
  }
  assert.equal(f.calls.length, 0); assert.equal(f.associations.length, 0);
});

function storeFixture({ rows = [], verified = null, queryError } = {}) {
  const calls = [];
  class Conflict extends Error { code = 'DEVICE_ASSOCIATION_CONFLICT'; }
  const source = readFileSync(new URL('../lib/payjoy-credit-device-store.ts', import.meta.url), 'utf8');
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(id => {
    if (id === 'server-only') return {};
    if (id === '@/lib/prisma') return { $queryRawUnsafe: async (...args) => { calls.push(args); if (queryError) throw queryError; return rows; } };
    if (id === '@/lib/payjoy-extensions-device-store') return { PayJoyDeviceAssociationConflictError: Conflict, findStoredPayJoyExtensionDevice: async input => { calls.push(input); return verified; } };
    throw new Error(`Unexpected import ${id}`);
  }, exports);
  return { ...exports, calls };
}
test('respaldo por IMEI exige una única pareja y comprobación inversa, sin retornar documento', async () => {
  const row = { imei, deviceTag: tag, documentoNumero: '123456789' };
  const f = storeFixture({ rows: [row], verified: row });
  assert.deepEqual(await f.findStoredPayJoyCreditDevice(imei), { imei, deviceTag: tag });
  assert.match(f.calls[0][0], /LIMIT 120/); assert.match(f.calls[0][0], /WHERE btrim\(item.value->>'imei'\) = \$1 LIMIT 3/);
  assert.equal(f.calls[0][1], imei); assert.deepEqual(f.calls[1], { deviceTag: tag });
  for (const options of [{ rows: [row, row] }, { rows: [row], verified: { ...row, imei: '359999999999992' } }, { rows: [row], verified: null }, { rows: [{ ...row, documentoNumero: '' }] }]) {
    await assert.rejects(storeFixture(options).findStoredPayJoyCreditDevice(imei), { code: 'DEVICE_ASSOCIATION_CONFLICT' });
  }
  assert.equal(await storeFixture({ queryError: { code: 'P2021' } }).findStoredPayJoyCreditDevice(imei), null);
  await assert.rejects(storeFixture({ queryError: { code: 'P1001' } }).findStoredPayJoyCreditDevice(imei), { code: 'P1001' });
});
