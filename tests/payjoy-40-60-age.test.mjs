import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/payjoy-40-60-age.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const { colombiaCalendarDate, calendarDayNumber, effectiveLoanAge } = loaded.exports;

test('DBQCPKWM conserva 58 hoy, aumenta a 59 mañana y 60 el viernes', () => {
  assert.equal(effectiveLoanAge(58, '2026-10-28', '2026-10-28'), 58);
  assert.equal(effectiveLoanAge(58, '2026-10-28', '2026-10-29'), 59);
  assert.equal(effectiveLoanAge(58, '2026-10-28', '2026-10-30'), 60);
});

test('el día cambia a medianoche de Colombia, sin depender de la zona del navegador', () => {
  assert.equal(colombiaCalendarDate(new Date('2026-10-29T04:59:59.999Z')), '2026-10-28');
  assert.equal(colombiaCalendarDate(new Date('2026-10-29T05:00:00.000Z')), '2026-10-29');
});

test('cuenta días calendario a través de meses, años y febrero bisiesto', () => {
  assert.equal(effectiveLoanAge(58, '2026-12-31', '2027-01-02'), 60);
  assert.equal(effectiveLoanAge(58, '2028-02-28', '2028-03-01'), 60);
  assert.equal(effectiveLoanAge(58, '2027-02-28', '2027-03-01'), 59);
});

test('sin fecha base conocida conserva la edad original y nunca inventa edad ausente', () => {
  for (const base of [null, undefined, '', '2026-02-30', '28/10/2026']) assert.equal(effectiveLoanAge(58, base, '2026-10-30'), 58);
  assert.equal(effectiveLoanAge(null, '2026-10-28', '2026-10-30'), null);
  assert.equal(effectiveLoanAge(Number.NaN, '2026-10-28', '2026-10-30'), null);
  assert.equal(effectiveLoanAge(0, '2026-10-28', '2026-10-29'), 1);
  assert.equal(effectiveLoanAge(58, '2026-10-30', '2026-10-28'), 58);
});

test('guardar y recuperar el mismo valor base no duplica el aumento diario', () => {
  const stored = { loanAgeDays: 58, ageReferenceDate: '2026-10-28', status: '40/60 APROBADO' };
  const before = JSON.stringify(stored);
  for (let i = 0; i < 3; i++) assert.equal(effectiveLoanAge(stored.loanAgeDays, stored.ageReferenceDate, '2026-10-30'), 60);
  assert.equal(JSON.stringify(stored), before);
  assert.equal(calendarDayNumber('2026-10-29') - calendarDayNumber('2026-10-28'), 1);
  assert.equal(calendarDayNumber('2026-13-01'), null);
});
