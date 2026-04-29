import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { puedeAccederPanelFacturador } from "@/lib/access-control";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import { buscarEquipoRegistroVentaPorImei } from "@/lib/vendor-sale-inventory";
import { obtenerCatalogoPersonalVenta } from "@/lib/ventas-personal";
import {
  DOMINIOS_CORREO_REGISTRO_TEXTO,
  financieraRequiereInicial,
  normalizarCorreoRegistro,
  normalizarImei,
  normalizarMoneda,
  normalizarPlataformaCredito,
  normalizarTextoCorto,
  normalizarTextoLargo,
  normalizarWhatsappRegistro,
} from "@/lib/vendor-sale-records";

const ESTADOS_FACTURACION = [
  "PENDIENTE",
  "FACTURADO",
  "NOTA_CREDITO",
] as const;

async function requireFacturador() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!puedeAccederPanelFacturador(session.perfilTipo, session.rolNombre)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Solo el perfil facturador o administrador puede usar este modulo" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, session };
}

function serializarRegistro(
  registro: {
    creditoAutorizado: unknown;
    cuotaInicial: unknown;
  } & Record<string, unknown>
) {
  return {
    ...registro,
    creditoAutorizado: registro.creditoAutorizado
      ? Number(registro.creditoAutorizado)
      : null,
    cuotaInicial: registro.cuotaInicial ? Number(registro.cuotaInicial) : null,
  };
}

function normalizarEstadoFacturacion(valor: unknown) {
  const estado = String(valor || "").trim().toUpperCase();

  return ESTADOS_FACTURACION.includes(
    estado as (typeof ESTADOS_FACTURACION)[number]
  )
    ? estado
    : null;
}

function normalizarFinancierasEdicion(
  valor: unknown,
  plataformasPermitidas: string[]
) {
  if (!Array.isArray(valor) || valor.length === 0) {
    return { error: "Debes conservar al menos una financiera" as const };
  }

  if (plataformasPermitidas.length === 0) {
    return {
      error: "No hay financieras creadas en el catalogo comercial" as const,
    };
  }

  const financieras: Array<{
    plataformaCredito: string;
    creditoAutorizado: string;
    cuotaInicial: string | null;
  }> = [];

  for (let index = 0; index < valor.length; index += 1) {
    const item = valor[index];

    if (!item || typeof item !== "object") {
      continue;
    }

    const row = item as Record<string, unknown>;
    const plataformaCredito = normalizarPlataformaCredito(
      row.plataformaCredito,
      plataformasPermitidas
    );
    const creditoAutorizado = normalizarMoneda(row.creditoAutorizado);
    const cuotaInicial = normalizarMoneda(row.cuotaInicial);

    if (!plataformaCredito) {
      return { error: "Selecciona una financiera valida" as const };
    }

    if (!creditoAutorizado) {
      return { error: "Debes registrar el credito autorizado" as const };
    }

    const requiereInicial =
      financieraRequiereInicial(index) || cuotaInicial !== null;

    if (requiereInicial && cuotaInicial === null) {
      return { error: "Debes registrar la inicial" as const };
    }

    financieras.push({
      plataformaCredito,
      creditoAutorizado,
      cuotaInicial,
    });
  }

  if (financieras.length === 0) {
    return { error: "Debes conservar al menos una financiera" as const };
  }

  return {
    data: financieras,
  };
}

