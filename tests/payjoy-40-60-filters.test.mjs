import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(name, imports = {}) {
  const source = readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, id => {
    if (Object.hasOwn(imports, id)) return imports[id];
    throw Error(`Unexpected import ${id}`);
  });
  return mod.exports;
}
const age = load('payjoy-40-60-age');
const { createFortySixtyFilters, filterFortySixtyRows, validateFortySixtyNumericFilter, isFortySixtyColumnFiltered } = load('payjoy-40-60-filters', {
  '@/lib/payjoy-40-60-age': age,
});
const numeric = (min = '', max = '', missing = 'all') => ({ min, max, missing });
const row = (id, changes = {}) => ({ id, week: '2026-11-09', merchantName: 'Créditos Águila', deviceTag: `DQA-${id}`, cedula: '0012345678',
  loanAgeDays: 59, numberOfPayments: 4, loanRepaymentBiweek: 125000.5, status: '40/60 APROBADO', ...changes });
const filter = (rows, changes = {}, reference = null, today = '2026-11-19') => filterFortySixtyRows(rows, { ...createFortySixtyFilters(), ...changes }, reference, today);
const ids = rows => rows.map(item => item.id);

test('rango inclusivo permite cero y no convierte los datos ausentes en cero', () => {
  for (const field of ['loanAgeDays', 'numberOfPayments', 'loanRepaymentBiweek']) {
    const source = [row('null', { [field]: null }), row('zero', { [field]: 0 }), row('min', { [field]: 2 }), row('max', { [field]: 4 }), row('outside', { [field]: 5 })];
    assert.deepEqual(ids(filter(source, { [field]: numeric('0', '0') })), ['zero']);
    assert.deepEqual(ids(filter(source, { [field]: numeric('2', '4') })), ['min', 'max']);
    assert.deepEqual(ids(filter(source, { [field]: numeric('', '2') })), ['zero', 'min']);
    assert.deepEqual(ids(filter(source, { [field]: numeric('4') })), ['max', 'outside']);
  }
});

test('con dato y sin dato distinguen null, cero y valores no finitos', () => {
  const source = [row('null', { numberOfPayments: null }), row('zero', { numberOfPayments: 0 }), row('known'),
    row('nan', { numberOfPayments: Number.NaN }), row('infinity', { numberOfPayments: Infinity }), row('undefined', { numberOfPayments: undefined })];
  assert.deepEqual(ids(filter(source)), ids(source));
  assert.deepEqual(ids(filter(source, { numberOfPayments: numeric('', '', 'known') })), ['zero', 'known']);
  assert.deepEqual(ids(filter(source, { numberOfPayments: numeric('', '', 'missing') })), ['null', 'nan', 'infinity', 'undefined']);
  assert.deepEqual(ids(filter(source, { numberOfPayments: numeric('0', '', 'missing') })), []);
});

test('combina semana exacta, comercio sin tildes, tag sin mayúsculas, cédula por dígitos y rangos', () => {
  const source = [row('match', { deviceTag: 'AbC-001', cedula: '00.123.456-78' }),
    row('week', { week: '2026-11-090', deviceTag: 'AbC-001' }), row('merchant', { merchantName: 'Otro', deviceTag: 'AbC-001' }),
    row('tag', { deviceTag: 'ZX-001' }), row('cedula', { deviceTag: 'AbC-001', cedula: '008899' }),
    row('age', { deviceTag: 'AbC-001', loanAgeDays: 58 }), row('payments', { deviceTag: 'AbC-001', numberOfPayments: 3 }),
    row('amount', { deviceTag: 'AbC-001', loanRepaymentBiweek: 125000.51 })];
  const filters = { week: '2026-11-09', merchantName: ' CREDItos AGUI ', deviceTag: ' abc-', cedula: '00.123',
    loanAgeDays: numeric('59', '59'), numberOfPayments: numeric('4', '4'), loanRepaymentBiweek: numeric('125000.50', '125000.50') };
  assert.deepEqual(ids(filter(source, filters)), ['match']);
  assert.deepEqual(ids(filter(source, { week: '2026-11' })), []);
  assert.deepEqual(ids(filter(source, { week: 'semana desconocida' })), []);
});

