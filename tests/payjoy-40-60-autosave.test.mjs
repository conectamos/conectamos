import assert from 'node:assert/strict';
import test from 'node:test';
import { autosaveEnvironment, edited, fakeRecordsApi, MemoryStorage, pump, samplePayload, sampleRecord } from './helpers/payjoy-40-60-autosave-harness.mjs';

test('consultar un corte sin editar no guarda ni programa llamadas a PayJoy', async () => {
  const env = autosaveEnvironment(); env.controller.open(sampleRecord()); await env.clock.advance(10000);
  assert.equal(env.api.calls.length, 0); assert.equal(env.state().dirty, false); env.controller.dispose();
});

test('importar respalda localmente sin crear un corte ni hacerlo al restaurar con F5', async () => {
  const env = autosaveEnvironment(); const payload = samplePayload(); env.controller.import(payload); await env.clock.advance(10000);
  assert.equal(env.api.calls.length, 0); assert.equal(env.state().backedUp, true); env.controller.dispose();
  const restored = autosaveEnvironment({ storage: env.storage, session: env.session, api: env.api, writerId: 'writer-qa-restored' }); await restored.controller.restore(); await restored.clock.advance(10000);
  assert.deepEqual(restored.hydrated.at(-1).payload, payload); assert.equal(restored.api.calls.length, 0); assert.equal(restored.state().dirty, true); restored.controller.dispose();
});

test('cada edición queda respaldada antes del debounce y solo se envía el último texto tras 1 s', async () => {
  const env = autosaveEnvironment(); env.controller.open(sampleRecord()); const first = edited(samplePayload(), '0001'); env.controller.edit(first);
  assert.equal(env.state().backedUp, true); assert.ok([...env.storage.map.values()].some(value => value.includes('0001'))); await env.clock.advance(900); assert.equal(env.api.writes().length, 0);
  const latest = edited(first, '0001234567890'); env.controller.edit(latest); await env.clock.advance(999); assert.equal(env.api.writes().length, 0); await env.clock.advance(1);
  assert.equal(env.api.writes().length, 1); const call = env.api.writes()[0]; assert.equal(call.method, 'PATCH'); assert.equal(call.body.expectedRevision, 1); assert.equal(call.body.rows.length, 32); assert.equal(call.body.rows[25].cedula, '0001234567890'); assert.equal(env.state().dirty, false); env.controller.dispose();
});

test('tipear durante una solicitud conserva el último snapshot y serializa el PATCH siguiente', async () => {
  const env = autosaveEnvironment(); env.controller.open(sampleRecord()); env.api.outcomes.push('hold'); env.controller.edit(edited(samplePayload(), '0001')); await env.clock.advance(1000);
  assert.equal(env.api.writes().length, 1); assert.equal(env.state().phase, 'saving'); env.controller.edit(edited(samplePayload(), '000123')); await env.clock.advance(5000);
  assert.equal(env.api.writes().length, 1); assert.equal(env.state().dirty, true); env.api.release(); await pump(); await env.clock.advance(1000);
  assert.equal(env.api.writes().length, 2); assert.equal(env.api.writes()[1].body.expectedRevision, 2); assert.equal(env.api.records.get(71).rows[25].cedula, '000123'); assert.equal(env.state().dirty, false); env.controller.dispose();
});

test('dos Guardar simultáneos comparten el mismo envío y no crean duplicados', async () => {
  const env = autosaveEnvironment({ api: fakeRecordsApi([]) }); env.controller.import(samplePayload()); env.api.outcomes.push('hold');
  const one = env.controller.flush(), two = env.controller.flush(); await pump(); assert.equal(env.api.writes().length, 1); env.api.release(); await Promise.all([one, two]);
  assert.equal(env.api.records.size, 1); assert.equal(env.api.writes().length, 1); env.controller.dispose();
});

test('conflicto 409 conserva el borrador y pausa reintentos sin asumir la revisión ajena', async () => {
  const env = autosaveEnvironment(); env.controller.open(sampleRecord()); env.api.records.set(71, { ...sampleRecord(), revision: 2, recordName: 'Edición de otra pestaña' }); env.controller.edit(edited(samplePayload())); await env.clock.advance(1000);
  assert.equal(env.state().phase, 'conflict'); assert.equal(env.state().dirty, true); assert.equal(env.state().backedUp, true); assert.equal(env.state().revision, 1);
  env.controller.edit(edited(samplePayload(), '000999')); await env.clock.advance(10000); await env.controller.retry(); await pump();
  assert.equal(env.api.records.get(71).recordName, 'Edición de otra pestaña'); assert.equal(env.api.records.get(71).revision, 2); assert.ok(env.api.writes().every(call => call.body.expectedRevision === 1)); env.controller.dispose();
});