export async function GET() {
  try {
    const access = await requireFacturador();

    if (!access.ok) {
      return access.response;
    }

    await ensureVendorProfilesSchema();

    const registros = await prisma.registroVendedorVenta.findMany({
      where: {
        eliminadoEn: null,
      },
      select: {
        id: true,
        createdAt: true,
        puntoVenta: true,
        clienteNombre: true,
        tipoDocumento: true,
        documentoNumero: true,
        correo: true,
        whatsapp: true,
        direccion: true,
        barrio: true,
        plataformaCredito: true,
        creditoAutorizado: true,
        cuotaInicial: true,
        referenciaEquipo: true,
        serialImei: true,
        tipoEquipo: true,
        jaladorNombre: true,
        numeroFactura: true,
        estadoFacturacion: true,
        financierasDetalle: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      ok: true,
      registros: registros.map(serializarRegistro),
    });
  } catch (error) {
    console.error("ERROR GET REGISTROS FACTURADOR:", error);
    return NextResponse.json(
      { error: "Error cargando registros para facturacion" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const access = await requireFacturador();

    if (!access.ok) {
      return access.response;
    }

    await ensureVendorProfilesSchema();

    const body = (await req.json()) as Record<string, unknown>;
    const id = Number(body.id);
    const modo = String(body.modo ?? "").trim().toUpperCase();
    const numeroFactura =
      Object.prototype.hasOwnProperty.call(body, "numeroFactura")
        ? normalizarTextoCorto(body.numeroFactura)
        : undefined;

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Registro invalido" }, { status: 400 });
    }

    if (modo !== "EDITAR" && modo !== "ELIMINAR" && !numeroFactura) {
      return NextResponse.json(
        { error: "Debes ingresar el numero de factura" },
        { status: 400 }
      );
    }

    const existente = await prisma.registroVendedorVenta.findFirst({
      where: {
        id,
        eliminadoEn: null,
      },
      select: {
        id: true,
        sedeId: true,
        estadoVentaRegistro: true,
        ventaIdRelacionada: true,
        financierasDetalle: true,
      },
    });

    if (!existente) {
      return NextResponse.json(
        { error: "Registro no encontrado" },
        { status: 404 }
      );
    }

    if (modo === "ELIMINAR") {
      await prisma.registroVendedorVenta.update({
        where: { id },
        data: {
          eliminadoEn: new Date(),
          eliminadoPor: access.session.perfilNombre ?? access.session.nombre,
        },
      });

      return NextResponse.json({
        ok: true,
        mensaje: "Registro eliminado correctamente",
      });
    }

    if (modo === "EDITAR") {
      if (
        existente.ventaIdRelacionada ||
        String(existente.estadoVentaRegistro || "").trim().toUpperCase() ===
          "CONVERTIDO_EN_VENTA"
      ) {
        return NextResponse.json(
          {
            error:
              "Este registro ya fue convertido en venta y no se puede editar desde facturacion",
          },
          { status: 400 }
        );
      }

      const catalogo = await obtenerCatalogoPersonalVenta();
      const documentoNumero = normalizarTextoCorto(body.documentoNumero);
      const clienteNombre = normalizarTextoCorto(body.clienteNombre);
      const correoTexto = normalizarTextoCorto(body.correo);
      const correo = normalizarCorreoRegistro(body.correo);
      const whatsappTexto = String(body.whatsapp || "").replace(/\D/g, "").trim();
      const whatsapp = normalizarWhatsappRegistro(body.whatsapp);
      const direccion = normalizarTextoLargo(body.direccion);
      const barrio = normalizarTextoCorto(body.barrio);
      const referenciaEquipo = normalizarTextoCorto(body.referenciaEquipo);
      const serialImei = normalizarImei(body.serialImei);
      const estadoFacturacion = normalizarEstadoFacturacion(body.estadoFacturacion);
      const financierasDetalle = normalizarFinancierasEdicion(
        body.financierasDetalle,
        catalogo.financieras.map((item) => item.nombre)
      );

      if (!documentoNumero) {
        return NextResponse.json(
          { error: "Debes ingresar el numero de cedula" },
          { status: 400 }
        );
      }

      if (!clienteNombre) {
        return NextResponse.json(
          { error: "Debes ingresar el nombre completo" },
          { status: 400 }
        );
      }

      if (!correoTexto) {
        return NextResponse.json(
          { error: "Debes ingresar el correo electronico" },
          { status: 400 }
        );
      }

      if (!correo) {
        return NextResponse.json(
          {
            error: `El correo debe terminar en ${DOMINIOS_CORREO_REGISTRO_TEXTO}`,
          },
          { status: 400 }
        );
      }

      if (!whatsappTexto) {
        return NextResponse.json(
          { error: "Debes ingresar el WhatsApp" },
          { status: 400 }
        );
      }

      if (!whatsapp) {
        return NextResponse.json(
          { error: "El WhatsApp debe tener 10 digitos" },
          { status: 400 }
        );
      }

      if (!direccion) {
        return NextResponse.json(
          { error: "Debes ingresar la direccion" },
          { status: 400 }
        );
      }

      if (!barrio) {
        return NextResponse.json(
          { error: "Debes ingresar el barrio" },
          { status: 400 }
        );
      }

      if (!referenciaEquipo) {
        return NextResponse.json(
          { error: "Debes ingresar la referencia" },
          { status: 400 }
        );
      }

      if (!estadoFacturacion) {
        return NextResponse.json(
          { error: "Debes seleccionar un estado valido" },
          { status: 400 }
        );
      }

      if (
        (estadoFacturacion === "FACTURADO" ||
          estadoFacturacion === "NOTA_CREDITO") &&
        !numeroFactura
      ) {
        return NextResponse.json(
          { error: "Debes conservar el numero de factura para ese estado" },
          { status: 400 }
        );
      }

      if (!serialImei) {
        return NextResponse.json(
          { error: "El IMEI debe tener 15 digitos" },
          { status: 400 }
        );
      }

      if ("error" in financierasDetalle) {
        return NextResponse.json(
          { error: financierasDetalle.error },
          { status: 400 }
        );
      }

      const equipo = await buscarEquipoRegistroVentaPorImei(
        serialImei,
        existente.sedeId
      );

      if (!equipo) {
        return NextResponse.json(
          {
            error:
              "El IMEI debe existir en una sede o en Bodega Principal",
          },
          { status: 400 }
        );
      }

      const financierasPrevias = Array.isArray(existente.financierasDetalle)
        ? existente.financierasDetalle
        : [];
      const financierasActualizadas = financierasDetalle.data.map((item, index) => {
        const previa =
          typeof financierasPrevias[index] === "object" && financierasPrevias[index]
            ? (financierasPrevias[index] as Record<string, unknown>)
            : {};

        return {
          ...previa,
          plataformaCredito: item.plataformaCredito,
          creditoAutorizado: item.creditoAutorizado,
          cuotaInicial: item.cuotaInicial,
        };
      });
      const primeraFinanciera = financierasActualizadas[0];
      const segundaFinanciera = financierasActualizadas[1] ?? null;

      const actualizado = await prisma.registroVendedorVenta.update({
        where: { id },
        data: {
          documentoNumero,
          clienteNombre,
          correo,
          whatsapp,
          direccion,
          barrio,
          referenciaEquipo,
          serialImei,
          numeroFactura: numeroFactura ?? null,
          estadoFacturacion,
          financierasDetalle: financierasActualizadas,
          plataformaCredito: String(primeraFinanciera?.plataformaCredito ?? ""),
          creditoAutorizado: String(primeraFinanciera?.creditoAutorizado ?? "0"),
          cuotaInicial: String(primeraFinanciera?.cuotaInicial ?? "0"),
          medioPago1Valor: String(primeraFinanciera?.cuotaInicial ?? "0"),
          medioPago2Valor: segundaFinanciera?.cuotaInicial
            ? String(segundaFinanciera.cuotaInicial)
            : null,
        },
        select: {
          id: true,
          createdAt: true,
          puntoVenta: true,
          clienteNombre: true,
          tipoDocumento: true,
          documentoNumero: true,
          correo: true,
          whatsapp: true,
          direccion: true,
          barrio: true,
          plataformaCredito: true,
          creditoAutorizado: true,
          cuotaInicial: true,
          referenciaEquipo: true,
          serialImei: true,
          tipoEquipo: true,
          jaladorNombre: true,
          numeroFactura: true,
          estadoFacturacion: true,
          financierasDetalle: true,
        },
      });

      return NextResponse.json({
        ok: true,
        mensaje: "Registro actualizado correctamente",
        registro: serializarRegistro(actualizado),
      });
    }

    const actualizado = await prisma.registroVendedorVenta.update({
      where: { id },
      data: {
        numeroFactura,
        estadoFacturacion: "FACTURADO",
      },
      select: {
        id: true,
        createdAt: true,
        puntoVenta: true,
        clienteNombre: true,
        tipoDocumento: true,
        documentoNumero: true,
        correo: true,
        whatsapp: true,
        direccion: true,
        barrio: true,
        plataformaCredito: true,
        creditoAutorizado: true,
        cuotaInicial: true,
        referenciaEquipo: true,
        serialImei: true,
        tipoEquipo: true,
        jaladorNombre: true,
        numeroFactura: true,
        estadoFacturacion: true,
        financierasDetalle: true,
      },
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Numero de factura actualizado",
      registro: serializarRegistro(actualizado),
    });
  } catch (error) {
    console.error("ERROR PATCH REGISTROS FACTURADOR:", error);
    return NextResponse.json(
      { error: "Error actualizando numero de factura" },
      { status: 500 }
    );
  }
}
