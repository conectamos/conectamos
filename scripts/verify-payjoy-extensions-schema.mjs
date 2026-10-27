import pg from "pg";

const expectedColumns = {
  id: ["text", false], idempotencyKey: ["text", false], inputHash: ["text", false],
  usuarioId: ["integer", false], perfilId: ["integer", true], sedeId: ["integer", false],
  asesorNombre: ["text", false], registroId: ["integer", true],
  clienteDocumentoUltimos4: ["text", true], clienteIdPayjoy: ["text", true],
  deviceTag: ["text", true], imei: ["text", true], status: ["text", false],
  activeDeviceKey: ["text", true], providerRequestId: ["text", true],
  providerIdempotencyKey: ["text", false], currentValidThrough: ["timestamp without time zone", true],
  options: ["jsonb", false], selectedOption: ["jsonb", true], selectedReason: ["text", true],
  response: ["jsonb", true], errorCode: ["text", true],
  createdAt: ["timestamp without time zone", false], updatedAt: ["timestamp without time zone", false],
  expiresAt: ["timestamp without time zone", true], completedAt: ["timestamp without time zone", true],
};
const expectedIndexes = [
  [true, ["id"]], [true, ["idempotencyKey"]], [true, ["activeDeviceKey"]],
  [true, ["providerIdempotencyKey"]], [false, ["usuarioId", "perfilId", "sedeId", "createdAt"]],
  [false, ["deviceTag", "createdAt"]],
];

if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL para verificar el esquema PayJoy.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
try {
  await client.connect();
  const { rows: columns } = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'PayJoyExtensionOperation'
  `);
  for (const [name, [type, nullable]] of Object.entries(expectedColumns)) {
    const actual = columns.find((column) => column.column_name === name);
    if (!actual || actual.data_type !== type || (actual.is_nullable === "YES") !== nullable) {
      throw new Error(`Columna incompatible en PayJoyExtensionOperation: ${name}`);
    }
  }
  const { rows: indexes } = await client.query(`
    SELECT i.indisunique AS unique, array_agg(a.attname::text ORDER BY k.position) AS columns
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, position)
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE n.nspname = current_schema() AND t.relname = 'PayJoyExtensionOperation'
      AND i.indisvalid AND i.indisready AND i.indpred IS NULL
    GROUP BY i.indexrelid, i.indisunique
  `);
  for (const [unique, names] of expectedIndexes) {
    if (!indexes.some((index) => index.unique === unique && JSON.stringify(index.columns) === JSON.stringify(names))) {
      throw new Error(`Índice requerido ausente o incompatible: ${names.join(", ")}`);
    }
  }
  console.log(`PayJoy: esquema verificado (${Object.keys(expectedColumns).length} columnas y ${expectedIndexes.length} índices).`);
} catch (error) {
  // No imprimir cadenas de conexión ni respuestas que puedan incluir credenciales.
  console.error(error instanceof Error && /^(Columna incompatible|Índice requerido)/.test(error.message)
    ? error.message : "No fue posible verificar el esquema de extensiones PayJoy.");
  process.exitCode = 1;
} finally {
  await client.end();
}
