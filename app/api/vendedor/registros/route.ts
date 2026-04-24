import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { esPerfilVendedor } from "@/lib/access-control";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import { buscarEquipoRegistroVentaPorImei } from "@/lib/vendor-sale-inventory";
import {
  normalizarFechaIso,
  normalizarFinancierasDetalle,
  normalizarImei,
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
  const financierasDetalleResult = normalizarFinancierasDetalle(
    body.financierasDetalle
  );
  const aceptaDeclaracionIntermediacion = Boolean(
    body.aceptaDeclaracionIntermediacion
  );
  const aceptaPoliticaGarantia = Boolean(body.aceptaPoliticaGarantia);
  const aceptaCondicionesCredito = Boolean(body.aceptaCondicionesCredito);
  const observacion = normalizarTextoLargo(body.observacion);
  const referenciaEquipo = normalizarTextoCorto(body.referenciaEquipo);
  const almacenamiento = normalizarTextoCorto(body.almacenamiento);
  const color = normalizarTextoCorto(body.color);
  const serialImei = normalizarImei(body.serialImei);
  const tipoEquipo = normalizarTextoCorto(body.tipoEquipo);
  const correo = normalizarTextoCorto(body.correo);
  const whatsapp = normalizarTextoCorto(body.whatsapp);
  const fechaNacimiento = normalizarFechaIso(body.fechaNacimiento);
  const fechaExpedicion = normalizarFechaIso(body.fechaExpedicion);
  const direccion = normalizarTextoLargo(body.direccion);
  const barrio = normalizarTextoCorto(body.barrio);
  const referenciaContacto = normalizarTextoLargo(body.referenciaContacto);
  const referenciaFamiliar1Nombre = normalizarTextoCorto(
    body.referenciaFamiliar1Nombre
  );
  const referenciaFamiliar1Telefono = normalizarTextoCorto(
    body.referenciaFamiliar1Telefono
  );
  const referenciaFamiliar2Nombre = normalizarTextoCorto(
    body.referenciaFamiliar2Nombre
  );
  const referenciaFamiliar2Telefono = normalizarTextoCorto(
    body.referenciaFamiliar2Telefono
  );
  const telefono = normalizarTextoCorto(body.telefono);
  const simCardRegistro1 = normalizarTextoCorto(body.simCardRegistro1);
  const simCardRegistro2 = normalizarTextoCorto(body.simCardRegistro2);
  const asesorNombre = normalizarTextoCorto(body.asesorNombre);
  const jaladorNombre = normalizarTextoCorto(body.jaladorNombre);
  const firmaClienteDataUrl = normalizarTextoLargo(body.firmaClienteDataUrl);
  const fotoEntregaDataUrl = normalizarTextoLargo(body.fotoEntregaDataUrl);

  if (!ciudad) return { error: "La ciudad es obligatoria" };
  if (!puntoVenta) return { error: "Debes seleccionar el punto de venta" };
  if (!clienteNombre) return { error: "El nombre del cliente es obligatorio" };
  if (!tipoDocumento) return { error: "Debes seleccionar el tipo de documento" };
  if (!documentoNumero) return { error: "El documento del cliente es obligatorio" };
  if ("error" in financierasDetalleResult) {
    return { error: financierasDetalleResult.error };
  }
  if (!serialImei) return { error: "El IMEI debe tener 15 digitos" };
  if (!direccion) return { error: "La direccion es obligatoria" };
  if (!telefono) return { error: "El telefono es obligatorio" };
  if (!referenciaFamiliar1Nombre || !referenciaFamiliar1Telefono) {
    return {
      error:
        "Debes registrar la primera referencia familiar con nombre y telefono",
    };
  }
  if (!referenciaFamiliar2Nombre || !referenciaFamiliar2Telefono) {
    return {
      error:
        "Debes registrar la segunda referencia familiar con nombre y telefono",
    };
  }
  if (!jaladorNombre) return { error: "Debes seleccionar el jalador" };
  if (!aceptaDeclaracionIntermediacion || !aceptaPoliticaGarantia || !aceptaCondicionesCredito) {
    return { error: "Debes confirmar los textos visibles del formato" };
  }
  if (!firmaClienteDataUrl) {
    return { error: "Debes capturar la firma digital del cliente" };
  }
  if (!fotoEntregaDataUrl) {
    return { error: "Debes adjuntar la foto de entrega del producto" };
  }

  const primeraFinanciera = financierasDetalleResult.data[0];
  const segundaFinanciera = financierasDetalleResult.data[1] ?? null;

  return {
    data: {
      ciudad,
      puntoVenta,
      clienteNombre,
      tipoDocumento,
      documentoNumero,
      plataformaCredito: primeraFinanciera.plataformaCredito,
      financierasDetalle: financierasDetalleResult.data,
      aceptaDeclaracionIntermediacion,
      aceptaPoliticaGarantia,
      aceptaCondicionesCredito,
      dobleCredito: financierasDetalleResult.data.length > 1,
      observacion,
      referenciaEquipo,
      almacenamiento,
      color,
      serialImei,
      tipoEquipo,
      creditoAutorizado: primeraFinanciera.creditoAutorizado,
      cuotaInicial: primeraFinanciera.cuotaInicial,
      valorCuota: primeraFinanciera.valorCuota,
      numeroCuotas: primeraFinanciera.numeroCuotas,
      frecuenciaCuota: primeraFinanciera.frecuenciaCuota,
      correo,
      whatsapp,
      fechaNacimiento,
      fechaExpedicion,
      direccion,
      barrio,
      referenciaContacto,
      referenciaFamiliar1Nombre,
      referenciaFamiliar1Telefono,
      referenciaFamiliar2Nombre,
      referenciaFamiliar2Telefono,
      telefono,
      simCardRegistro1,
      simCardRegistro2,
      medioPago1Tipo: primeraFinanciera.tipoPagoInicial,
      medioPago1Valor: primeraFinanciera.cuotaInicial,
      medioPago2Tipo: segundaFinanciera?.tipoPagoInicial ?? null,
      medioPago2Valor: segundaFinanciera?.cuotaInicial ?? null,
      asesorNombre,
      jaladorNombre,
      firmaClienteDataUrl,
      fotoEntregaDataUrl,
      confirmacionCliente: true,
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
        puntoVenta: true,
        plataformaCredito: true,
        financierasDetalle: true,
        referenciaEquipo: true,
        serialImei: true,
        creditoAutorizado: true,
        cuotaInicial: true,
        valorCuota: true,
        numeroCuotas: true,
        jaladorNombre: true,
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
        totalFinancieras: Array.isArray(registro.financierasDetalle)
          ? registro.financierasDetalle.length
          : 0,
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

    const equipo = await buscarEquipoRegistroVentaPorImei(
      payload.data.serialImei,
      access.session.sedeId
    );

    if (!equipo) {
      return NextResponse.json(
        { error: "El IMEI debe existir en una sede o en bodega principal" },
        { status: 400 }
      );
    }

    await prisma.registroVendedorVenta.create({
      data: {
        perfilVendedorId: access.session.perfilId!,
        sedeId: access.session.sedeId,
        ...payload.data,
        puntoVenta: payload.data.puntoVenta,
        referenciaEquipo: equipo.referencia,
        color: equipo.color ?? payload.data.color ?? null,
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
