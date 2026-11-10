import pg from "pg";

const expectedTables = [
  {
    name: "PayJoyDaptaBatch",
    columns: {
      id: ["text", false], requestId: ["text", false], inputHash: ["text", false],
      usuarioId: ["integer", false], perfilId: ["integer", true], sedeId: ["integer", false],
      createdBy: ["text", false], status: ["text", false], agreement: ["text", false],
      messageTemplate: ["text", false], retryRequestIds: ["ARRAY", false, "_text"],
      createdAt: ["timestamp without time zone", false], updatedAt: ["timestamp without time zone", false],
    },
    indexes: [
      [true, ["id"]], [true, ["requestId"]], [false, ["createdAt"]],
      [false, ["usuarioId", "perfilId", "sedeId", "createdAt"]],
    ],
    checks: [
      "CHECK (status = 'DRAFT_ONLY')",
      "CHECK (agreement = '112090')",
    ],
  },
  {
    name: "PayJoyDaptaItem",
    columns: {
      id: ["text", false], batchId: ["text", false], deviceTag: ["text", false],
      lookupStatus: ["text", false], phone: ["text", true], phoneSource: ["text", true],
      ownershipStatus: ["text", false], consentStatus: ["text", false], reviewStatus: ["text", false],
      duplicateOfId: ["text", true], claimToken: ["text", true],
      claimExpiresAt: ["timestamp without time zone", true], attempts: ["integer", false],
      errorCode: ["text", true], checkedAt: ["timestamp without time zone", true],
      createdAt: ["timestamp without time zone", false], updatedAt: ["timestamp without time zone", false],
    },
    indexes: [
      [true, ["id"]], [true, ["batchId", "deviceTag"]],
      [false, ["batchId", "lookupStatus"]], [false, ["batchId", "phone"]],
    ],
    checks: [
      "CHECK (deviceTag ~ '^D[A-Z0-9]{5,31}$')",
      "CHECK (lookupStatus = ANY (ARRAY['PENDING', 'CHECKING', 'FOUND', 'MISSING', 'ERROR']))",
      "CHECK (phone IS NULL OR phone ~ '^573[0-9]{9}$')",
      "CHECK (phoneSource IS NULL OR phoneSource = 'PAYJOY_NEQUI_PREFILL')",
      "CHECK (ownershipStatus = 'PENDING_REVIEW')",
      "CHECK (consentStatus = 'PENDING_REVIEW')",
      "CHECK (reviewStatus = ANY (ARRAY['PENDING_REVIEW', 'DUPLICATE_PHONE']))",
      "CHECK (attempts >= 0)",
      "CHECK ((phone IS NULL) = (phoneSource IS NULL))",
    ],
  },
];

// pg_get_constraintdef adds identifier quoting, text casts and parentheses.
// Keep literal values/operators intact while ignoring that formatting.
function normalizeConstraint(value) {
  return value.replace(/::text\b/g, "").replace(/[\s"()]/g, "");
}

if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL para verificar los borradores PayJoy.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
try {
  await client.connect();
  for (const table of expectedTables) {
    const { rows: columns } = await client.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
    `, [table.name]);
    for (const [name, [type, nullable, udtName]] of Object.entries(table.columns)) {
      const actual = columns.find(column => column.column_name === name);
      if (!actual || actual.data_type !== type || (actual.is_nullable === "YES") !== nullable
        || (udtName && actual.udt_name !== udtName)) {
        throw new Error(`Columna incompatible en ${table.name}: ${name}`);
      }
    }
    const { rows: indexes } = await client.query(`
      SELECT i.indisunique AS unique, array_agg(a.attname::text ORDER BY k.position) AS columns
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, position)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = current_schema() AND t.relname = $1
        AND i.indisvalid AND i.indisready AND i.indpred IS NULL
      GROUP BY i.indexrelid, i.indisunique
    `, [table.name]);
    for (const [unique, names] of table.indexes) {
      if (!indexes.some(index => index.unique === unique && JSON.stringify(index.columns) === JSON.stringify(names))) {
        throw new Error(`Índice requerido ausente o incompatible en ${table.name}: ${names.join(", ")}`);
      }
    }
    const { rows: checks } = await client.query(`
      SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = current_schema() AND t.relname = $1
        AND c.contype = 'c' AND c.convalidated
    `, [table.name]);
    for (const definition of table.checks) {
      if (!checks.some(check => normalizeConstraint(check.definition) === normalizeConstraint(definition))) {
        throw new Error(`Restricción requerida ausente o incompatible en ${table.name}`);
      }
    }
    console.log(`PayJoy: ${table.name} verificada (${Object.keys(table.columns).length} columnas, ${table.indexes.length} índices y ${table.checks.length} restricciones).`);
  }
  const { rows: relations } = await client.query(`
    SELECT c.confdeltype AS on_delete,
      array_agg(a.attname::text ORDER BY k.position) AS columns,
      array_agg(ra.attname::text ORDER BY k.position) AS referenced_columns
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(attnum, refattnum, position)
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    JOIN pg_attribute ra ON ra.attrelid = rt.oid AND ra.attnum = k.refattnum
    WHERE n.nspname = current_schema() AND rn.nspname = current_schema()
      AND t.relname = 'PayJoyDaptaItem' AND rt.relname = 'PayJoyDaptaBatch'
      AND c.contype = 'f' AND c.convalidated
    GROUP BY c.oid, c.confdeltype
  `);
  if (!relations.some(relation => relation.on_delete === "c"
    && JSON.stringify(relation.columns) === JSON.stringify(["batchId"])
    && JSON.stringify(relation.referenced_columns) === JSON.stringify(["id"]))) {
    throw new Error("Relación requerida ausente o incompatible entre los borradores PayJoy.");
  }
  console.log("PayJoy: relación de dispositivos y borradores verificada.");
} catch (error) {
  // Never print connection strings, query parameters or database responses.
  console.error(error instanceof Error && /^(Columna incompatible|Índice requerido|Restricción requerida|Relación requerida)/.test(error.message)
    ? error.message : "No fue posible verificar el esquema de borradores PayJoy.");
  process.exitCode = 1;
} finally {
  await client.end();
}