test('POST confirmado con respuesta perdida recupera el mismo clientKey y aplica cambios posteriores', async () => {
  const env = autosaveEnvironment({ api: fakeRecordsApi([]) }); env.controller.import(samplePayload()); const first = edited(samplePayload(), '0001'); env.api.outcomes.push('drop-after-commit'); env.controller.edit(first); await env.clock.advance(1000);
  assert.equal(env.api.records.size, 1); assert.equal(env.state().dirty, true); const key = env.api.writes()[0].body.clientKey;
  const latest = edited(first, '000123'); env.controller.edit(latest); await env.controller.retry(); await pump(); await env.clock.advance(1000);
  const posts = env.api.writes().filter(call => call.method === 'POST'); assert.ok(posts.length >= 2); assert.ok(posts.every(call => call.body.clientKey === key)); assert.equal(env.api.records.size, 1); assert.equal([...env.api.records.values()][0].rows[25].cedula, '000123'); assert.equal(env.state().dirty, false); env.controller.dispose();
});

test('POST perdido + F5 conserva clientKey y el payload inicial idempotente', async () => {
  const env = autosaveEnvironment({ api: fakeRecordsApi([]) }); env.controller.import(samplePayload()); env.api.outcomes.push('drop-after-commit'); env.controller.edit(edited(samplePayload())); await env.clock.advance(1000);
  const initial = env.api.writes()[0].body; env.controller.dispose();
  const restored = autosaveEnvironment({ storage: env.storage, session: env.session, api: env.api, writerId: 'writer-qa-restored' }); await restored.controller.restore(); await restored.controller.retry(); await pump(); await restored.clock.advance(1000);
  assert.equal(restored.api.records.size, 1); const posts = restored.api.writes().filter(call => call.method === 'POST'); assert.ok(posts.length >= 2); assert.ok(posts.every(call => call.body.clientKey === initial.clientKey)); assert.deepEqual(posts[1].body.rows, initial.rows); restored.controller.dispose();
});

test('replay POST con contenido ajeno pausa sin sobreescribirlo', async () => {
  const env = autosaveEnvironment({ api: fakeRecordsApi([]) }); env.controller.import(samplePayload()); env.api.outcomes.push('drop-after-commit'); env.controller.edit(edited(samplePayload(), '0001')); await env.clock.advance(1000);
  const id = [...env.api.records.keys()][0]; const other = edited(samplePayload(), '777'); env.api.records.set(id, { ...sampleRecord(id, other), revision: 2 }); env.controller.edit(edited(samplePayload(), '00012')); await env.controller.retry(); await pump();
  assert.equal(env.state().phase, 'conflict'); assert.equal(env.state().dirty, true); assert.equal(env.api.writes().filter(call => call.method === 'PATCH').length, 0); assert.equal(env.api.records.get(id).rows[25].cedula, '777'); env.controller.dispose();
});

test('sin red y sin espacio local el estado no afirma respaldo ni guardado y conserva memoria', async () => {
  const storage = new MemoryStorage(); storage.failWrites = true; const env = autosaveEnvironment({ storage }); env.controller.open(sampleRecord()); env.api.outcomes.push('offline'); env.controller.edit(edited(samplePayload()));
  assert.equal(env.state().backedUp, false); assert.ok(env.state().backupError); await env.clock.advance(1000);
  assert.equal(env.state().dirty, true); assert.notEqual(env.state().phase, 'saved'); assert.ok(env.state().error); assert.equal(env.api.records.get(71).rows[25].cedula, '000123456789');
  storage.failWrites = false; await env.controller.retry(); await pump(); assert.equal(env.api.records.get(71).rows[25].cedula, '000987654321'); env.controller.dispose();
});

test('un borrador de un usuario/perfil no se restaura para otra identidad', async () => {
  const env = autosaveEnvironment({ owner: '8:7' }); env.controller.open(sampleRecord()); env.controller.edit(edited(samplePayload())); env.controller.dispose();
  for (const owner of ['9:7', '8:8', '8:usuario']) {
    const other = autosaveEnvironment({ owner, storage: env.storage, session: env.session, api: env.api, writerId: 'other-' + owner }); await other.controller.restore(); await other.clock.advance(2000); assert.equal(other.hydrated.length, 0); assert.equal(other.api.writes().length, 0); other.controller.dispose();
  }
});

