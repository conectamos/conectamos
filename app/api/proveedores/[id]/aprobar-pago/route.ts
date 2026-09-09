import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeGestionarProveedores } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import {
  calcularSaldoFacturaProveedor,
  decimalProveedorACentavos,
  ESTADO_FACTURA_PROVEEDOR,
  normalizarClaveIdempotenciaProveedor,
  normalizarTextoProveedor,
  parseValorPagarProveedor,
  serializarAbonoFacturaProveedor,
  serializarFacturaProveedor,
  validarAbonoFacturaProveedor,
} from "@/lib/proveedores";

export const runtime = "nodejs";

type BodyAbono = Record<string, unknown>;
const CLAVE_INTERNA_PATTERN = /^(?:LEGACY|LIQUIDACION)-FACTURA-/i;

function jsonNoStore(
  data: unknown,
  init?: ConstructorParameters<typeof NextResponse>[1],
) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function isRecord(value: unknown): value is BodyAbono {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUniqueConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;

  return (
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function normalizarCampoOpcional(
  value: unknown,
  maxLength: number,
  etiqueta: string,
) {
  const text = normalizarTextoProveedor(value);

  if (text.length > maxLength) {
    return {
      error: `${etiqueta} no puede superar ${maxLength} caracteres`,
      ok: false as const,
    };
  }

  return { ok: true as const, value: text || null };
}

function mismoTexto(left: string | null, right: string | null) {
  return (left || null) === (right || null);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  let claveIdempotencia = "";

  try {
    const session = await getSessionUser();

    if (!session) {
      return jsonNoStore({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeGestionarProveedores(session.perfilTipo, session.rolNombre)) {
      return jsonNoStore(
        { error: "No autorizado para aprobar pagos de proveedores" },
        { status: 403 },
      );
    }

    const { id: rawId } = await context.params;
    const id = Number(rawId);

    if (!Number.isInteger(id) || id <= 0) {
      return jsonNoStore(
        { error: "Factura de proveedor invalida" },
        { status: 400 },
      );
    }

    const rawBody = await req.text();
    const esSolicitudLegada = rawBody.length === 0;
    let body: BodyAbono = {};

    if (!esSolicitudLegada) {
      try {
        const parsed = JSON.parse(rawBody) as unknown;
        if (!isRecord(parsed)) throw new Error("INVALID_BODY");
        body = parsed;
      } catch {
        return jsonNoStore(
          { error: "El cuerpo de la solicitud no es JSON valido" },
          { status: 400 },
        );
      }
    }

    const rawValor = body.valorAbono ?? body.valor;
    const valorSolicitado = esSolicitudLegada
      ? null
      : parseValorPagarProveedor(rawValor);

    if (!esSolicitudLegada && !valorSolicitado) {
      return jsonNoStore(
        {
          codigo: "VALOR_INVALIDO",
          error: "El valor del abono debe ser mayor que cero",
        },
        { status: 400 },
      );
    }

    const referenciaResult = normalizarCampoOpcional(
      body.referencia,
      160,
      "La referencia",
    );
    if (!referenciaResult.ok) {
      return jsonNoStore({ error: referenciaResult.error }, { status: 400 });
    }

    const observacionResult = normalizarCampoOpcional(
      body.observacion,
      500,
      "La observacion",
    );
    if (!observacionResult.ok) {
      return jsonNoStore({ error: observacionResult.error }, { status: 400 });
    }

    const headerKey = String(req.headers.get("idempotency-key") || "").trim();
    const bodyKey = String(body.idempotencyKey || "").trim();

    if (headerKey && bodyKey && headerKey !== bodyKey) {
      return jsonNoStore(
        {
          codigo: "IDEMPOTENCIA_CONFLICTO",
          error: "La clave de idempotencia del encabezado y del cuerpo no coincide",
        },
        { status: 409 },
      );
    }

    const suppliedKey = headerKey || bodyKey;

    if (!esSolicitudLegada && !suppliedKey) {
      return jsonNoStore(
        {
          codigo: "IDEMPOTENCIA_REQUERIDA",
          error: "La clave de idempotencia es obligatoria para registrar un abono",
        },
        { status: 400 },
      );
    }

    const normalizedKey = suppliedKey
      ? normalizarClaveIdempotenciaProveedor(suppliedKey)
      : null;

    if (suppliedKey && !normalizedKey) {
      return jsonNoStore(
        {
          error:
            "La clave de idempotencia debe tener entre 8 y 160 caracteres validos",
        },
        { status: 400 },
      );
    }

    if (normalizedKey && CLAVE_INTERNA_PATTERN.test(normalizedKey)) {
      return jsonNoStore(
        {
          error: "La clave de idempotencia usa un prefijo reservado",
        },
        { status: 400 },
      );
    }

    claveIdempotencia =
      normalizedKey || `LIQUIDACION-FACTURA-${id}`;

    const actor =
      session.perfilNombre ||
      session.nombre ||
      session.usuario ||
      "Usuario";

    const resultado = await prisma.$transaction(async (tx) => {
      const bloqueo = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id"
        FROM "FacturaProveedor"
        WHERE "id" = ${id}
        FOR UPDATE
      `;

      if (bloqueo.length === 0) {
        return { tipo: "NO_ENCONTRADA" as const };
      }

      const factura = await tx.facturaProveedor.findUnique({
        where: { id },
        include: {
          abonos: {
            orderBy: [{ aprobadoEn: "desc" }, { id: "desc" }],
          },
        },
      });

      if (!factura) {
        return { tipo: "NO_ENCONTRADA" as const };
      }

      const abonoExistente = await tx.abonoFacturaProveedor.findUnique({
        where: { claveIdempotencia },
      });

      if (abonoExistente) {
        const mismoValor =
          valorSolicitado
            ? decimalProveedorACentavos(abonoExistente.valor) ===
              decimalProveedorACentavos(valorSolicitado)
            : Number(abonoExistente.saldoPosterior.toString()) === 0;
        const mismoPayload =
          abonoExistente.facturaId === id &&
          mismoValor &&
          mismoTexto(abonoExistente.referencia, referenciaResult.value) &&
          mismoTexto(abonoExistente.observacion, observacionResult.value);

        if (!mismoPayload) {
          return { tipo: "IDEMPOTENCIA_CONFLICTO" as const };
        }

        return {
          tipo: "REPETIDA" as const,
          abono: abonoExistente,
          factura,
        };
      }

      const saldo = calcularSaldoFacturaProveedor(
        factura.valorPagar,
        factura.abonos,
        factura.estado,
      );

      if (saldo.saldoPendienteCentavos <= 0) {
        return {
          tipo:
            esSolicitudLegada && !normalizedKey
              ? ("YA_PAGADA" as const)
              : ("SIN_SALDO" as const),
          factura,
        };
      }

      const valorAbono = valorSolicitado || saldo.saldoPendiente;
      const validacion = validarAbonoFacturaProveedor(
        valorAbono,
        saldo.saldoPendiente,
      );

      if (!validacion.ok) {
        return {
          tipo: validacion.codigo,
          error: validacion.error,
          factura,
        };
      }

      const aprobadoEn = new Date();
      const abono = await tx.abonoFacturaProveedor.create({
        data: {
          facturaId: id,
          valor: validacion.valor,
          saldoAnterior: validacion.saldoAnterior,
          saldoPosterior: validacion.saldoPosterior,
          aliadoSnapshot: factura.aliado,
          numeroFacturaSnapshot: factura.numeroFactura,
          valorFacturaSnapshot: saldo.valorFactura,
          claveIdempotencia,
          referencia: referenciaResult.value,
          observacion: observacionResult.value,
          aprobadoPorId: session.id,
          aprobadoPorNombre: actor,
          aprobadoEn,
        },
      });

      if (validacion.saldoPosteriorCentavos === 0) {
        await tx.facturaProveedor.update({
          where: { id },
          data: {
            estado: ESTADO_FACTURA_PROVEEDOR.PAGADO,
            pagoAprobadoEn: aprobadoEn,
            pagoAprobadoPorId: session.id,
            pagoAprobadoPorNombre: actor,
          },
        });
      }

      const actualizada = await tx.facturaProveedor.findUnique({
        where: { id },
        include: {
          abonos: {
            orderBy: [{ aprobadoEn: "desc" }, { id: "desc" }],
          },
        },
      });

      if (!actualizada) {
        return { tipo: "NO_ENCONTRADA" as const };
      }

      return {
        tipo:
          validacion.saldoPosteriorCentavos === 0
            ? ("LIQUIDADA" as const)
            : ("ABONADA" as const),
        abono,
        factura: actualizada,
      };
    });

    if (resultado.tipo === "NO_ENCONTRADA") {
      return jsonNoStore(
        { error: "Factura de proveedor no encontrada" },
        { status: 404 },
      );
    }

    if (resultado.tipo === "IDEMPOTENCIA_CONFLICTO") {
      return jsonNoStore(
        {
          codigo: resultado.tipo,
          error:
            "La clave de idempotencia ya fue usada con datos de pago diferentes",
        },
        { status: 409 },
      );
    }

    if (resultado.tipo === "VALOR_INVALIDO") {
      return jsonNoStore(
        {
          codigo: resultado.tipo,
          error: resultado.error,
          item: serializarFacturaProveedor(resultado.factura),
        },
        { status: 400 },
      );
    }

    if (resultado.tipo === "SOBREABONO" || resultado.tipo === "SIN_SALDO") {
      return jsonNoStore(
        {
          codigo: resultado.tipo,
          error:
            "error" in resultado
              ? resultado.error
              : "La factura ya no tiene saldo pendiente",
          item: serializarFacturaProveedor(resultado.factura),
        },
        { status: 409 },
      );
    }

    if (resultado.tipo === "YA_PAGADA") {
      return jsonNoStore({
        ok: true,
        mensaje: "El pago ya estaba aprobado",
        item: serializarFacturaProveedor(resultado.factura),
      });
    }

    if (!("abono" in resultado) || !resultado.abono) {
      return jsonNoStore(
        { error: "No se pudo recuperar el abono aprobado" },
        { status: 500 },
      );
    }

    const item = serializarFacturaProveedor(resultado.factura);
    const abono = serializarAbonoFacturaProveedor(resultado.abono);

    return jsonNoStore(
      {
        ok: true,
        repetido: resultado.tipo === "REPETIDA",
        mensaje:
          resultado.tipo === "REPETIDA"
            ? "El abono ya estaba aprobado"
            : resultado.tipo === "LIQUIDADA"
              ? "Pago aprobado y factura liquidada correctamente"
              : "Abono aprobado correctamente",
        item,
        abono,
        reciboUrl: abono.reciboUrl,
      },
      { status: resultado.tipo === "REPETIDA" ? 200 : 201 },
    );
  } catch (error) {
    if (isUniqueConflict(error) && claveIdempotencia) {
      return jsonNoStore(
        {
          codigo: "IDEMPOTENCIA_CONFLICTO",
          error:
            "La clave de idempotencia ya fue usada para registrar otro pago",
        },
        { status: 409 },
      );
    }

    console.error("ERROR APROBAR PAGO PROVEEDOR:", error);
    return jsonNoStore(
      { error: "Error interno al aprobar el pago" },
      { status: 500 },
    );
  }
}
