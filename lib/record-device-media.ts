export type RecordDeviceFallback = "apple" | "android" | "device";

export type RecordDeviceMediaInput = {
  reference?: string | null;
  productType?: string | null;
  operatingSystem?: string | null;
  imageSrc?: string | null;
  catalogReference?: string | null;
};

export function normalizeRecordReference(value?: string | null): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeDescription(value?: string | null): string {
  return normalizeRecordReference(value);
}

export function recordCatalogReferenceMatches(reference?: string | null, catalogReference?: string | null): boolean {
  const normalizedReference = normalizeRecordReference(reference);
  return Boolean(normalizedReference) && normalizedReference === normalizeRecordReference(catalogReference);
}

export function getRecordDeviceFallback({ reference, productType, operatingSystem }: RecordDeviceMediaInput): RecordDeviceFallback {
  const name = normalizeRecordReference(reference);
  if (name.startsWith("IPHONE")) return "apple";

  const type = normalizeDescription(productType);
  const isOtherProduct = /(?:ACCESORIO|TELEVIS|\bTV\b|ELECTRODOMEST|HOGAR|RELOJ|SMARTWATCH|COMPUTADOR|PORTATIL|CONSOLA|AUDIO|AUDIFONO|CARGADOR|PARLANTE)/.test(type);
  const isOtherReference = /(?:\bTV\b|TELEVISOR|SMART\s*TV|SMARTWATCH|GALAXY\s+(?:WATCH|BUDS)|\bWATCH\b|AUDIFONO|CARGADOR|PARLANTE)/.test(name);
  if (isOtherProduct || isOtherReference) return "device";

  const system = normalizeDescription(operatingSystem);
  if (/^ANDROID(?:\b|\d)/.test(system)) return "android";
  if (system && system !== "DESCONOCIDO" && system !== "NO APLICA") return "device";

  // Only recognizable phone references imply Android; TELEFONÍA alone does not.
  const androidPhone = /^(?:SAMSUNG|MOTOROLA|MOTO|XIAOMI|REDMI|POCO|INFINIX|TECNO|HONOR|OPPO|REALME|VIVO|ONE\s?PLUS|ZTE|GOOGLE\s+PIXEL)(?:\s|$)/.test(name);
  return androidPhone ? "android" : "device";
}

export function getRecordCatalogImageSource(value?: string | null): string | null {
  const source = value?.trim();
  if (!source || /[\u0000-\u001f\u007f\\]/.test(source)) return null;
  if (source.startsWith("/") && !source.startsWith("//")) return source;
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)(?:;[^,]*)?,/i.test(source)) return source;
  try {
    const url = new URL(source);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? source : null;
  } catch {
    return null;
  }
}

export function resolveRecordDeviceVisual(input: RecordDeviceMediaInput, imageFailed = false): {
  kind: "photo" | RecordDeviceFallback;
  imageSrc: string | null;
  fallback: RecordDeviceFallback;
} {
  const catalogMatches = input.catalogReference == null || recordCatalogReferenceMatches(input.reference, input.catalogReference);
  const fallback = getRecordDeviceFallback({ ...input, operatingSystem: catalogMatches ? input.operatingSystem : null });
  const imageSrc = catalogMatches ? getRecordCatalogImageSource(input.imageSrc) : null;
  return { kind: imageSrc && !imageFailed ? "photo" : fallback, imageSrc, fallback };
}