test('remontar tras apagón recupera las 32 filas, nombre y ceros iniciales', async () => {
  const env = autosaveEnvironment(); env.controller.open(sampleRecord()); const latest = edited(samplePayload(), '000000001'); latest.recordName = 'Avance recuperado QA'; env.controller.edit(latest); env.controller.dispose();
  const restored = autosaveEnvironment({ storage: env.storage, session: env.session, api: env.api, writerId: 'writer-qa-restored' }); await restored.controller.restore();
  assert.equal(restored.hydrated.at(-1).recordId, 71); assert.deepEqual(restored.hydrated.at(-1).payload.rows, latest.rows); assert.equal(restored.hydrated.at(-1).payload.recordName, latest.recordName); assert.equal(restored.hydrated.at(-1).restored, true); restored.controller.dispose();
});

test('dos pestañas mantienen respaldos distintos y un ACK no elimina el borrador ajeno', async () => {
  const storage = new MemoryStorage(), api = fakeRecordsApi(); const a = autosaveEnvironment({ storage, api, writerId: 'tab-a' }), b = autosaveEnvironment({ storage, api, writerId: 'tab-b' });
  a.controller.open(sampleRecord()); b.controller.open(sampleRecord()); a.controller.edit(edited(samplePayload(), '000111')); b.controller.edit(edited(samplePayload(), '000222'));
  assert.ok([...storage.map.values()].some(value => value.includes('000111'))); assert.ok([...storage.map.values()].some(value => value.includes('000222')));
  await a.controller.flush(); assert.ok([...storage.map.values()].some(value => value.includes('000222'))); await b.controller.flush(); assert.equal(b.state().phase, 'conflict'); assert.equal(api.records.get(71).rows[25].cedula, '000111');
  a.controller.dispose(); b.controller.dispose(); const restored = autosaveEnvironment({ storage, session: b.session, api, writerId: 'tab-b-restored' }); await restored.controller.restore(); assert.equal(restored.hydrated.at(-1).payload.rows[25].cedula, '000222'); assert.equal(restored.state().phase, 'conflict'); restored.controller.dispose();
});

test('no permite cambiar de corte durante el envío y permite hacerlo después sin ACK tardío', async () => {
  const second = sampleRecord(72, { ...samplePayload(), recordName: 'Segundo corte QA' }); const env = autosaveEnvironment({ api: fakeRecordsApi([sampleRecord(), second]) }); env.controller.open(sampleRecord()); env.api.outcomes.push('hold'); env.controller.edit(edited(samplePayload())); await env.clock.advance(1000);
  assert.equal(env.controller.open(second), false); assert.equal(env.controller.discard(), false); assert.equal(env.state().recordId, 71); const hydrations = env.hydrated.length; env.api.release(); await pump(); await env.clock.advance(1000);
  assert.equal(env.hydrated.length, hydrations); assert.equal(env.controller.open(second), true); assert.equal(env.state().recordId, 72); assert.equal(env.api.records.get(72).recordName, 'Segundo corte QA'); env.controller.dispose();
});

test('fecha base de edad y valores originales no cambian al guardar y restaurar repetidamente', async () => {
  for (const ageReferenceDate of ['2026-10-28', null]) {
    const payload = { ...samplePayload(), ageReferenceDate }; const record = sampleRecord(71, payload); const env = autosaveEnvironment({ api: fakeRecordsApi([record]) }); env.controller.open(record); env.controller.edit(edited(payload)); await env.controller.flush();
    env.controller.edit(edited(payload, '000777')); env.controller.dispose(); const restored = autosaveEnvironment({ storage: env.storage, session: env.session, api: env.api, writerId: 'restored-' + ageReferenceDate }); await restored.controller.restore(); await restored.controller.flush();
    const result = env.api.records.get(71); assert.equal(result.ageReferenceDate, ageReferenceDate); assert.ok(result.rows.every(row => row.loanAgeDays === 50)); assert.deepEqual(result.rows.map(row => row.status), payload.rows.map(row => row.status)); restored.controller.dispose();
  }
});

