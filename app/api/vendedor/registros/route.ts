import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  esPerfilVendedor,
  esRolAdmin,
  puedeAccederPanelVendedor,
} from "@/lib/access-control";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import { buscarEquipoRegistroVentaPorImei } from "@/lib/vendor-sale-inventory";
import { obtenerCatalogoPersonalVenta } from "@/lib/ventas-personal";
import {
  DOMINIOS_CORREO_REGISTRO_TEXTO,
  normalizarCorreoRegistro,
  normalizarFechaIso,
  normalizarFinancierasDetalle,
  normalizarImei,
  normalizarMoneda,
  normalizarTextoCorto,
  normalizarTextoLargo,
  normalizarTipoEquipoRegistro,
  normalizarTipoDocumentoCliente,
  normalizarTipoPagoRegistroVenta,
  normalizarWhatsappRegistro,
} from "@/lib/vendor-sale-records";

const PUNTOS_VENTA_EXCLUIDOS = new Set(["VENTAS", "BODEGA PRINCIPAL"]);

const REGISTRO_RESUMEN_SELECT = {
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
  medioPago1Tipo: true,
  medioPago1Valor: true,
  medioPago2Tipo: true,
  medioPago2Valor: true,
  jaladorNombre: true,
  createdAt: true,
} as const;

const REGISTRO_DETALLE_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  ciudad: true,
  puntoVenta: true,
  clienteNombre: true,
  tipoDocumento: true,
  documentoNumero: true,
  plataformaCredito: true,
  financierasDetalle: true,
  aceptaDeclaracionIntermediacion: true,
  aceptaPoliticaGarantia: true,
  aceptaCondicionesCredito: true,
  dobleCredito: true,
  observacion: true,
  referenciaEquipo: true,
  almacenamiento: true,
  color: true,
  serialImei: true,
  tipoEquipo: true,
  creditoAutorizado: true,
  cuotaInicial: true,
  valorCuota: true,
  numeroCuotas: true,
  frecuenciaCuota: true,
  correo: true,
  whatsapp: true,
  fechaNacimiento: true,
  fechaExpedicion: true,
  direccion: true,
  barrio: true,
  referenciaFamiliar1Nombre: true,
  referenciaFamiliar1Telefono: true,
  referenciaFamiliar2Nombre: true,
  referenciaFamiliar2Telefono: true,
  telefono: true,
  simCardRegistro1: true,
  simCardRegistro2: true,
  medioPago1Tipo: true,
  medioPago1Valor: true,
  medioPago2Tipo: true,
  medioPago2Valor: true,
  asesorNombre: true,
  jaladorNombre: true,
  cerradorNombre: true,
  numeroFactura: true,
  estadoFacturacion: true,
  estadoVentaRegistro: true,
  firmaClienteDataUrl: true,
  fotoEntregaDataUrl: true,
  confirmacionCliente: true,
  perfilVendedor: {
    select: {
      nombre: true,
      tipo: true,
    },
  },
  sede: {
    select: {
      nombre: true,
    },
  },
} as const;

async function requireVendor() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (
    !puedeAccederPanelVendedor(session.perfilTipo, session.rolNombre) ||
    (!session.perfilId && !esRolAdmin(session.rolNombre))
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Solo un perfil vendedor o administrador puede usar este modulo" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, session };
}

function puedeGestionarRegistrosConsultados(session: {
  perfilTipo?: unknown;
  rolNombre?: unknown;
}) {
  return !esPerfilVendedor(session.perfilTipo) || esRolAdmin(session.rolNombre);
}

function construirScopeRegistros(session: {
  perfilId?: number | null;
  rolNombre?: string | null;
}) {
  if (session.perfilId) {
    return {
      perfilVendedorId: session.perfilId,
    };
  }

  if (esRolAdmin(session.rolNombre)) {
    return {};
  }

  return {
    perfilVendedorId: -1,
  };
}

function decimalToNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function esServicioContado(value: unknown) {
  const servicio = String(value || "").trim().toUpperCase();
  return (
    servicio === "CONTADO" ||
    servicio === "CONTADO CLARO" ||
    servicio === "CONTADO LIBRES"
  );
}

