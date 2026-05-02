import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  esPerfilAdministrador,
  esPerfilFacturador,
  esPerfilVendedor,
  esRolAdmin,
  puedeAccederModulosOperativos,
  puedeAccederPanelFacturador,
} from "@/lib/access-control";
import { etiquetaSedeAcreedora } from "@/lib/prestamos";

type BandejaItem = {
  accion: string;
  categoria: "prestamos" | "pagos" | "devoluciones" | "ventas" | "facturacion";
  cliente?: string | null;
  detalle: string;
  estado: string;
  fecha: string;
  href: string;
  id: string;
  imei?: string | null;
  prioridad: "alta" | "media" | "normal";
  referencia?: string | null;
  sedeDestino?: string | null;
  sedeOrigen?: string | null;
  titulo: string;
  valor?: number | null;
};

function normalizar(valor: unknown) {
  return String(valor || "").trim().toUpperCase();
}

function esAccesoTotal(session: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!session) return false;

  return esPerfilAdministrador(session.perfilTipo) || esRolAdmin(session.rolNombre);
}

function estadoVentaAbierto(estadoVentaRegistro: unknown) {
  const estado = normalizar(estadoVentaRegistro);

  return estado !== "CONVERTIDO_EN_VENTA" && estado !== "CANCELADO";
}

function serializarFecha(valor: Date | null | undefined) {
  return (valor || new Date()).toISOString();
}

