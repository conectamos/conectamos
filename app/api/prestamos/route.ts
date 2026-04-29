import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  esDeudaEntreSedes,
  esDeudaProveedor,
  esEstadoDeuda,
  NOMBRE_SEDE_BODEGA,
} from "@/lib/prestamos";
import { esSedeVentas } from "@/lib/sedes";

function parseSedeId(value: string | null) {
  const sedeId = Number(value);
  return Number.isInteger(sedeId) && sedeId > 0 ? sedeId : null;
}

function esPrestamoActivo(estado: string | null | undefined) {
  const normalizado = String(estado || "").trim().toUpperCase();
  return (
    normalizado === "APROBADO" ||
    normalizado === "PAGO_PENDIENTE_APROBACION" ||
    normalizado === "DEVOLUCION_PENDIENTE"
  );
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";
    const requestUrl = new URL(req.url);
    const sedeIdFiltro = parseSedeId(requestUrl.searchParams.get("sedeId"));
    const sedeBodegaPrincipal = await prisma.sede.findFirst({
      where: {
        nombre: {
          equals: NOMBRE_SEDE_BODEGA,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        nombre: true,
      },
    });
    const sedeBodegaId = sedeBodegaPrincipal?.id ?? -1;

    const where = esAdmin
      ? sedeIdFiltro
        ? {
            OR: [{ sedeOrigenId: sedeIdFiltro }, { sedeDestinoId: sedeIdFiltro }],
          }
        : {}
      : {
          OR: [{ sedeOrigenId: user.sedeId }, { sedeDestinoId: user.sedeId }],
        };

    const prestamosCrudos = await prisma.prestamoSede.findMany({
      where,
      orderBy: { id: "desc" },
    });

    const equiposRelacionados = Array.from(
      new Map(
        prestamosCrudos
          .flatMap((prestamo) => [
            {
              imei: prestamo.imei,
              sedeId: prestamo.sedeDestinoId,
            },
            {
              imei: prestamo.imei,
              sedeId: prestamo.sedeOrigenId,
            },
          ])
          .map((item) => [`${item.imei}:${item.sedeId}`, item])
      ).values()
    );

    const inventarioRelacionado =
      equiposRelacionados.length > 0
        ? await prisma.inventarioSede.findMany({
            where: {
              OR: equiposRelacionados,
            },
            select: {
              imei: true,
              sedeId: true,
              deboA: true,
              estadoFinanciero: true,
              estadoActual: true,
              origen: true,
              inventarioPrincipalId: true,
            },
          })
        : [];

    const inventarioPorSede = new Map(
      inventarioRelacionado.map((item) => [
        `${item.imei}:${item.sedeId}`,
        item,
      ])
    );

    const prestamosConContexto = prestamosCrudos.map((prestamo) => {
      const equipoDestino = inventarioPorSede.get(
        `${prestamo.imei}:${prestamo.sedeDestinoId}`
      );
      const equipoOrigen = inventarioPorSede.get(
        `${prestamo.imei}:${prestamo.sedeOrigenId}`
      );

      const destinoMarcadoComoPrincipal =
        String(equipoDestino?.origen || "").trim().toUpperCase() ===
        "PRINCIPAL";
      const destinoTieneDeudaDePrincipal =
        !!equipoDestino?.inventarioPrincipalId &&
        esEstadoDeuda(equipoDestino?.estadoFinanciero) &&
        esDeudaProveedor(equipoDestino?.deboA);
      const destinoVieneDePrincipal =
        destinoMarcadoComoPrincipal || destinoTieneDeudaDePrincipal;
      const origenTieneEquipoEnPrestamo =
        String(equipoOrigen?.estadoActual || "").trim().toUpperCase() ===
        "PRESTAMO";
      const origenEsProxyDePrincipal =
        origenTieneEquipoEnPrestamo &&
        String(equipoOrigen?.origen || "").trim().toUpperCase() ===
          "PRINCIPAL" &&
        esEstadoDeuda(equipoOrigen?.estadoFinanciero) &&
        esDeudaProveedor(equipoOrigen?.deboA);
      const origenRepresentaPrestamoEntreSedesReal =
        origenTieneEquipoEnPrestamo && !origenEsProxyDePrincipal;

      const prestamoDesdePrincipal =
        prestamo.sedeOrigenId === sedeBodegaId ||
        (destinoVieneDePrincipal && !origenRepresentaPrestamoEntreSedesReal);

      return {
        ...prestamo,
        equipoDestino,
        equipoOrigen,
        prestamoDesdePrincipal,
      };
    });

    const prestamos = prestamosConContexto.filter((prestamo) => {
      if (!esPrestamoActivo(prestamo.estado)) {
        return true;
      }

      if (!prestamo.prestamoDesdePrincipal) {
        return true;
      }

      const existePrestamoIntermedioActivo = prestamosConContexto.some((otro) => {
        if (otro.id === prestamo.id) {
          return false;
        }

        return (
          esPrestamoActivo(otro.estado) &&
          otro.imei === prestamo.imei &&
          otro.sedeDestinoId === prestamo.sedeDestinoId &&
          !otro.prestamoDesdePrincipal &&
          String(otro.equipoOrigen?.estadoActual || "").trim().toUpperCase() ===
            "PRESTAMO"
        );
      });

      return !existePrestamoIntermedioActivo;
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
              id: {
                in: sedeIds,
              },
            },
            select: {
              id: true,
              nombre: true,
            },
          })
        : [];

    const nombresSede = new Map(sedes.map((sede) => [sede.id, sede.nombre]));

    const resultado = prestamos.map((prestamo) => {
      const { equipoDestino, ...prestamoBase } = prestamo;
      const deudaActiva = esEstadoDeuda(equipoDestino?.estadoFinanciero);
      const requiereAprobacionEntreSedes =
        deudaActiva && esDeudaEntreSedes(equipoDestino?.deboA);

      return {
        ...prestamoBase,
        sedeOrigenNombre: prestamoBase.prestamoDesdePrincipal
          ? sedeBodegaPrincipal?.nombre || NOMBRE_SEDE_BODEGA
          : nombresSede.get(prestamoBase.sedeOrigenId) ||
            `SEDE ${prestamoBase.sedeOrigenId}`,
        sedeDestinoNombre:
          nombresSede.get(prestamoBase.sedeDestinoId) ||
          `SEDE ${prestamoBase.sedeDestinoId}`,
        deboAActual: equipoDestino?.deboA ?? null,
        estadoFinancieroActual: equipoDestino?.estadoFinanciero ?? null,
        estadoActualActual: equipoDestino?.estadoActual ?? null,
        requiereAprobacionEntreSedes,
      };
    });

    return NextResponse.json(resultado);
  } catch (error) {
    console.error("ERROR GET PRESTAMOS:", error);
    return NextResponse.json(
      { error: "Error cargando prestamos" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const data = await req.json();

    const imei = String(data.imei ?? "").replace(/\D/g, "").slice(0, 15);
    const referencia = String(data.referencia ?? "").trim();
    const color = String(data.color ?? "").trim();
    const costo = Number(data.costo ?? 0);
    const sedeOrigenId = Number(data.sedeOrigenId);
    const sedeDestinoId = Number(data.sedeDestinoId);

    if (!imei) {
      return NextResponse.json(
        { error: "El IMEI es obligatorio" },
        { status: 400 }
      );
    }

    if (!referencia) {
      return NextResponse.json(
        { error: "La referencia es obligatoria" },
        { status: 400 }
      );
    }

    if (!costo || costo <= 0) {
      return NextResponse.json(
        { error: "El costo debe ser mayor a 0" },
        { status: 400 }
      );
    }

    if (!sedeOrigenId || !sedeDestinoId) {
      return NextResponse.json(
        { error: "Debes seleccionar las sedes" },
        { status: 400 }
      );
    }

    if (sedeOrigenId === sedeDestinoId) {
      return NextResponse.json(
        { error: "La sede origen no puede ser igual a la sede destino" },
        { status: 400 }
      );
    }

    const esAdminPost = String(user.rolNombre || "").toUpperCase() === "ADMIN";

    if (!esAdminPost && user.sedeId !== sedeOrigenId) {
      return NextResponse.json(
        { error: "No puedes crear prestamos desde otra sede origen" },
        { status: 403 }
      );
    }

    const sedesPrestamo = await prisma.sede.findMany({
      where: {
        id: {
          in: [sedeOrigenId, sedeDestinoId],
        },
      },
      select: {
        id: true,
        nombre: true,
      },
    });

    const sedeOrigen = sedesPrestamo.find((sede) => sede.id === sedeOrigenId);
    const sedeDestino = sedesPrestamo.find((sede) => sede.id === sedeDestinoId);

    if (!sedeOrigen || !sedeDestino) {
      return NextResponse.json(
        { error: "Hay una sede invalida en el prestamo" },
        { status: 400 }
      );
    }

    if (esSedeVentas(sedeOrigen.nombre) || esSedeVentas(sedeDestino.nombre)) {
      return NextResponse.json(
        {
          error:
            "La sede VENTAS es informativa y no puede enviar ni recibir equipos de inventario",
        },
        { status: 400 }
      );
    }

    const inventarioOrigen = await prisma.inventarioSede.findFirst({
      where: {
        imei,
        sedeId: sedeOrigenId,
      },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        sedeId: true,
        estadoActual: true,
        estadoFinanciero: true,
        deboA: true,
        origen: true,
        inventarioPrincipalId: true,
      },
    });

    if (!inventarioOrigen) {
      return NextResponse.json(
        { error: "El IMEI no pertenece a la sede origen seleccionada" },
        { status: 404 }
      );
    }

    if (String(inventarioOrigen.estadoActual || "").toUpperCase() !== "BODEGA") {
      return NextResponse.json(
        {
          error: `Solo se pueden prestar equipos en BODEGA. Estado actual: ${inventarioOrigen.estadoActual}`,
        },
        { status: 400 }
      );
    }

    const existeEnDestino = await prisma.inventarioSede.findFirst({
      where: {
        imei,
        sedeId: sedeDestinoId,
      },
      select: { id: true },
    });

    if (existeEnDestino) {
      return NextResponse.json(
        { error: "Ese IMEI ya existe en la sede destino" },
        { status: 400 }
      );
    }

    const existe = await prisma.prestamoSede.findFirst({
      where: {
        imei,
        sedeOrigenId,
        estado: {
          in: ["PENDIENTE", "APROBADO", "PAGO_PENDIENTE_APROBACION"],
        },
      },
      select: { id: true },
    });

    if (existe) {
      return NextResponse.json(
        { error: "Ese IMEI ya tiene un prestamo activo desde la misma sede" },
        { status: 400 }
      );
    }

    const trasladaDeudaDePrincipal =
      String(inventarioOrigen.origen || "").toUpperCase() === "PRINCIPAL" &&
      esEstadoDeuda(inventarioOrigen.estadoFinanciero) &&
      esDeudaProveedor(inventarioOrigen.deboA);

    const nuevo = await prisma.$transaction(async (tx) => {
      const prestamo = await tx.prestamoSede.create({
        data: {
          imei: inventarioOrigen.imei,
          referencia: inventarioOrigen.referencia || referencia,
          color: inventarioOrigen.color || color || null,
          costo: inventarioOrigen.costo || costo,
          sedeOrigenId,
          sedeDestinoId,
          estado: "PENDIENTE",
        },
      });

      await tx.inventarioSede.update({
        where: { id: inventarioOrigen.id },
        data: {
          estadoAnterior: inventarioOrigen.estadoActual || null,
          estadoActual: "PRESTAMO",
          fechaMovimiento: new Date(),
          observacion: trasladaDeudaDePrincipal
            ? `Solicitud enviada a ${sedeDestino.nombre}. La deuda de principal solo se trasladara cuando la sede destino apruebe el prestamo.`
            : `Solicitud enviada a ${sedeDestino.nombre}. Pendiente por aprobacion en sede destino.`,
        },
      });

      await tx.movimientoInventario.create({
        data: {
          imei: inventarioOrigen.imei,
          tipoMovimiento: "PRESTAMO_ENTRE_SEDES",
          referencia: inventarioOrigen.referencia,
          color: inventarioOrigen.color || null,
          costo: inventarioOrigen.costo,
          sedeId: sedeOrigenId,
          deboA: inventarioOrigen.deboA,
          estadoFinanciero: inventarioOrigen.estadoFinanciero,
          origen: "PRESTAMO",
          observacion: trasladaDeudaDePrincipal
            ? `Solicitud de prestamo enviada desde ${sedeOrigen.nombre} hacia ${sedeDestino.nombre}. La deuda del proveedor se trasladara cuando el destino apruebe.`
            : `Solicitud de prestamo enviada desde ${sedeOrigen.nombre} hacia ${sedeDestino.nombre}. Pendiente por aprobacion.`,
        },
      });

      return prestamo;
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Solicitud de prestamo creada correctamente",
      prestamo: nuevo,
    });
  } catch (error) {
    console.error("ERROR POST PRESTAMOS:", error);
    return NextResponse.json(
      { error: "Error al guardar prestamo" },
      { status: 500 }
    );
  }
}