function normalizarServicioRegistro(
  servicio: unknown,
  plataformaCredito: unknown
) {
  const valor = String(servicio || "").trim().toUpperCase();

  if (esServicioContado(valor) || esServicioContado(plataformaCredito)) {
    return "CONTADO";
  }

  if (valor === "FINANCIERA" || valor === "FINANCIERO") {
    return "FINANCIERA";
  }

  return "FINANCIERA";
}

function monedaMayorQueCero(value: string | null) {
  return value !== null && Number(value) > 0;
}

function monedaNumero(value: string | null) {
  const numero = Number(value);
  return Number.isFinite(numero) ? numero : 0;
}

function monedasSumanIgual(a: string | null, b: string | null, total: string | null) {
  return monedaNumero(a) + monedaNumero(b) === monedaNumero(total);
}

function serializarFinancierasDetalle(valor: unknown) {
  if (!Array.isArray(valor)) {
    return null;
  }

  return valor
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;

      return {
        plataformaCredito: String(row.plataformaCredito || "").trim(),
        creditoAutorizado: decimalToNumber(row.creditoAutorizado),
        cuotaInicial: decimalToNumber(row.cuotaInicial),
        tipoPagoInicial: normalizarTextoCorto(row.tipoPagoInicial),
        valorCuota: decimalToNumber(row.valorCuota),
        numeroCuotas: decimalToNumber(row.numeroCuotas),
        frecuenciaCuota: normalizarTextoCorto(row.frecuenciaCuota),
      };
    })
    .filter(
      (
        item
      ): item is {
        plataformaCredito: string;
        creditoAutorizado: number | null;
        cuotaInicial: number | null;
        tipoPagoInicial: string | null;
        valorCuota: number | null;
        numeroCuotas: number | null;
        frecuenciaCuota: string | null;
      } => Boolean(item)
    );
}

function serializarRegistroResumen(
  registro: {
    creditoAutorizado: unknown;
    cuotaInicial: unknown;
    valorCuota: unknown;
    medioPago1Valor: unknown;
    medioPago2Valor: unknown;
    financierasDetalle: unknown;
  } & Record<string, unknown>
) {
  return {
    ...registro,
    creditoAutorizado: decimalToNumber(registro.creditoAutorizado),
    cuotaInicial: decimalToNumber(registro.cuotaInicial),
    valorCuota: decimalToNumber(registro.valorCuota),
    medioPago1Valor: decimalToNumber(registro.medioPago1Valor),
    medioPago2Valor: decimalToNumber(registro.medioPago2Valor),
    totalFinancieras: Array.isArray(registro.financierasDetalle)
      ? registro.financierasDetalle.length
      : 0,
  };
}

function serializarRegistroDetalle(
  registro: {
    creditoAutorizado: unknown;
    cuotaInicial: unknown;
    valorCuota: unknown;
    medioPago1Valor: unknown;
    medioPago2Valor: unknown;
    financierasDetalle: unknown;
    perfilVendedor?: { nombre: string; tipo: string } | null;
    sede?: { nombre: string } | null;
    fechaNacimiento?: Date | null;
    fechaExpedicion?: Date | null;
  } & Record<string, unknown>
) {
  return {
    ...registro,
    creditoAutorizado: decimalToNumber(registro.creditoAutorizado),
    cuotaInicial: decimalToNumber(registro.cuotaInicial),
    valorCuota: decimalToNumber(registro.valorCuota),
    medioPago1Valor: decimalToNumber(registro.medioPago1Valor),
    medioPago2Valor: decimalToNumber(registro.medioPago2Valor),
    financierasDetalle: serializarFinancierasDetalle(registro.financierasDetalle),
    fechaNacimiento: registro.fechaNacimiento
      ? registro.fechaNacimiento.toISOString()
      : null,
    fechaExpedicion: registro.fechaExpedicion
      ? registro.fechaExpedicion.toISOString()
      : null,
    perfilVendedorNombre: registro.perfilVendedor?.nombre ?? null,
    perfilVendedorTipo: registro.perfilVendedor?.tipo ?? null,
    sedeNombre: registro.sede?.nombre ?? null,
  };
}

