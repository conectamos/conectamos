import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { esPerfilVendedor } from "@/lib/access-control";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import {
  normalizarFechaIso,
  normalizarFrecuenciaCuota,
  normalizarMedioPago,
  normalizarMoneda,
  normalizarNumeroEntero,
  normalizarPlataformaCredito,
  normalizarTextoCorto,
  normalizarTextoLargo,
  normalizarTipoDocumentoCliente,
} from "@/lib/vendor-sale-records";

async function requireVendor() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!esPerfilVendedor(session.perfilTipo) || !session.perfilId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Solo el perfil vendedor puede usar este modulo" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, session };
}

function validarPayload(body: Record<string, unknown>) {
  const ciudad = normalizarTextoCorto(body.ciudad);
  const puntoVenta = normalizarTextoCorto(body.puntoVenta);
  const clienteNombre = normalizarTextoCorto(body.clienteNombre);
  const tipoDocumento = normalizarTipoDocumentoCliente(body.tipoDocumento);
  const documentoNumero = normalizarTextoCorto(body.documentoNumero);
  const plataformaCredito = normalizarPlataformaCredito(body.plataformaCredito);
  const aceptaDeclaracionIntermediacion = Boolean(
    body.aceptaDeclaracionIntermediacion
  );
  const aceptaPoliticaGarantia = Boolean(body.aceptaPoliticaGarantia);
  const aceptaCondicionesCredito = Boolean(body.aceptaCondicionesCredito);
  const dobleCredito = Boolean(body.dobleCredito);
  const observacion = normalizarTextoLargo(body.observacion);
  const referenciaEquipo = normalizarTextoCorto(body.referenciaEquipo);
  const almacenamiento = normalizarTextoCorto(body.almacenamiento);
  const color = normalizarTextoCorto(body.color);
  const serialImei = normalizarTextoCorto(body.serialImei);
  const tipoEquipo = normalizarTextoCorto(body.tipoEquipo);
  const creditoAutorizado = normalizarMoneda(body.creditoAutorizado);
  const cuotaInicial = normalizarMoneda(body.cuotaInicial);
  const valorCuota = normalizarMoneda(body.valorCuota);
  const numeroCuotas = normalizarNumeroEntero(body.numeroCuotas);
  const frecuenciaCuota = normalizarFrecuenciaCuota(body.frecuenciaCuota);
  const correo = normalizarTextoCorto(body.correo);
  const whatsapp = normalizarTextoCorto(body.whatsapp);
  const fechaNacimiento = normalizarFechaIso(body.fechaNacimiento);
  const fechaExpedicion = normalizarFechaIso(body.fechaExpedicion);
  const direccion = normalizarTextoLargo(body.direccion);
  const barrio = normalizarTextoCorto(body.barrio);
  const referenciaContacto = normalizarTextoLargo(body.referenciaContacto);
  const telefono = normalizarTextoCorto(body.telefono);
  const simCardRegistro1 = normalizarTextoCorto(body.simCardRegistro1);
  const simCardRegistro2 = normalizarTextoCorto(body.simCardRegistro2);
  const medioPago1Tipo = normalizarMedioPago(body.medioPago1Tipo);
  const medioPago1Valor = normalizarMoneda(body.medioPago1Valor);
  const medioPago2Tipo = normalizarMedioPago(body.medioPago2Tipo);
  const medioPago2Valor = normalizarMoneda(body.medioPago2Valor);
  const asesorNombre = normalizarTextoCorto(body.asesorNombre);
  const cerradorNombre = normalizarTextoCorto(body.cerradorNombre);
  const confirmacionCliente = Boolean(body.confirmacionCliente);

  if (!ciudad) return { error: "La ciudad es obligatoria" };
  if (!clienteNombre) return { error: "El nombre del cliente es obligatorio" };
  if (!tipoDocumento) return { error: "Debes seleccionar el tipo de documento" };
  if (!documentoNumero) return { error: "El documento del cliente es obligatorio" };
  if (!plataformaCredito)
    return { error: "Debes seleccionar la plataforma de credito" };
  if (!referenciaEquipo) return { error: "La referencia del equipo es obligatoria" };
  if (!serialImei) return { error: "El serial o IMEI es obligatorio" };
  if (!creditoAutorizado) return { error: "El credito autorizado es obligatorio" };
  if (!valorCuota) return { error: "El valor de la cuota es obligatorio" };
  if (!numeroCuotas) return { error: "El numero de cuotas es obligatorio" };
  if (!frecuenciaCuota) return { error: "Debes indicar la frecuencia de cuota" };
  if (!direccion) return { error: "La direccion es obligatoria" };
  if (!telefono) return { error: "El telefono es obligatorio" };
  if (!medioPago1Tipo || !medioPago1Valor)
    return { error: "Debes registrar el primer medio de pago" };
  if ((medioPago2Tipo && !medioPago2Valor) || (!medioPago2Tipo && medioPago2Valor))
    return {
      error:
        "Si registras un segundo pago debes completar el tipo y el valor",
    };
  if (!aceptaDeclaracionIntermediacion || !aceptaPoliticaGarantia || !aceptaCondicionesCredito)
    return { error: "Debes confirmar las politicas y condiciones del formato" };
  if (!confirmacionCliente)
    return { error: "Debes confirmar la validacion digital del cliente" };

  return {
    data: {
      ciudad,
      puntoVenta,
      clienteNombre,
      tipoDocumento,
      documentoNumero,
      plataformaCredito,
      aceptaDeclaracionIntermediacion,
      aceptaPoliticaGarantia,
      aceptaCondicionesCredito,
      dobleCredito,
      observacion,
      referenciaEquipo,
      almacenamiento,
      color,
      serialImei,
      tipoEquipo,
      creditoAutorizado,
      cuotaInicial,
      valorCuota,
      numeroCuotas,
      frecuenciaCuota,
      correo,
      whatsapp,
      fechaNacimiento,
      fechaExpedicion,
      direccion,
      barrio,
      referenciaContacto,
      telefono,
      simCardRegistro1,
      simCardRegistro2,
      medioPago1Tipo,
      medioPago1Valor,
      medioPago2Tipo,
      medioPago2Valor,
      asesorNombre,
      cerradorNombre,
      confirmacionCliente,
    },
  };
}