test('la edad filtrada es la misma edad mostrada y cambia a medianoche de Bogotá', () => {
  const source = [row('known'), row('missing', { loanAgeDays: null }), row('future', { loanAgeDays: 60 })];
  const before = age.colombiaCalendarDate(new Date('2026-11-19T04:59:59.999Z'));
  const after = age.colombiaCalendarDate(new Date('2026-11-19T05:00:00.000Z'));
  assert.equal(before, '2026-11-18'); assert.equal(after, '2026-11-19');
  assert.deepEqual(ids(filter(source, { loanAgeDays: numeric('60', '60') }, '2026-11-18', before)), ['future']);
  assert.deepEqual(ids(filter(source, { loanAgeDays: numeric('60', '60') }, '2026-11-18', after)), ['known']);
  const matched = filter(source, { loanAgeDays: numeric('60', '60') }, '2026-11-18', after);
  assert.equal(age.effectiveLoanAge(matched[0].loanAgeDays, '2026-11-18', after), 60);
  assert.deepEqual(ids(filter(source, { loanAgeDays: numeric('59', '59') }, null, after)), ['known']);
  assert.deepEqual(ids(filter(source, { loanAgeDays: numeric('59', '59') }, '2026-11-20', after)), ['known']);
});

test('valida rangos abiertos y decimales simples; edades y pagos deben ser enteros', () => {
  for (const value of [numeric(), numeric('0'), numeric('', '2'), numeric('2', '2'), numeric('2.0', '3.00'), numeric('', '', 'missing')]) {
    assert.equal(validateFortySixtyNumericFilter(value, { integer: true, label: 'Pagos' }), '');
  }
  assert.equal(validateFortySixtyNumericFilter(numeric('.5', '125000.50'), { integer: false, label: 'Cuota' }), '');
  assert.match(validateFortySixtyNumericFilter(numeric('.5'), { integer: true, label: 'Pagos' }), /enteros/);
  assert.match(validateFortySixtyNumericFilter(numeric('8', '7'), { integer: true, label: 'Edad' }), /máximo/);
  assert.match(validateFortySixtyNumericFilter(numeric('0', '', 'missing'), { integer: false, label: 'Cuota' }), /sin dato/);
});

test('rechaza entradas numéricas ambiguas, estados desconocidos y límites inseguros sin ampliar resultados', () => {
  const invalid = ['-1', '+1', '1e3', '1,5', '1 000', 'NaN', 'Infinity', '0x10', '1.', '.', '9007199254740992'];
  for (const value of invalid) for (const bound of ['min', 'max']) {
    const input = { ...numeric(), [bound]: value };
    assert.notEqual(validateFortySixtyNumericFilter(input, { integer: false, label: 'Cuota' }), '', value);
    assert.deepEqual(filter([row('known')], { loanRepaymentBiweek: input }), []);
  }
  for (const input of [null, undefined, {}, numeric('', '', 'unknown'), { ...numeric(), min: 0 }, { ...numeric(), max: null }]) {
    assert.notEqual(validateFortySixtyNumericFilter(input, { integer: true, label: 'Pagos' }), '');
    assert.deepEqual(filter([row('known')], { numberOfPayments: input }), []);
  }
});

test('indicador de columna responde al filtro real y cada estado inicial es independiente', () => {
  const first = createFortySixtyFilters(), second = createFortySixtyFilters();
  for (const key of Object.keys(first)) assert.equal(isFortySixtyColumnFiltered(first, key), false);
  first.loanAgeDays.min = '0';
  assert.equal(isFortySixtyColumnFiltered(first, 'loanAgeDays'), true);
  assert.equal(isFortySixtyColumnFiltered(first, 'numberOfPayments'), false);
  assert.equal(second.loanAgeDays.min, '');
  first.numberOfPayments.missing = 'missing';
  first.merchantName = '   '; first.cedula = '00.123';
  assert.equal(isFortySixtyColumnFiltered(first, 'numberOfPayments'), true);
  assert.equal(isFortySixtyColumnFiltered(first, 'merchantName'), false);
  assert.equal(isFortySixtyColumnFiltered(first, 'cedula'), true);
});

test('filtra todo el conjunto antes de paginar y combina el resultado externo sin mutar filas ni estado', () => {
  const source = Object.freeze(Array.from({ length: 32 }, (_, index) => Object.freeze(row(index, {
    merchantName: index < 20 ? 'Otro comercio' : 'Créditos Águila', status: index % 2 ? '40/60 APROBADO' : '40/60 NO APROBADO',
  }))));
  const filters = createFortySixtyFilters(); filters.merchantName = 'aguila';
  for (const key of ['loanAgeDays', 'numberOfPayments', 'loanRepaymentBiweek']) Object.freeze(filters[key]);
  Object.freeze(filters);
  const saved = JSON.stringify(source);
  const result = filterFortySixtyRows(source, filters, '2026-11-18', '2026-11-19');
  assert.equal(result.length, 12); assert.deepEqual(ids(result.slice(0, 10)), Array.from({ length: 10 }, (_, i) => 20 + i));
  assert.deepEqual(ids(result.filter(item => item.status === '40/60 APROBADO')), [21, 23, 25, 27, 29, 31]);
  assert.equal(result[0], source[20]); assert.notEqual(result, source);
  assert.equal(JSON.stringify(source), saved);
});
