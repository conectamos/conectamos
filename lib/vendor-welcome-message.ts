import prisma from "@/lib/prisma";

const CONFIG_KEY = "vendor_welcome_message";

export type VendorWelcomeMessage = {
  body: string[];
  bodyBlocks: VendorWelcomeBlock[];
  buttonLabel: string;
  eyebrow: string;
  fontFamily: VendorWelcomeFontFamily;
  title: string;
  updatedBy?: string | null;
  version: string;
};

export type VendorWelcomeTextAlign = "left" | "center" | "right";
export type VendorWelcomeTextSize = "normal" | "large";
export type VendorWelcomeFontFamily = "system" | "serif";

export type VendorWelcomeBlock = {
  align: VendorWelcomeTextAlign;
  size: VendorWelcomeTextSize;
  text: string;
};

export type VendorWelcomeMessageInput = {
  body?: unknown;
  bodyBlocks?: unknown;
  buttonLabel?: unknown;
  eyebrow?: unknown;
  fontFamily?: unknown;
  title?: unknown;
};

const DEFAULT_BODY = [
  "En CONECTAMOS, creemos que la calidad del servicio comienza con una excelente actitud. Por eso, una de nuestras reglas principales es atender a cada cliente con respeto, amabilidad, disposici\u00f3n y compromiso.",
  "Este software ha sido dise\u00f1ado para facilitar tu trabajo, mejorar la comunicaci\u00f3n y brindar una experiencia m\u00e1s \u00e1gil, clara y eficiente. Te invitamos a usarlo con responsabilidad, entusiasmo y siempre con la mejor actitud de servicio.",
  "Recuerda: cada interacci\u00f3n es una oportunidad para conectar, ayudar y dejar una impresi\u00f3n positiva.",
  "\u00a1Gracias por ser parte de CONECTAMOS!",
];

const DEFAULT_MESSAGE = {
  body: DEFAULT_BODY,
  bodyBlocks: DEFAULT_BODY.map((text) => ({
    align: "left" as const,
    size: "normal" as const,
    text,
  })),
  buttonLabel: "Entendido",
  eyebrow: "CONECTAMOS",
  fontFamily: "system" as const,
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

function cleanAlign(value: unknown): VendorWelcomeTextAlign {
  return value === "center" || value === "right" ? value : "left";
}

function cleanSize(value: unknown): VendorWelcomeTextSize {
  return value === "large" ? "large" : "normal";
}

function cleanFontFamily(value: unknown): VendorWelcomeFontFamily {
  return value === "serif" ? "serif" : "system";
}

function cleanBodyBlocks(value: unknown, fallbackBody?: unknown) {
  if (Array.isArray(value)) {
    const blocks = value
      .map((item) => {
        const source: Record<string, unknown> =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : { text: item };
        const text = cleanText(source.text, "", 900);

        if (!text) {
          return null;
        }

        return {
          align: cleanAlign(source.align),
          size: cleanSize(source.size),
          text,
        };
      })
      .filter(Boolean)
      .slice(0, 8) as VendorWelcomeBlock[];

    if (blocks.length) {
      return blocks;
    }
  }

  return cleanBody(fallbackBody ?? value).map((text) => ({
    align: "left" as const,
    size: "normal" as const,
    text,
  }));
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
  const bodyBlocks = cleanBodyBlocks(source.bodyBlocks, source.body);

  return {
    body: bodyBlocks.map((block) => block.text),
    bodyBlocks,
    buttonLabel: cleanText(
      source.buttonLabel,
      DEFAULT_MESSAGE.buttonLabel,
      40
    ),
    eyebrow: cleanText(source.eyebrow, DEFAULT_MESSAGE.eyebrow, 40),
    fontFamily: cleanFontFamily(source.fontFamily),
    title: cleanText(source.title, DEFAULT_MESSAGE.title, 140),
    updatedBy: metadata?.updatedBy ?? null,
    version: updatedAt,
  };
}

export function normalizeVendorWelcomeMessageInput(
  input: VendorWelcomeMessageInput
) {
  const bodyBlocks = cleanBodyBlocks(input.bodyBlocks, input.body);

  return {
    body: bodyBlocks.map((block) => block.text),
    bodyBlocks,
    buttonLabel: cleanText(
      input.buttonLabel,
      DEFAULT_MESSAGE.buttonLabel,
      40
    ),
    eyebrow: cleanText(input.eyebrow, DEFAULT_MESSAGE.eyebrow, 40),
    fontFamily: cleanFontFamily(input.fontFamily),
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
