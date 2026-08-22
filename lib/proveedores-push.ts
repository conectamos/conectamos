import "server-only";

import webpush from "web-push";
import {
  databaseDateToDateKey,
  diferenciaDiasFechaProveedor,
  formatoPesosProveedor,
  RUTA_PROVEEDORES,
  type TipoAvisoFacturaProveedor,
} from "@/lib/proveedores";

export type PushPayloadProveedor = {
  body: string;
  data: {
    facturaId: number;
    url: string;
  };
  icon: string;
  tag: string;
  title: string;
};

type PushSubscriptionLike = {
  auth: string;
  endpoint: string;
  p256dh: string;
};

type FacturaAvisoLike = {
  aliado: string;
  fechaVencimiento: Date | string;
  id: number;
  numeroFactura: string;
  valorPagar: { toString(): string } | number | string;
};

let configuredSignature = "";

function readPushConfiguration() {
  return {
    publicKey: String(process.env.WEB_PUSH_PUBLIC_KEY || "").trim(),
    privateKey: String(process.env.WEB_PUSH_PRIVATE_KEY || "").trim(),
    subject: String(process.env.WEB_PUSH_SUBJECT || "").trim(),
  };
}

export function obtenerClavePublicaPushProveedor() {
  return readPushConfiguration().publicKey || null;
}

export function pushProveedorConfigurado() {
  const config = readPushConfiguration();
  return Boolean(config.publicKey && config.privateKey && config.subject);
}

function ensureWebPushConfigured() {
  const config = readPushConfiguration();

  if (!config.publicKey || !config.privateKey || !config.subject) {
    throw new Error(
      "Faltan WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY o WEB_PUSH_SUBJECT"
    );
  }

  if (!/^(mailto:|https:\/\/)/i.test(config.subject)) {
    throw new Error(
      "WEB_PUSH_SUBJECT debe ser una URL https o un contacto mailto"
    );
  }

  const signature = [
    config.subject,
    config.publicKey,
    config.privateKey,
  ].join("::");

  if (configuredSignature !== signature) {
    webpush.setVapidDetails(
      config.subject,
      config.publicKey,
      config.privateKey
    );
    configuredSignature = signature;
  }
}

export async function enviarPushProveedor(
  subscription: PushSubscriptionLike,
  payload: PushPayloadProveedor
) {
  ensureWebPushConfigured();

  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        auth: subscription.auth,
        p256dh: subscription.p256dh,
      },
    },
    JSON.stringify(payload),
    {
      TTL: 86_400,
      urgency: "high",
    }
  );
}

export function crearPayloadAvisoFacturaProveedor(
  factura: FacturaAvisoLike,
  tipo: TipoAvisoFacturaProveedor,
  hoyKey: string
): PushPayloadProveedor {
  const fechaVencimiento =
    databaseDateToDateKey(factura.fechaVencimiento) || hoyKey;
  const dias = diferenciaDiasFechaProveedor(fechaVencimiento, hoyKey);
  const valor = formatoPesosProveedor(factura.valorPagar.toString());
  const detalleFactura = `${factura.aliado} · Factura ${factura.numeroFactura}`;

  if (tipo === "VENCIDA") {
    const diasVencida = Math.abs(dias);
    return {
      title: "Factura de proveedor vencida",
      body: `${detalleFactura} vencio hace ${diasVencida} ${diasVencida === 1 ? "dia" : "dias"}. Valor: ${valor}.`,
      icon: "/branding/conectamos-logo.png",
      tag: `factura-proveedor-${factura.id}`,
      data: {
        facturaId: factura.id,
        url: RUTA_PROVEEDORES,
      },
    };
  }

  if (tipo === "VENCE_HOY") {
    return {
      title: "Factura de proveedor vence hoy",
      body: `${detalleFactura} vence hoy. Valor: ${valor}.`,
      icon: "/branding/conectamos-logo.png",
      tag: `factura-proveedor-${factura.id}`,
      data: {
        facturaId: factura.id,
        url: RUTA_PROVEEDORES,
      },
    };
  }

  return {
    title: "Proximo vencimiento de proveedor",
    body: `${detalleFactura} vence en ${dias} ${dias === 1 ? "dia" : "dias"} (${fechaVencimiento}). Valor: ${valor}.`,
    icon: "/branding/conectamos-logo.png",
    tag: `factura-proveedor-${factura.id}`,
    data: {
      facturaId: factura.id,
      url: RUTA_PROVEEDORES,
    },
  };
}

export function statusCodeErrorPushProveedor(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return null;
  }

  const statusCode = Number(
    (error as { statusCode?: unknown }).statusCode
  );
  return Number.isInteger(statusCode) ? statusCode : null;
}

export function esSuscripcionPushExpirada(error: unknown) {
  const statusCode = statusCodeErrorPushProveedor(error);
  return statusCode === 404 || statusCode === 410;
}

export function resumirErrorPushProveedor(error: unknown) {
  const statusCode = statusCodeErrorPushProveedor(error);

  if (statusCode) {
    return `El servicio push respondio con estado ${statusCode}`;
  }

  return error instanceof Error
    ? error.message.slice(0, 300)
    : "No se pudo entregar la notificacion push";
}
