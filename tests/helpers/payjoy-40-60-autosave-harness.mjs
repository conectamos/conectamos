import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

export const pump = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

export class MemoryStorage {
  map = new Map();
  failWrites = false;
  failReads = false;
  failRemovals = false;
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { if (this.failReads) throw Error('Storage unavailable QA'); return this.map.get(String(key)) ?? null; }
  setItem(key, value) { if (this.failWrites) throw new DOMException('Quota exceeded QA', 'QuotaExceededError'); this.map.set(String(key), String(value)); }
  removeItem(key) { if (this.failRemovals) throw Error('Storage removal unavailable QA'); this.map.delete(String(key)); }
}

export function fakeClock(initialTime = Date.parse('2026-10-28T15:00:00.000Z')) {
  let now = initialTime, next = 0;
  const tasks = new Map();
  return {
    now: () => now,
    schedule(fn, ms) { const id = ++next; tasks.set(id, { fn, due: now + ms }); return id; },
    cancel(id) { tasks.delete(id); },
    pending: () => tasks.size,
    async advance(ms) {
      const target = now + ms;
      for (let count = 0; count < 1000; count++) {
        const task = [...tasks.entries()].filter(([, value]) => value.due <= target).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!task) { now = target; await pump(); return; }
        now = task[1].due; tasks.delete(task[0]); task[1].fn(); await pump();
      }
      throw Error('Infinite timer loop in QA');
    },
  };
}

export function samplePayload() {
  const rows = Array.from({ length: 32 }, (_, i) => ({ id: 'qa-' + i, week: '2026-10-19', merchantName: 'Comercio QA', deviceTag: 'QA' + String(i).padStart(6, '0'), loanAgeDays: 50, numberOfPayments: 4, loanRepaymentBiweek: 125000, cedula: i === 25 ? '000123456789' : '', status: i % 2 ? '40/60 APROBADO' : '40/60 NO APROBADO', pay40At60: i % 2, paidInFull: false }));
  return { recordName: 'Corte QA', week: '2026-10-19', fileName: 'corte-qa.xlsx', sheetName: 'Transacciones', totalRows: 64, filteredRows: 32, ageReferenceDate: '2026-10-28', summary: { aprobados: 16, noAprobados: 16, cedulasEncontradas: 1, cedulasPendientes: 31 }, rows };
}
export function edited(payload, cedula = '000987654321', rowIndex = 25) {
  const next = structuredClone(payload); next.rows[rowIndex].cedula = cedula;
  next.summary = { aprobados: next.rows.filter(row => row.status === '40/60 APROBADO').length, noAprobados: next.rows.filter(row => row.status !== '40/60 APROBADO').length, cedulasEncontradas: next.rows.filter(row => row.cedula.trim()).length, cedulasPendientes: next.rows.filter(row => !row.cedula.trim()).length };
  return next;
}
export function sampleRecord(id = 71, payload = samplePayload()) {
  return { ...structuredClone(payload), id, revision: 1, savedById: 8, savedByName: 'Usuario QA', savedByUser: 'qa', savedAt: '2026-10-28T12:00:00Z', updatedAt: '2026-10-28T12:00:00Z' };
}

// A local HTTP boundary with optimistic versions and idempotent creates. No sockets or provider imports.
export function fakeRecordsApi(initial = [sampleRecord()]) {
  const records = new Map(initial.map(record => [record.id, structuredClone(record)]));
  const createdKeys = new Map(), calls = [], held = [], outcomes = [];
  let nextId = 1000;
  const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });
  function payloadOnly(body) {
    const { id, expectedRevision, clientKey, ...payload } = body; void id; void expectedRevision; void clientKey;
    return { ...payload, recordName: payload.recordName.trim(), week: payload.week.trim(), rows: payload.rows.map(row => ({ ...row, id: row.id.trim(), week: row.week.trim(), merchantName: row.merchantName.trim(), deviceTag: row.deviceTag.trim().toUpperCase(), cedula: row.cedula.trim() })) };
  }
  async function request(url, init = {}) {
    assert.ok(url.startsWith('/api/payjoy/40-60/registros'), 'Autosave must never call processing/PayJoy: ' + url);
    const method = init.method || 'GET'; const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body: structuredClone(body) });
    const outcome = outcomes.shift();
    if (outcome === 'offline') throw new TypeError('Network unavailable QA');
    if (outcome === 'http500') return response({ error: 'Storage failure QA' }, 500);
    let result;
    if (method === 'GET') {
      const id = Number(new URL(url, 'https://qa.invalid').searchParams.get('id'));
      result = records.has(id) ? response({ ok: true, registro: records.get(id) }) : response({ error: 'Registro no encontrado QA' }, 404);
    } else if (method === 'POST') {
      assert.match(body.clientKey, /^[0-9a-f-]{36}$/i, 'Stable clientKey required');
      const replayed = createdKeys.has(body.clientKey);
      const id = replayed ? createdKeys.get(body.clientKey) : nextId++;
      if (!replayed) { createdKeys.set(body.clientKey, id); records.set(id, sampleRecord(id, payloadOnly(body))); }
      result = response({ ok: true, replayed, registro: records.get(id) });
    } else if (method === 'PATCH') {
      const previous = records.get(body.id);
      if (!previous) result = response({ error: 'Registro no encontrado QA' }, 404);
      else if (body.expectedRevision !== previous.revision) result = response({ code: 'REVISION_CONFLICT', currentRevision: previous.revision, error: 'Otra pestaña cambió el corte QA' }, 409);
      else { const saved = { ...previous, ...payloadOnly(body), revision: previous.revision + 1, updatedAt: '2026-10-28T15:00:00Z' }; records.set(body.id, saved); result = response({ ok: true, registro: saved }); }
    } else throw Error('Unexpected autosave method: ' + method);
    if (outcome === 'drop-after-commit') throw new TypeError('Response lost after commit QA');
    if (outcome === 'hold') return await new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('Timeout QA', 'AbortError'));
      init.signal?.addEventListener('abort', abort, { once: true });
      held.push(() => { init.signal?.removeEventListener('abort', abort); resolve(result); });
    });
    return result;
  }
  return { records, createdKeys, calls, outcomes, request, release() { assert.ok(held.length, 'No pending response'); held.shift()(); }, writes: () => calls.filter(call => call.method !== 'GET') };
}

export function loadAutosave(globals = {}) {
  const source = readFileSync(new URL('../../lib/payjoy-40-60-autosave.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), compiled)(name => { throw Error('Unexpected autosave dependency: ' + name); }, loaded, loaded.exports, ...Object.values(globals));
  return loaded.exports;
}

export function autosaveEnvironment({ owner = '8:7', storage = new MemoryStorage(), session = new MemoryStorage(), api = fakeRecordsApi(), clock = fakeClock(), writerId = 'writer-qa-a' } = {}) {
  const { FortySixtyAutosave } = loadAutosave();
  const states = [], hydrated = [], saved = [];
  let sequence = 0;
  const controller = new FortySixtyAutosave({
    owner, storage, session, writerId, request: api.request, now: clock.now, schedule: clock.schedule, cancel: clock.cancel,
    uuid: () => '00000000-0000-4000-8000-' + String(++sequence).padStart(12, '0'),
    onState: state => states.push(structuredClone(state)),
    onHydrate: (payload, recordId, revision, restored) => hydrated.push({ payload: structuredClone(payload), recordId, revision, restored }),
    onSaved: record => saved.push(structuredClone(record)),
  });
  return { controller, owner, storage, session, api, clock, states, hydrated, saved, state: () => states.at(-1) };
}