function validarPayload(
  body: Record<string, unknown>,
  plataformasPermitidas: string[]
) {
  const servicio = normalizarServicioRegistro(
    body.servicio,
    body.plataformaCredito
  );
  const ciudad = normalizarTextoCorto(body.ciudad);
  const puntoVenta = normalizarTextoCorto(body.puntoVenta);
  const clienteNombre = normalizarTextoCorto(body.clienteNombre);
  const tipoDocumento = normalizarTipoDocumentoCliente(body.tipoDocumento);
  const documentoNumero = normalizarTextoCorto(body.documentoNumero);
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
  const tipoEquipo = normalizarTipoEquipoRegistro(body.tipoEquipo);
  const correoTexto = normalizarTextoCorto(body.correo);
  const correo = normalizarCorreoRegistro(body.correo);
  const whatsappTexto = String(body.whatsapp || "").replace(/\D/g, "").trim();
  const whatsapp = normalizarWhatsappRegistro(body.whatsapp);
  const fechaNacimiento = normalizarFechaIso(body.fechaNacimiento);
  const fechaExpedicion = normalizarFechaIso(body.fechaExpedicion);
  const direccion = normalizarTextoLargo(body.direccion);
  const barrio = normalizarTextoCorto(body.barrio);
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
  const esContado = servicio === "CONTADO";

  if (!ciudad) return { error: "La ciudad es obligatoria" };
  if (!puntoVenta) return { error: "Debes seleccionar el punto de venta" };
  if (PUNTOS_VENTA_EXCLUIDOS.has(puntoVenta.toUpperCase())) {
    return {
      error: "Ese punto de venta no esta disponible para registrar ventas",
    };
  }
  if (!clienteNombre) return { error: "El nombre del cliente es obligatorio" };
  if (!tipoDocumento) return { error: "Debes seleccionar el tipo de documento" };
  if (!documentoNumero) return { error: "El documento del cliente es obligatorio" };
  if (!serialImei) return { error: "El IMEI debe tener 15 digitos" };
  if (!observacion) return { error: "La observacion es obligatoria" };
  if (!correoTexto) return { error: "El correo es obligatorio" };
  if (!correo) {
    return {
      error: `El correo debe terminar en ${DOMINIOS_CORREO_REGISTRO_TEXTO}`,
    };
  }
  if (!whatsappTexto) return { error: "El WhatsApp es obligatorio" };
  if (!whatsapp) return { error: "El WhatsApp debe tener 10 digitos" };
  if (!direccion) return { error: "La direccion es obligatoria" };
  if (!simCardRegistro1) return { error: "El registro SIM 1 es obligatorio" };
  if (!asesorNombre) return { error: "El asesor es obligatorio" };
  if (!jaladorNombre) return { error: "Debes seleccionar el jalador" };
  if (!firmaClienteDataUrl) {
    return { error: "Debes capturar la firma digital del cliente" };
  }
  if (!fotoEntregaDataUrl) {
    return { error: "Debes adjuntar la foto de entrega del producto" };
  }

  if (esContado) {
    const medioPago1Tipo = normalizarTipoPagoRegistroVenta(body.medioPago1Tipo);
    const medioPago1Valor = normalizarMoneda(body.medioPago1Valor);
    const medioPago2Tipo = normalizarTipoPagoRegistroVenta(body.medioPago2Tipo);
    const medioPago2Valor = normalizarMoneda(body.medioPago2Valor);
    const intentoSegundoPago = Boolean(body.medioPago2Tipo) || Boolean(body.medioPago2Valor);

    if (!medioPago1Tipo) {
      return { error: "Selecciona el tipo del ingreso contado" };
    }

    if (!monedaMayorQueCero(medioPago1Valor)) {
      return { error: "Registra el valor del ingreso contado" };
    }

    if (intentoSegundoPago && !medioPago2Tipo) {
      return { error: "Selecciona el tipo del segundo ingreso contado" };
    }

    if (intentoSegundoPago && !monedaMayorQueCero(medioPago2Valor)) {
      return { error: "Registra el valor del segundo ingreso contado" };
    }

    return {
      data: {
        ciudad,
        puntoVenta,
        clienteNombre,
        tipoDocumento,
        documentoNumero,
        plataformaCredito: "CONTADO",
        financierasDetalle: [],
        aceptaDeclaracionIntermediacion: false,
        aceptaPoliticaGarantia: false,
        aceptaCondicionesCredito: false,
        dobleCredito: false,
        observacion,
        referenciaEquipo,
        almacenamiento,
        color,
        serialImei,
        tipoEquipo: null,
        creditoAutorizado: null,
        cuotaInicial: null,
        valorCuota: null,
        numeroCuotas: null,
        frecuenciaCuota: null,
        correo,
        whatsapp,
        fechaNacimiento: null,
        fechaExpedicion: null,
        direccion,
        barrio: null,
        referenciaFamiliar1Nombre: null,
        referenciaFamiliar1Telefono: null,
        referenciaFamiliar2Nombre: null,
        referenciaFamiliar2Telefono: null,
        telefono: null,
        simCardRegistro1,
        simCardRegistro2,
        medioPago1Tipo,
        medioPago1Valor,
        medioPago2Tipo: intentoSegundoPago ? medioPago2Tipo : null,
        medioPago2Valor: intentoSegundoPago ? medioPago2Valor : null,
        asesorNombre,
        jaladorNombre,
        firmaClienteDataUrl,
        fotoEntregaDataUrl,
        confirmacionCliente: true,
      },
    };
  }

  if (plataformasPermitidas.length === 0) {
    return {
      error: "No hay financieras creadas en el catalogo comercial",
    };
  }

  const financierasDetalleResult = normalizarFinancierasDetalle(
    body.financierasDetalle,
    plataformasPermitidas
  );

  if ("error" in financierasDetalleResult) {
    return { error: financierasDetalleResult.error };
  }
  if (financierasDetalleResult.data.length === 0) {
    return { error: "Debes registrar al menos una financiera" };
  }
  if (!tipoEquipo) {
    return { error: "Debes seleccionar un tipo de equipo valido" };
  }
  if (!referenciaEquipo) return { error: "La referencia del equipo es obligatoria" };
  if (!almacenamiento) return { error: "El almacenamiento es obligatorio" };
  if (!color) return { error: "El color es obligatorio" };
  if (!fechaNacimiento) return { error: "La fecha de nacimiento es obligatoria" };
  if (!fechaExpedicion) return { error: "La fecha de expedicion es obligatoria" };
  if (!barrio) return { error: "El barrio es obligatorio" };
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
  if (
    !aceptaDeclaracionIntermediacion ||
    !aceptaPoliticaGarantia ||
    !aceptaCondicionesCredito
  ) {
    return { error: "Debes confirmar los textos visibles del formato" };
  }

  const primeraFinanciera = financierasDetalleResult.data[0];
  const segundaFinanciera = financierasDetalleResult.data[1] ?? null;
  const divideInicial =
    Boolean(body.medioPago2Tipo) || Boolean(body.medioPago2Valor);
  const medioPago1ValorDividido = normalizarMoneda(body.medioPago1Valor);
  const medioPago2TipoDividido = normalizarTipoPagoRegistroVenta(body.medioPago2Tipo);
  const medioPago2ValorDividido = normalizarMoneda(body.medioPago2Valor);

  if (divideInicial) {
    if (!monedaMayorQueCero(medioPago1ValorDividido)) {
      return { error: "Registra el valor del primer ingreso de la inicial" };
    }

    if (!medioPago2TipoDividido) {
      return { error: "Selecciona el tipo del segundo ingreso de la inicial" };
    }

    if (!monedaMayorQueCero(medioPago2ValorDividido)) {
      return { error: "Registra el valor del segundo ingreso de la inicial" };
    }

    if (
      !monedasSumanIgual(
        medioPago1ValorDividido,
        medioPago2ValorDividido,
        primeraFinanciera.cuotaInicial
      )
    ) {
      return { error: "La suma de los ingresos debe ser igual a la inicial" };
    }

    if (monedaMayorQueCero(segundaFinanciera?.cuotaInicial ?? null)) {
      return {
        error:
          "Si divides la inicial en dos ingresos, la segunda financiera no puede tener inicial",
      };
    }
  }

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
      referenciaFamiliar1Nombre,
      referenciaFamiliar1Telefono,
      referenciaFamiliar2Nombre,
      referenciaFamiliar2Telefono,
      telefono,
      simCardRegistro1,
      simCardRegistro2,
      medioPago1Tipo: primeraFinanciera.tipoPagoInicial,
      medioPago1Valor: divideInicial
        ? medioPago1ValorDividido
        : primeraFinanciera.cuotaInicial,
      medioPago2Tipo: divideInicial
        ? medioPago2TipoDividido
        : segundaFinanciera?.tipoPagoInicial ?? null,
      medioPago2Valor: divideInicial
        ? medioPago2ValorDividido
        : segundaFinanciera?.cuotaInicial ?? null,
      asesorNombre,
      jaladorNombre,
      firmaClienteDataUrl,
      fotoEntregaDataUrl,
      confirmacionCliente: true,
    },
  };
}