export async function GET() {
  try {
    const access = await requireVendor();

    if (!access.ok) {
      return access.response;
    }

    await ensureVendorProfilesSchema();

    const registros = await prisma.registroVendedorVenta.findMany({
      where: {
        perfilVendedorId: access.session.perfilId!,
        sedeId: access.session.sedeId,
      },
      select: {
        id: true,
        clienteNombre: true,
        plataformaCredito: true,
        referenciaEquipo: true,
        serialImei: true,
        creditoAutorizado: true,
        cuotaInicial: true,
        valorCuota: true,
        numeroCuotas: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
    });

    return NextResponse.json({
      ok: true,
      registros: registros.map((registro) => ({
        ...registro,
        creditoAutorizado: registro.creditoAutorizado
          ? Number(registro.creditoAutorizado)
          : null,
        cuotaInicial: registro.cuotaInicial ? Number(registro.cuotaInicial) : null,
        valorCuota: registro.valorCuota ? Number(registro.valorCuota) : null,
      })),
    });
  } catch (error) {
    console.error("ERROR GET REGISTROS VENDEDOR:", error);
    return NextResponse.json(
      { error: "Error cargando registros del vendedor" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireVendor();

    if (!access.ok) {
      return access.response;
    }

    await ensureVendorProfilesSchema();

    const body = (await req.json()) as Record<string, unknown>;
    const payload = validarPayload(body);

    if ("error" in payload) {
      return NextResponse.json({ error: payload.error }, { status: 400 });
    }

    await prisma.registroVendedorVenta.create({
      data: {
        perfilVendedorId: access.session.perfilId!,
        sedeId: access.session.sedeId,
        ...payload.data,
        puntoVenta: payload.data.puntoVenta ?? access.session.sedeNombre ?? null,
        asesorNombre:
          payload.data.asesorNombre ??
          access.session.perfilNombre ??
          access.session.nombre,
      },
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Registro guardado correctamente",
    });
  } catch (error) {
    console.error("ERROR POST REGISTROS VENDEDOR:", error);
    return NextResponse.json(
      { error: "Error guardando el registro del vendedor" },
      { status: 500 }
    );
  }
}
