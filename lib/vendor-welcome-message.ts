import prisma from "@/lib/prisma";

const CONFIG_KEY = "vendor_welcome_message";

export type VendorWelcomeMessage = {
  body: string[];
  buttonLabel: string;
  eyebrow: string;
  title: string;
  updatedBy?: string | null;
  version: string;
};

export type VendorWelcomeMessageInput = {
  body?: unknown;
  buttonLabel?: unknown;
  eyebrow?: unknown;
  title?: unknown;
};

const DEFAULT_MESSAGE = {
  body: [
    "En CONECTAMOS, creemos que la calidad del servicio comienza con una excelente actitud. Por eso, una de nuestras reglas principales es atender a cada cliente con respeto, amabilidad, disposici\u00f3n y compromiso.",
    "Este software ha sido dise\u00f1ado para facilitar tu trabajo, mejorar la comunicaci\u00f3n y brindar una experiencia m\u00e1s \u00e1gil, clara y eficiente. Te invitamos a usarlo con responsabilidad, entusiasmo y siempre con la mejor actitud de servicio.",
    "Recuerda: cada interacci\u00f3n es una oportunidad para conectar, ayudar y dejar una impresi\u00f3n positiva.",
    "\u00a1Gracias por ser parte de CONECTAMOS!",
  ],
  buttonLabel: "Entendido",
  eyebrow: "CONECTAMOS",
  title: "\u00a1Bienvenido/a al software de CONECTAMOS!",
};

let schemaReady = false;

function cleanText(value: unknown, fallback: string, maxLength: number) {
  const text = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return (text || fallback).slice(0, maxLength);
}

function cleanBody(value: unknown) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? "").split(/\n\s*\n/g);

  const items = rawItems
    .map((item) => cleanText(item, "", 900))
    .filter(Boolean)
    .slice(0, 8);

  return items.length ? items : DEFAULT_MESSAGE.body;
}

function normalizeStoredMessage(
  value: unknown,
  metadata?: { updatedAt?: Date | string | null; updatedBy?: string | null }
): VendorWelcomeMessage {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const updatedAt = metadata?.updatedAt
    ? new Date(metadata.updatedAt).toISOString()
    : "default";

  return {
    body: cleanBody(source.body),
    buttonLabel: cleanText(
      source.buttonLabel,
      DEFAULT_MESSAGE.buttonLabel,
      40
    ),
    eyebrow: cleanText(source.eyebrow, DEFAULT_MESSAGE.eyebrow, 40),
    title: cleanText(source.title, DEFAULT_MESSAGE.title, 140),
    updatedBy: metadata?.updatedBy ?? null,
    version: updatedAt,
  };
}

export function normalizeVendorWelcomeMessageInput(
  input: VendorWelcomeMessageInput
) {
  return {
    body: cleanBody(input.body),
    buttonLabel: cleanText(
      input.buttonLabel,
      DEFAULT_MESSAGE.buttonLabel,
      40
    ),
    eyebrow: cleanText(input.eyebrow, DEFAULT_MESSAGE.eyebrow, 40),
    title: cleanText(input.title, DEFAULT_MESSAGE.title, 140),
  };
}

export async function ensureSystemConfigSchema() {
  if (schemaReady) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ConfiguracionSistema" (
      "clave" TEXT PRIMARY KEY,
      "valor" JSONB NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedBy" TEXT
    )
  `);

  schemaReady = true;
}

export async function getVendorWelcomeMessage() {
  await ensureSystemConfigSchema();

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      updatedAt: Date;
      updatedBy: string | null;
      valor: unknown;
    }>
  >(
    `
      SELECT "valor", "updatedAt", "updatedBy"
      FROM "ConfiguracionSistema"
      WHERE "clave" = $1
      LIMIT 1
    `,
    CONFIG_KEY
  );

  const row = rows[0];

  if (!row) {
    return normalizeStoredMessage(DEFAULT_MESSAGE);
  }

  return normalizeStoredMessage(row.valor, {
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  });
}

export async function saveVendorWelcomeMessage(
  input: VendorWelcomeMessageInput,
  updatedBy: string
) {
  await ensureSystemConfigSchema();

  const value = normalizeVendorWelcomeMessageInput(input);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "ConfiguracionSistema" ("clave", "valor", "updatedAt", "updatedBy")
      VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP, $3)
      ON CONFLICT ("clave") DO UPDATE SET
        "valor" = EXCLUDED."valor",
        "updatedAt" = CURRENT_TIMESTAMP,
        "updatedBy" = EXCLUDED."updatedBy"
    `,
    CONFIG_KEY,
    JSON.stringify(value),
    updatedBy
  );

  return getVendorWelcomeMessage();
}