async function validarEquipoExistenteParaRegistro(params: {
  serialImei: string;
  sedeId: number;
}) {
  const equipo = await buscarEquipoRegistroVentaPorImei(
    params.serialImei,
    params.sedeId
  );

  if (!equipo) {
    return {
      error: "El IMEI debe existir en una sede o en Bodega Principal",
    };
  }

  return { equipo };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireVendor();

    if (!access.ok) {
      return access.response;
    }

    await ensureVendorProfilesSchema();

    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id"));
    const buscar = normalizarTextoCorto(url.searchParams.get("buscar"));
    const scope = construirScopeRegistros(access.session);

    if ((Number.isInteger(id) && id > 0) || buscar) {
      if (!puedeGestionarRegistrosConsultados(access.session)) {
        return NextResponse.json(
          { error: "Solo supervisor o administrador pueden consultar registros guardados" },
          { status: 403 }
        );
      }
    }

    if (Number.isInteger(id) && id > 0) {
      const registro = await prisma.registroVendedorVenta.findFirst({
        where: {
          ...scope,
          id,
          eliminadoEn: null,
        },
        select: REGISTRO_DETALLE_SELECT,
      });

      if (!registro) {
        return NextResponse.json(
          { error: "Registro no encontrado" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        ok: true,
        registro: serializarRegistroDetalle(registro),
      });
    }

    if (buscar) {
      const digits = buscar.replace(/\D/g, "");

      if (!digits) {
        return NextResponse.json(
          { error: "Debes buscar por IMEI o cedula" },
          { status: 400 }
        );
      }

      const resultados = await prisma.registroVendedorVenta.findMany({
        where: {
          ...scope,
          eliminadoEn: null,
          OR: [
            {
              documentoNumero: {
                contains: digits,
              },
            },
            {
              serialImei: {
                contains: digits,
              },
            },
          ],
        },
        select: REGISTRO_DETALLE_SELECT,
        orderBy: {
          createdAt: "desc",
        },
        take: 12,
      });

      return NextResponse.json({
        ok: true,
        resultados: resultados.map(serializarRegistroDetalle),
      });
    }

    const registros = await prisma.registroVendedorVenta.findMany({
      where: {
        ...scope,
        eliminadoEn: null,
      },
      select: REGISTRO_RESUMEN_SELECT,
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
    });

    return NextResponse.json({
      ok: true,
      registros: registros.map(serializarRegistroResumen),
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

    if (!access.session.perfilId) {
      return NextResponse.json(
        {
          error:
            "Como administrador puedes consultar registros aqui, pero para crear uno nuevo debes entrar con un perfil vendedor o supervisor activo.",
        },
        { status: 400 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const catalogo = await obtenerCatalogoPersonalVenta();
    const payload = validarPayload(
      body,
      catalogo.financieras.map((item) => item.nombre)
    );

    if ("error" in payload) {
      return NextResponse.json({ error: payload.error }, { status: 400 });
    }

    const sedeRegistro = await prisma.sede.findFirst({
      where: {
        nombre: {
          equals: payload.data.puntoVenta,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        nombre: true,
      },
    });

    if (!sedeRegistro) {
      return NextResponse.json(
        { error: "Debes seleccionar un punto de venta valido" },
        { status: 400 }
      );
    }

    const equipoValidado = await validarEquipoExistenteParaRegistro({
      serialImei: payload.data.serialImei,
      sedeId: sedeRegistro.id,
    });

    if ("error" in equipoValidado) {
      return NextResponse.json({ error: equipoValidado.error }, { status: 400 });
    }

    await prisma.registroVendedorVenta.create({
      data: {
        perfilVendedorId: access.session.perfilId,
        sedeId: sedeRegistro.id,
        ...payload.data,
        puntoVenta: sedeRegistro.nombre,
        referenciaEquipo: equipoValidado.equipo.referencia,
        color: equipoValidado.equipo.color ?? payload.data.color ?? null,
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

export async function PATCH(req: Request) {
  try {
    const access = await requireVendor();

    if (!access.ok) {
      return access.response;
    }

    await ensureVendorProfilesSchema();

    const body = (await req.json()) as Record<string, unknown>;
    const id = Number(body.id);
    const modo = String(body.modo || "").trim().toUpperCase();

    if (!puedeGestionarRegistrosConsultados(access.session)) {
      return NextResponse.json(
        { error: "Solo supervisor o administrador pueden modificar o eliminar registros" },
        { status: 403 }
      );
    }

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Registro invalido" }, { status: 400 });
    }

    if (modo !== "EDITAR" && modo !== "ELIMINAR") {
      return NextResponse.json(
        { error: "Accion no soportada en este modulo" },
        { status: 400 }
      );
    }

    const existente = await prisma.registroVendedorVenta.findFirst({
      where: {
        ...construirScopeRegistros(access.session),
        id,
        eliminadoEn: null,
      },
      select: {
        id: true,
        asesorNombre: true,
        estadoVentaRegistro: true,
        ventaIdRelacionada: true,
      },
    });

    if (!existente) {
      return NextResponse.json(
        { error: "Registro no encontrado" },
        { status: 404 }
      );
    }

    if (
      existente.ventaIdRelacionada ||
      String(existente.estadoVentaRegistro || "").trim().toUpperCase() ===
        "CONVERTIDO_EN_VENTA"
    ) {
      return NextResponse.json(
        { error: "Este registro ya fue convertido en venta y no se puede modificar" },
        { status: 400 }
      );
    }

    if (modo === "ELIMINAR") {
      await prisma.registroVendedorVenta.update({
        where: { id },
        data: {
          eliminadoEn: new Date(),
          eliminadoPor:
            access.session.perfilNombre ??
            access.session.nombre ??
            "Usuario desconocido",
        },
      });

      return NextResponse.json({
        ok: true,
        mensaje: "Registro eliminado correctamente",
      });
    }

    const catalogo = await obtenerCatalogoPersonalVenta();
    const payload = validarPayload(
      body,
      catalogo.financieras.map((item) => item.nombre)
    );

    if ("error" in payload) {
      return NextResponse.json({ error: payload.error }, { status: 400 });
    }

    const sedeRegistro = await prisma.sede.findFirst({
      where: {
        nombre: {
          equals: payload.data.puntoVenta,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        nombre: true,
      },
    });

    if (!sedeRegistro) {
      return NextResponse.json(
        { error: "Debes seleccionar un punto de venta valido" },
        { status: 400 }
      );
    }

    const equipoValidado = await validarEquipoExistenteParaRegistro({
      serialImei: payload.data.serialImei,
      sedeId: sedeRegistro.id,
    });

    if ("error" in equipoValidado) {
      return NextResponse.json({ error: equipoValidado.error }, { status: 400 });
    }

    const actualizado = await prisma.registroVendedorVenta.update({
      where: { id },
      data: {
        sedeId: sedeRegistro.id,
        ...payload.data,
        puntoVenta: sedeRegistro.nombre,
        referenciaEquipo: equipoValidado.equipo.referencia,
        color: equipoValidado.equipo.color ?? payload.data.color ?? null,
        asesorNombre:
          payload.data.asesorNombre ??
          existente.asesorNombre ??
          access.session.perfilNombre ??
          access.session.nombre,
      },
      select: REGISTRO_DETALLE_SELECT,
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Registro actualizado correctamente",
      registro: serializarRegistroDetalle(actualizado),
    });
  } catch (error) {
    console.error("ERROR PATCH REGISTROS VENDEDOR:", error);
    return NextResponse.json(
      { error: "Error actualizando el registro del vendedor" },
      { status: 500 }
    );
  }
}
