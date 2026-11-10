import pg from "pg";

const timestamp = "timestamp with time zone";
const text = "text";
const expected = {
  PayJoyVoiceBatch: {
    columns: {
      id: text, requestId: text, scopeKey: text, inputHash: text, sourceBatchId: text, status: text,
      scheduledAt: timestamp, expiresAt: timestamp, timeZone: text, agentId: text, fromNumber: text,
      agreement: text, usuarioId: "integer", perfilId: "integer?", sedeId: "integer", createdBy: text,
      authorizedAt: timestamp, scriptVersion: text, createdAt: timestamp, updatedAt: timestamp,
    },
    unique: [["id"], ["requestId"], ["scopeKey"]],
    checks: ["PayJoyVoiceBatch_window_check", "PayJoyVoiceBatch_scope_check", "PayJoyVoiceBatch_status_check", "PayJoyVoiceBatch_agreement_check", "PayJoyVoiceBatch_timeZone_check"],
  },
  PayJoyVoiceCall: {
    columns: {
      id: text, batchId: text, sourceItemId: text, deviceTag: text, phone: text, dayKey: text, phoneSource: text, status: text,
      claimToken: "text?", claimExpiresAt: `${timestamp}?`, preflightAt: `${timestamp}?`, identityConfirmedAt: `${timestamp}?`,
      providerCallId: "text?", reasonCode: "text?", dispatchedAt: `${timestamp}?`, dispatchAuthorizedAt: `${timestamp}?`, acceptedAt: `${timestamp}?`,
      completedAt: `${timestamp}?`, latestOutcome: "text?", createdAt: timestamp, updatedAt: timestamp,
    },
    unique: [["id"], ["providerCallId"], ["batchId", "deviceTag"], ["dayKey", "phone"]],
    checks: ["PayJoyVoiceCall_phone_check", "PayJoyVoiceCall_dayKey_check", "PayJoyVoiceCall_phoneSource_check", "PayJoyVoiceCall_status_check"],
  },
  PayJoyVoiceEvent: {
    columns: { id: text, batchId: text, callId: "text?", eventKey: text, type: text, actorType: text, actorId: "text?", detail: "jsonb?", createdAt: timestamp },
    unique: [["id"], ["eventKey"]], checks: [],
  },
  PayJoyContactSuppression: {
    columns: { phone: text, reason: text, source: text, sourceCallId: "text?", createdBy: "text?", createdAt: timestamp },
    unique: [["phone"]], checks: ["PayJoyContactSuppression_phone_check"],
  },
};
if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL para verificar voz PayJoy.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
try {
  await client.connect();
  await client.query("SET TIME ZONE 'UTC'");
  for (const [table, spec] of Object.entries(expected)) {
    const { rows: cols } = await client.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1", [table]);
    for (const [name, format] of Object.entries(spec.columns)) {
      const col = cols.find(c => c.column_name === name);
      if (!col || col.data_type !== format.replace(/\?$/, "") || (col.is_nullable === "YES") !== format.endsWith("?")) throw new Error(`Esquema de voz incompatible: ${table}.${name}`);
    }
    const { rows: indexes } = await client.query(`
      SELECT array_agg(a.attname::text ORDER BY k.pos) AS columns FROM pg_index i
      JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(num,pos)
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num
      WHERE n.nspname=current_schema() AND t.relname=$1 AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL
      GROUP BY i.indexrelid`, [table]);
    if (spec.unique.some(names => !indexes.some(idx => JSON.stringify(idx.columns) === JSON.stringify(names)))) throw new Error(`Esquema de voz incompatible: índices de ${table}`);
    const { rows: checks } = await client.query(`SELECT c.conname,pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=current_schema() AND t.relname=$1 AND c.contype='c' AND c.convalidated`, [table]);
    if (spec.checks.some(name => !checks.some(c => c.conname === name))) throw new Error(`Esquema de voz incompatible: restricciones de ${table}`);
    if (table === "PayJoyVoiceBatch") {
      const window = checks.find(c => c.conname === "PayJoyVoiceBatch_window_check")?.definition || "";
      if (!window.includes("2026-11-10 15:00:00+00") || !window.includes("2026-11-10 15:30:00+00")) throw new Error("Esquema de voz incompatible: ventana temporal");
    }
    console.log(`PayJoy voz: ${table} verificada.`);
  }
  const { rows: foreignKeys } = await client.query(`SELECT t.relname AS source,rt.relname AS target,c.confdeltype
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_class rt ON rt.oid=c.confrelid WHERE n.nspname=current_schema() AND c.contype='f' AND c.convalidated
    AND t.relname IN ('PayJoyVoiceCall','PayJoyVoiceEvent')`);
  for (const [source, target] of [["PayJoyVoiceCall", "PayJoyVoiceBatch"], ["PayJoyVoiceEvent", "PayJoyVoiceBatch"], ["PayJoyVoiceEvent", "PayJoyVoiceCall"]]) {
    if (!foreignKeys.some(fk => fk.source === source && fk.target === target && fk.confdeltype === "r")) throw new Error("Esquema de voz incompatible: relaciones de auditoría");
  }
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith("Esquema de voz incompatible:") ? error.message : "No fue posible verificar el esquema de voz PayJoy.");
  process.exitCode = 1;
} finally { await client.end(); }
