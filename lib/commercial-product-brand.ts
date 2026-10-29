import { esElectrodomestico } from "@/lib/product-types";

const CATEGORIA_ELECTRODOMESTICOS = "ELECTRODOMÉSTICOS";
const CATEGORIA_FLECHAS = "FLECHAS";
const CATEGORIA_TABLETS = "TABLETS";
const CATEGORIA_PORTATILES = "PORTÁTILES";
const CATEGORIA_CONSOLAS = "CONSOLAS";
const BRAND_REFERENCE_ALIASES: Readonly<Record<string, string>> = {
  "16 PRO MAX DE EXHIBICION": "IPHONE",
  "COMPUTADOR HP 14": CATEGORIA_ELECTRODOMESTICOS,
  "LENOVO B15": CATEGORIA_PORTATILES,
  "MOTO G85 G5 256GB": "MOTOROLA",
  "NOTE 60 PRO": "INFINIX",
  "S26 ULTRA 512": "SAMSUNG",
  "SAMSING A37 DE 256": "SAMSUNG",
  "SAMSUG S26 ULTRA": "SAMSUNG",
  "SMART WATCH": CATEGORIA_CONSOLAS,
};
export const MARCAS_VENDIDAS = [
  "INFINIX",
  "TECNO",
  "MOTOROLA",
  "SAMSUNG",
  "XIAOMI",
  "OPPO",
  "HONOR",
  "IPHONE",
  "VIVO",
  "ZTE",
  "POCO",
  CATEGORIA_ELECTRODOMESTICOS,
  CATEGORIA_FLECHAS,
  CATEGORIA_TABLETS,
  CATEGORIA_PORTATILES,
  CATEGORIA_CONSOLAS,
];
export const OTRAS_MARCAS = "OTRAS MARCAS";

function normalizeReference(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function isApplianceReference(value: string | null | undefined) {
  const text = normalizeReference(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\b(?:ESTUFAS?|NEVERAS?|REFRIGERADOR(?:ES)?|CONGELADOR(?:ES)?|LAVADORAS?|SECADORAS?|FREIDORAS?|AIR\s*FRYER|LICUADORAS?|TELEVISOR(?:ES)?|TELEVISION|HORNOS?|MICROONDAS|LAVAVAJILLAS|ASPIRADORAS?|VENTILADOR(?:ES)?|CAFETERAS?|SANDUCHERAS?|ARROCERAS?)\b|\bTV(?=\d|\b)|\bAIRE\s+ACONDICIONADO\b|\bOLLA\s+(?:ELECTRICA|ARROCERA|MULTIFUNCIONAL|DE\s+PRESION)\b/.test(text);
}

function isTabletReference(value: string | null | undefined) {
  const text = normalizeReference(value);
  return /\b(?:TABLETS?|TABLETAS?)\b|\bIPAD(?:\b|(?:A|AIR|MINI|PRO)?\d)|\b(?:XIAOMI|REDMI)\s*PAD(?=\b|\d)|\b(?:SAMSUNG\s+(?:GALAXY\s+)?|GALAXY\s+)TAB(?:\b|[AS]\d)/.test(text);
}

function isPortableReference(value: string | null | undefined) {
  const text = normalizeReference(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(?:PORTATIL(?:ES)?|PORTARL|LAPTOPS?|MACBOOK)\b/.test(text);
}

function isConsoleReference(value: string | null | undefined) {
  const text = normalizeReference(value);
  return /\b(?:CONSOLAS?|PLAY\s*STATION\s*[345](?:\b|PRO\b|SLIM\b)|PS[345]\b|XBOX\b|NINTENDO\s+SWITCH\b)/.test(text);
}

export function resolveCommercialProductBrand(value: string | null | undefined, tipoProducto?: string | null) {
  const reference = normalizeReference(value);
  const plainReference = reference.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Product groups take precedence over phone brands so each sale counts once.
  // Recover tablets/flechas that were historically saved under a broad category.
  if (isTabletReference(reference) || isTabletReference(tipoProducto)) {
    return CATEGORIA_TABLETS;
  }
  if (/\bFLECHAS?\b/.test(reference) || /\bFLECHAS?\b/.test(normalizeReference(tipoProducto))) {
    return CATEGORIA_FLECHAS;
  }
  if (isPortableReference(reference) || isPortableReference(tipoProducto)) {
    return CATEGORIA_PORTATILES;
  }
  if (isConsoleReference(reference) || isConsoleReference(tipoProducto)) {
    return CATEGORIA_CONSOLAS;
  }
  // Explicit report aliases also repair broad legacy product types without
  // changing the original reference or inventory record.
  const referenceAlias = BRAND_REFERENCE_ALIASES[plainReference];
  if (referenceAlias) {
    return referenceAlias;
  }
  if (reference.split(/[^A-Z0-9]+/).some(word => /^POCO(?:[XFMC]\d[A-Z0-9]*)?$/.test(word))) {
    return "POCO";
  }
  if (reference.includes("REDMI")) {
    return "XIAOMI";
  }

  // For the remaining products, keep the saved appliance category. Clear legacy
  // labels also recover products whose historic type was the default TELEFONIA.
  if (esElectrodomestico(tipoProducto) || isApplianceReference(tipoProducto) || isApplianceReference(reference)) {
    return CATEGORIA_ELECTRODOMESTICOS;
  }

  if (!reference) {
    return OTRAS_MARCAS;
  }

  const words = reference.split(/[^A-Z0-9]+/).filter(Boolean);
  // Keep iPhone sales together, including APPLE IPHONE and compact model labels.
  if (words.some((word) => /^IPHONE(?:\d[A-Z0-9]*|X(?:R|S(?:MAX)?)?|SE(?:\d+)?)?$/.test(word))) {
    return "IPHONE";
  }
  if (words.some((word) => /^VIVO(?:[YVXTZSU]\d[A-Z0-9]*|NEX\d[A-Z0-9]*)$/.test(word))) {
    return "VIVO";
  }
  if (words.some((word) => /^ZTE(?:[AVL]\d[A-Z0-9]*|BLADE[A-Z]?\d[A-Z0-9]*)$/.test(word))) {
    return "ZTE";
  }
  return MARCAS_VENDIDAS.find((marca) => words.includes(marca)) || OTRAS_MARCAS;
}