test('timeout de POST conserva clientKey y el reintento no crea un segundo corte', async () => {
  const env = autosaveEnvironment({ api: fakeRecordsApi([]) }); env.controller.import(samplePayload()); env.api.outcomes.push('hold'); env.controller.edit(edited(samplePayload())); await env.clock.advance(1000);
  const key = env.api.writes()[0].body.clientKey; await env.clock.advance(20000); assert.equal(env.state().phase, 'offline'); assert.equal(env.state().dirty, true); assert.equal(env.api.records.size, 1);
  await env.clock.advance(2000); assert.equal(env.api.records.size, 1); assert.equal(env.api.writes()[1].body.clientKey, key); assert.equal(env.state().dirty, false); env.controller.dispose();
});

test('volver al snapshot inicial antes del debounce evita una escritura innecesaria', async () => {
  const env = autosaveEnvironment(); env.controller.open(sampleRecord()); env.controller.edit(edited(samplePayload())); await env.clock.advance(500); env.controller.edit(samplePayload()); await env.clock.advance(1000);
  assert.equal(env.api.writes().length, 0); assert.equal(env.state().dirty, false); env.controller.dispose();
});

test('descartar explícitamente el avance no lo resucita tras F5', async () => {
  const env = autosaveEnvironment(); env.controller.open(sampleRecord()); env.controller.edit(edited(samplePayload())); assert.equal(env.controller.discard(), true); env.controller.dispose();
  const restored = autosaveEnvironment({ storage: env.storage, session: env.session, api: env.api, writerId: 'after-discard' }); await restored.controller.restore();
  assert.equal(restored.hydrated.length, 0); assert.equal(restored.api.calls.length, 0); restored.controller.dispose();
});

test('descartar un borrador restaurado no deja otra copia que reaparezca al reiniciar', async () => {
  const original = autosaveEnvironment(); original.controller.import(samplePayload()); original.controller.edit(edited(samplePayload())); original.controller.dispose();
  const restored = autosaveEnvironment({ storage: original.storage, session: original.session, api: original.api, writerId: 'restored-to-discard' }); await restored.controller.restore(); assert.equal(restored.controller.discard(), true); restored.controller.dispose();
  const again = autosaveEnvironment({ storage: original.storage, session: original.session, api: original.api, writerId: 'after-restored-discard' }); await again.controller.restore();
  assert.equal(again.hydrated.length, 0); assert.equal(again.api.writes().length, 0); again.controller.dispose();
});

test('cuota al migrar respaldo nuevo a ID persistido no elimina el último texto ni su recuperación', async () => {
  const env = autosaveEnvironment({ api: fakeRecordsApi([]) }); env.controller.import(samplePayload()); env.api.outcomes.push('hold'); env.controller.edit(edited(samplePayload(), '000111')); await env.clock.advance(1000);
  const latest = edited(samplePayload(), '000999'); env.controller.edit(latest); assert.ok([...env.storage.map.values()].some(value => value.includes('000999')));
  env.storage.failWrites = true; env.api.outcomes.push('offline'); env.api.release(); await pump();
  assert.ok([...env.storage.map.values()].some(value => value.includes('000999')), 'No borrar respaldo anterior cuando no pudo escribirse el nuevo'); env.controller.dispose(); env.storage.failWrites = false;
  const restored = autosaveEnvironment({ storage: env.storage, session: env.session, api: env.api, writerId: 'quota-restored' }); await restored.controller.restore();
  assert.equal(restored.hydrated.at(-1).payload.rows[25].cedula, '000999'); await restored.controller.retry(); await pump(); assert.equal(env.api.records.size, 1); assert.equal([...env.api.records.values()][0].rows[25].cedula, '000999'); restored.controller.dispose();
});

for (const moreTyping of [false, true]) test(`PATCH con respuesta perdida se reconcilia sin conflicto falso${moreTyping ? ' y conserva lo escrito después' : ''}`, async () => {
  const env = autosaveEnvironment(); env.controller.open(sampleRecord()); env.api.outcomes.push('drop-after-commit'); const sent = edited(samplePayload(), '000111'); env.controller.edit(sent); await env.clock.advance(1000);
  assert.equal(env.api.records.get(71).revision, 2); assert.equal(env.state().dirty, true); if (moreTyping) env.controller.edit(edited(sent, '000999'));
  await env.controller.retry(); await pump(); await env.clock.advance(1000);
  assert.notEqual(env.state().phase, 'conflict'); assert.equal(env.state().dirty, false); assert.equal(env.api.records.get(71).rows[25].cedula, moreTyping ? '000999' : '000111');
  assert.ok(env.api.calls.some(call => call.method === 'GET'), 'Reconciliar respuesta perdida antes de repetir PATCH'); assert.equal(env.api.records.get(71).revision, moreTyping ? 3 : 2); env.controller.dispose();
});