export async function GET() {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeAccederModulosOperativos(session.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no tiene acceso a aprobaciones" },
        { status: 403 }
      );
    }

    const accesoTotal = esAccesoTotal(session);
    const sedeId = Number(session.sedeId || 0);
    const perfilVendedor = esPerfilVendedor(session.perfilTipo);
    const perfilFacturador = esPerfilFacturador(session.perfilTipo);
    const puedeVerAprobacionesVenta = !perfilVendedor && !perfilFacturador;
    const puedeVerFacturacion = puedeAccederPanelFacturador(
      session.perfilTipo,
      session.rolNombre
    );

    const prestamos = await prisma.prestamoSede.findMany({
      where: {
        estado: {
          in: ["PENDIENTE", "PAGO_PENDIENTE_APROBACION", "DEVOLUCION_PENDIENTE"],
        },
        ...(accesoTotal
          ? {}
          : {
              OR: [{ sedeOrigenId: sedeId }, { sedeDestinoId: sedeId }],
            }),
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 120,
    });

    const sedeIds = Array.from(
      new Set(
        prestamos.flatMap((prestamo) => [
          prestamo.sedeOrigenId,
          prestamo.sedeDestinoId,
        ])
      )
    );
    const sedes =
      sedeIds.length > 0
        ? await prisma.sede.findMany({
            where: {
              id: { in: sedeIds },
            },
            select: {
              id: true,
              nombre: true,
            },
          })
        : [];
    const nombresSede = new Map(sedes.map((sede) => [sede.id, sede.nombre]));
    const sedeNombre = (id: number) =>
      etiquetaSedeAcreedora(id, nombresSede.get(id));

    const registrosVenta = puedeVerAprobacionesVenta
      ? await prisma.registroVendedorVenta.findMany({
          where: {
            eliminadoEn: null,
            ventaIdRelacionada: null,
            ...(accesoTotal
              ? {}
              : {
                  OR: [
                    { sedeId },
                    {
                      puntoVenta: {
                        equals: session.sedeNombre || "",
                        mode: "insensitive",
                      },
                    },
                  ],
                }),
          },
          select: {
            id: true,
            createdAt: true,
            puntoVenta: true,
            clienteNombre: true,
            referenciaEquipo: true,
            serialImei: true,
            asesorNombre: true,
            estadoFacturacion: true,
            estadoVentaRegistro: true,
            plataformaCredito: true,
            creditoAutorizado: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 100,
        })
      : [];

    const registrosFacturacion = puedeVerFacturacion
      ? await prisma.registroVendedorVenta.findMany({
          where: {
            eliminadoEn: null,
            estadoFacturacion: "PENDIENTE",
          },
          select: {
            id: true,
            createdAt: true,
            puntoVenta: true,
            clienteNombre: true,
            referenciaEquipo: true,
            serialImei: true,
            asesorNombre: true,
            estadoFacturacion: true,
            estadoVentaRegistro: true,
            plataformaCredito: true,
            creditoAutorizado: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 100,
        })
      : [];

    const itemsPrestamos: BandejaItem[] = prestamos.map((prestamo) => {
      const estado = normalizar(prestamo.estado);
      const origen = sedeNombre(prestamo.sedeOrigenId);
      const destino = sedeNombre(prestamo.sedeDestinoId);

      if (estado === "PAGO_PENDIENTE_APROBACION") {
        return {
          accion: accesoTotal || sedeId === prestamo.sedeOrigenId ? "Aprobar pago" : "Revisar pago",
          categoria: "pagos",
          detalle: `Pago solicitado por ${destino}. Debe aprobar ${origen}.`,
          estado: prestamo.estado,
          fecha: serializarFecha(prestamo.fechaSolicitudPago || prestamo.updatedAt),
          href: "/prestamos",
          id: `prestamo-pago-${prestamo.id}`,
          imei: prestamo.imei,
          prioridad: "alta",
          referencia: prestamo.referencia,
          sedeDestino: destino,
          sedeOrigen: origen,
          titulo: `Pago pendiente prestamo #${prestamo.id}`,
          valor: Number(prestamo.montoPago || prestamo.costo || 0),
        };
      }

      if (estado === "DEVOLUCION_PENDIENTE") {
        return {
          accion: accesoTotal || sedeId === prestamo.sedeOrigenId ? "Aprobar devolucion" : "Revisar devolucion",
          categoria: "devoluciones",
          detalle: `${destino} solicita devolver el equipo a ${origen}.`,
          estado: prestamo.estado,
          fecha: serializarFecha(prestamo.updatedAt),
          href: "/prestamos",
          id: `prestamo-devolucion-${prestamo.id}`,
          imei: prestamo.imei,
          prioridad: "media",
          referencia: prestamo.referencia,
          sedeDestino: destino,
          sedeOrigen: origen,
          titulo: `Devolucion pendiente #${prestamo.id}`,
          valor: Number(prestamo.costo || 0),
        };
      }

      return {
        accion: accesoTotal || sedeId === prestamo.sedeDestinoId ? "Aprobar o rechazar" : "Revisar solicitud",
        categoria: "prestamos",
        detalle: `${origen} envio solicitud hacia ${destino}.`,
        estado: prestamo.estado,
        fecha: serializarFecha(prestamo.createdAt),
        href: "/prestamos",
        id: `prestamo-${prestamo.id}`,
        imei: prestamo.imei,
        prioridad: "media",
        referencia: prestamo.referencia,
        sedeDestino: destino,
        sedeOrigen: origen,
        titulo: `Prestamo por aprobar #${prestamo.id}`,
        valor: Number(prestamo.costo || 0),
      };
    });

    const itemsVentas: BandejaItem[] = registrosVenta
      .filter((registro) => estadoVentaAbierto(registro.estadoVentaRegistro))
      .map((registro) => ({
        accion: "Completar venta",
        categoria: "ventas",
        cliente: registro.clienteNombre,
        detalle: `${registro.asesorNombre || "Asesor sin nombre"} registro venta desde ${registro.puntoVenta || "sede sin nombre"}.`,
        estado: String(registro.estadoVentaRegistro || "PENDIENTE"),
        fecha: serializarFecha(registro.createdAt),
        href: "/ventas/aprobaciones",
        id: `venta-registro-${registro.id}`,
        imei: registro.serialImei,
        prioridad: "media",
        referencia: registro.referenciaEquipo,
        sedeOrigen: registro.puntoVenta,
        titulo: `Venta por completar #${registro.id}`,
        valor: registro.creditoAutorizado ? Number(registro.creditoAutorizado) : null,
      }));

    const itemsFacturacion: BandejaItem[] = registrosFacturacion.map((registro) => ({
      accion: "Registrar factura",
      categoria: "facturacion",
      cliente: registro.clienteNombre,
      detalle: `${registro.puntoVenta || "Sede sin nombre"} tiene facturacion pendiente.`,
      estado: String(registro.estadoFacturacion || "PENDIENTE"),
      fecha: serializarFecha(registro.createdAt),
      href: esRolAdmin(session.rolNombre) ? "/dashboard/registros" : "/facturador/registros",
      id: `facturacion-${registro.id}`,
      imei: registro.serialImei,
      prioridad: "normal",
      referencia: registro.referenciaEquipo,
      sedeOrigen: registro.puntoVenta,
      titulo: `Facturacion pendiente #${registro.id}`,
      valor: registro.creditoAutorizado ? Number(registro.creditoAutorizado) : null,
    }));

    const items = [...itemsPrestamos, ...itemsVentas, ...itemsFacturacion].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );

    const resumen = {
      total: items.length,
      prestamos: items.filter((item) => item.categoria === "prestamos").length,
      pagos: items.filter((item) => item.categoria === "pagos").length,
      devoluciones: items.filter((item) => item.categoria === "devoluciones").length,
      ventas: items.filter((item) => item.categoria === "ventas").length,
      facturacion: items.filter((item) => item.categoria === "facturacion").length,
      alta: items.filter((item) => item.prioridad === "alta").length,
    };

    return NextResponse.json({
      ok: true,
      cobertura: accesoTotal ? "Todas las sedes" : session.sedeNombre,
      permisos: {
        facturacion: puedeVerFacturacion,
      },
      resumen,
      items,
    });
  } catch (error) {
    console.error("ERROR BANDEJA APROBACIONES:", error);
    return NextResponse.json(
      { error: "Error cargando la bandeja de aprobaciones" },
      { status: 500 }
    );
  }
}