test('PATCH perdido y F5 conservan el envío conocido para reconciliar cambios posteriores', async () => {
  const env = autosaveEnvironment(); env.controller.open(sampleRecord()); env.api.outcomes.push('drop-after-commit'); env.controller.edit(edited(samplePayload(), '000111')); await env.clock.advance(1000); env.controller.edit(edited(samplePayload(), '000999')); env.controller.dispose();
  const restored = autosaveEnvironment({ storage: env.storage, session: env.session, api: env.api, writerId: 'patch-lost-restored' }); await restored.controller.restore(); await restored.controller.retry(); await pump();
  assert.notEqual(restored.state().phase, 'conflict'); assert.equal(restored.state().dirty, false); assert.equal(env.api.records.get(71).rows[25].cedula, '000999'); assert.equal(env.api.records.get(71).revision, 3); restored.controller.dispose();
});

test('no promete un respaldo recuperable si falla el puntero y no hay sessionStorage', async () => {
  const storage = new MemoryStorage(); storage.setItem = (key, value) => { if (key.endsWith(':last')) throw Error('Pointer blocked QA'); storage.map.set(String(key), String(value)); };
  const env = autosaveEnvironment({ storage, session: null }); env.controller.import(samplePayload()); env.controller.edit(edited(samplePayload()));
  const backupClaimed = env.state().backedUp; if (!backupClaimed) assert.equal(env.state().backupError, true); env.controller.dispose();
  const restored = autosaveEnvironment({ storage, session: null, api: env.api, writerId: 'pointer-error-restored' }); await restored.controller.restore();
  if (backupClaimed) assert.equal(restored.hydrated.at(-1)?.payload.rows[25].cedula, '000987654321', 'Un respaldo declarado debe poder descubrirse tras reiniciar');
  restored.controller.dispose();
});

test('reconciliación usa la misma normalización de cédula que el servidor sin perder ceros', async () => {
  const env = autosaveEnvironment(); env.controller.open(sampleRecord()); env.api.outcomes.push('drop-after-commit'); env.controller.edit(edited(samplePayload(), ' 000111 ')); await env.clock.advance(1000);
  env.controller.edit(edited(samplePayload(), ' 000999 ')); await env.controller.retry(); await pump();
  assert.notEqual(env.state().phase, 'conflict'); assert.equal(env.state().dirty, false); assert.equal(env.api.records.get(71).rows[25].cedula, '000999'); env.controller.dispose();
});

test('F5 recupera el borrador de su pestaña aunque el puntero esté atrasado y otra pestaña edite', async () => {
  const storage = new MemoryStorage(), api = fakeRecordsApi([sampleRecord(), sampleRecord(72)]);
  const a = autosaveEnvironment({ storage, api, writerId: 'tab-a' }); a.controller.open(sampleRecord()); a.session.failWrites = true;
  storage.setItem = (key, value) => { if (key.endsWith(':last') && JSON.parse(value).writerId === 'tab-a') throw Error('Pointer blocked QA'); storage.map.set(String(key), String(value)); };
  a.controller.edit(edited(samplePayload(), '000111')); const b = autosaveEnvironment({ storage, api, writerId: 'tab-b' }); b.controller.open(sampleRecord(72)); b.controller.edit(edited(samplePayload(), '000222')); a.controller.dispose(); b.controller.dispose();
  a.session.failWrites = false; const restored = autosaveEnvironment({ storage, session: a.session, api, writerId: 'tab-a-restored' }); await restored.controller.restore();
  assert.equal(restored.hydrated.at(-1).recordId, 71); assert.equal(restored.hydrated.at(-1).payload.rows[25].cedula, '000111'); restored.controller.dispose();
});

test('reabrir sin sesión recupera el respaldo local aunque no se pudo crear el puntero global', async () => {
  const storage = new MemoryStorage(); storage.setItem = (key, value) => { if (key.endsWith(':last')) throw Error('Pointer blocked QA'); storage.map.set(String(key), String(value)); };
  const env = autosaveEnvironment({ storage, session: null }); env.controller.import(samplePayload()); env.controller.edit(edited(samplePayload(), '000888')); env.controller.dispose();
  const restored = autosaveEnvironment({ storage, session: new MemoryStorage(), api: env.api, writerId: 'browser-reopened' }); await restored.controller.restore();
  assert.equal(restored.hydrated.at(-1).payload.rows[25].cedula, '000888'); assert.equal(restored.hydrated.at(-1).restored, true); restored.controller.dispose();
});
