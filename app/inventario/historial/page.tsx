import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

type SearchParams = Promise<{ imei?: string }>;
type TimelineTone =
  | "amber"
  | "emerald"
  | "rose"
  | "sky"
  | "slate"
  | "violet";

type TimelineMeta = {
  label: string;
  value: ReactNode;
};

type TimelineEvent = {
  categoria: string;
  detalle: string;
  fecha: Date;
  id: string;
  meta: TimelineMeta[];
  subtitulo?: string;
  tipo: string;
  titulo: string;
  tone: TimelineTone;
  valor?: number | null;
};

function formatoPesos(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "-";
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function formatoFecha(valor: Date | string | null | undefined) {
  if (!valor) return "-";

  const fecha = valor instanceof Date ? valor : new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(fecha);
}

function valorSeguro(valor: ReactNode | null | undefined) {
  if (valor === null || valor === undefined || valor === "") {
    return "-";
  }

  if (typeof valor === "string" && !valor.trim()) {
    return "-";
  }

  return valor;
}

function normalizarImei(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "").trim();
}

function badgeMovimiento(tipo: string) {
  const valor = String(tipo || "").toUpperCase();

  if (valor.includes("VENTA")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (valor.includes("PRESTAMO")) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (valor.includes("PAGO")) {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (valor.includes("ELIM")) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function badgeFinanciero(estado: string | null | undefined) {
  const valor = String(estado || "").toUpperCase();

  if (valor === "PAGO") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (valor === "DEUDA") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (valor === "CANCELADO") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-500";
}

function toneBadge(tone: TimelineTone) {
  const classes: Record<TimelineTone, string> = {
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  };

  return classes[tone];
}

function movementTone(tipo: string): TimelineTone {
  const valor = String(tipo || "").toUpperCase();

  if (valor.includes("VENTA")) return "emerald";
  if (valor.includes("PRESTAMO")) return "sky";
  if (valor.includes("PAGO")) return "violet";
  if (valor.includes("ELIM")) return "rose";
  if (valor.includes("INGRESO")) return "amber";

  return "slate";
}

function eventoTieneTexto(evento: TimelineEvent, texto: string) {
  const base = [
    evento.categoria,
    evento.titulo,
    evento.subtitulo,
    evento.detalle,
    evento.tipo,
    ...evento.meta.map((item) => `${item.label} ${String(item.value || "")}`),
  ]
    .join(" ")
    .toUpperCase();

  return base.includes(texto.toUpperCase());
}

function MetaGrid({ items }: { items: TimelineMeta[] }) {
  const visibles = items.filter((item) => item.value !== null && item.value !== undefined);

  if (visibles.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {visibles.map((item) => (
        <div
          key={`${item.label}-${String(item.value)}`}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            {item.label}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-950">
            {valorSeguro(item.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  valueClass = "text-slate-950",
}: {
  label: string;
  value: ReactNode;
  detail: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[28px] border border-[#e2d9ca] bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className={["mt-3 text-3xl font-black tracking-tight", valueClass].join(" ")}>
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function TimelineCard({ event, index }: { event: TimelineEvent; index: number }) {
  return (
    <article className="relative rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span
              className={[
                "inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em]",
                toneBadge(event.tone),
              ].join(" ")}
            >
              {event.categoria}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
              Paso {index + 1}
            </span>
          </div>

          <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            {event.titulo}
          </h3>
          {event.subtitulo ? (
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {event.subtitulo}
            </p>
          ) : null}
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {valorSeguro(event.detalle)}
          </p>
        </div>

        <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Fecha
          </p>
          <p className="mt-1 text-sm font-bold text-slate-950">
            {formatoFecha(event.fecha)}
          </p>
        </div>
      </div>

      <MetaGrid items={event.meta} />
    </article>
  );
}

export default async function HistorialInventarioPage(props: {
  searchParams: SearchParams;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const searchParams = await props.searchParams;
  const imei = normalizarImei(searchParams?.imei);
  const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";

  const movimientos = imei
    ? await prisma.movimientoInventario.findMany({
        where: { imei },
        orderBy: { id: "desc" },
      })
    : [];

  const inventarioPrincipal = imei
    ? await prisma.inventarioPrincipal.findUnique({
        where: { imei },
      })
    : null;

  const inventariosSede = imei
    ? await prisma.inventarioSede.findMany({
        where: { imei },
        include: {
          sede: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
        orderBy: { id: "desc" },
      })
    : [];

  const prestamos = imei
    ? await prisma.prestamoSede.findMany({
        where: { imei },
        orderBy: { id: "desc" },
      })
    : [];

  const ventas = imei
    ? await prisma.venta.findMany({
        where: { serial: imei },
        select: {
          id: true,
          idVenta: true,
          fecha: true,
          createdAt: true,
          servicio: true,
          serial: true,
          ingreso: true,
          utilidad: true,
          salida: true,
          cajaOficina: true,
          jalador: true,
          cerrador: true,
          sedeId: true,
          inventarioSedeId: true,
          sede: {
            select: {
              id: true,
              nombre: true,
            },
          },
          usuario: {
            select: {
              nombre: true,
            },
          },
        },
        orderBy: { id: "desc" },
      })
    : [];

  const registrosVenta = imei
    ? await prisma.registroVendedorVenta.findMany({
        where: { serialImei: imei },
        select: {
          id: true,
          clienteNombre: true,
          plataformaCredito: true,
          estadoFacturacion: true,
          estadoVentaRegistro: true,
          ventaIdRelacionada: true,
          asesorNombre: true,
          jaladorNombre: true,
          cerradorNombre: true,
          sedeId: true,
          createdAt: true,
          updatedAt: true,
          sede: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
        orderBy: { id: "desc" },
      })
    : [];

  const prestamoIds = prestamos.map((prestamo) => prestamo.id);

  const movimientosCajaSede = prestamoIds.length
    ? await prisma.movimientoCajaSede.findMany({
        where: {
          prestamoId: { in: prestamoIds },
        },
        include: {
          sede: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
        orderBy: { id: "desc" },
      })
    : [];

  const cajaMovimientos = imei
    ? await prisma.cajaMovimiento.findMany({
        where: {
          OR: [
            { concepto: { contains: imei } },
            { descripcion: { contains: imei } },
          ],
        },
        include: {
          sede: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
        orderBy: { id: "desc" },
      })
    : [];

  const sedeIds = new Set<number>();

  movimientos.forEach((item) => {
    if (item.sedeId) sedeIds.add(item.sedeId);
  });
  inventariosSede.forEach((item) => sedeIds.add(item.sedeId));
  prestamos.forEach((item) => {
    sedeIds.add(item.sedeOrigenId);
    sedeIds.add(item.sedeDestinoId);
  });
  if (inventarioPrincipal?.sedeDestinoId) sedeIds.add(inventarioPrincipal.sedeDestinoId);
  ventas.forEach((item) => sedeIds.add(item.sedeId));
  registrosVenta.forEach((item) => sedeIds.add(item.sedeId));
  cajaMovimientos.forEach((item) => sedeIds.add(item.sedeId));
  movimientosCajaSede.forEach((item) => sedeIds.add(item.sedeId));

  const sedes = sedeIds.size
    ? await prisma.sede.findMany({
        where: { id: { in: Array.from(sedeIds) } },
        select: { id: true, nombre: true },
      })
    : [];

  const sedesPorId = new Map(sedes.map((sede) => [sede.id, sede.nombre]));
  const sedeNombre = (id: number | null | undefined) =>
    id ? sedesPorId.get(id) || `SEDE ${id}` : "-";

  const registroSedeActual = inventariosSede[0] ?? null;
  const ubicacionActual =
    registroSedeActual?.sede?.nombre ||
    (inventarioPrincipal ? "Bodega Principal" : "Sin registro activo");
  const estadoActual =
    registroSedeActual?.estadoActual ||
    inventarioPrincipal?.estado ||
    "Sin registro";
  const estadoFinancieroActual =
    registroSedeActual?.estadoFinanciero ||
    inventarioPrincipal?.estadoCobro ||
    "-";
  const valorEquipo =
    Number(registroSedeActual?.costo || 0) ||
    Number(inventarioPrincipal?.costo || 0) ||
    0;

  const totalIngresoCaja = cajaMovimientos
    .filter((item) => String(item.tipo || "").toUpperCase() === "INGRESO")
    .reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const totalEgresoCaja = cajaMovimientos
    .filter((item) => String(item.tipo || "").toUpperCase() === "EGRESO")
    .reduce((acc, item) => acc + Number(item.valor || 0), 0);

  const timeline: TimelineEvent[] = [];

  if (inventarioPrincipal) {
    timeline.push({
      categoria: "Principal",
      detalle:
        inventarioPrincipal.observacion ||
        "Registro actual o historico del equipo en Bodega Principal.",
      fecha: inventarioPrincipal.createdAt,
      id: `principal-${inventarioPrincipal.id}`,
      meta: [
        { label: "Estado", value: inventarioPrincipal.estado || "BODEGA" },
        { label: "Cobro", value: inventarioPrincipal.estadoCobro || "-" },
        { label: "Destino", value: sedeNombre(inventarioPrincipal.sedeDestinoId) },
        { label: "Factura", value: inventarioPrincipal.numeroFactura || "-" },
        { label: "Distribuidor", value: inventarioPrincipal.distribuidor || "-" },
        { label: "Valor", value: formatoPesos(inventarioPrincipal.costo) },
      ],
      subtitulo: "Bodega Principal",
      tipo: "INVENTARIO_PRINCIPAL",
      titulo: "Registro en Bodega Principal",
      tone: "amber",
      valor: inventarioPrincipal.costo,
    });

    if (inventarioPrincipal.fechaEnvio) {
      timeline.push({
        categoria: "Principal",
        detalle:
          inventarioPrincipal.observacion ||
          "Salida registrada desde Bodega Principal hacia una sede.",
        fecha: inventarioPrincipal.fechaEnvio,
        id: `principal-envio-${inventarioPrincipal.id}`,
        meta: [
          { label: "Estado", value: inventarioPrincipal.estado || "-" },
          { label: "Cobro", value: inventarioPrincipal.estadoCobro || "-" },
          { label: "Destino", value: sedeNombre(inventarioPrincipal.sedeDestinoId) },
          { label: "Valor", value: formatoPesos(inventarioPrincipal.costo) },
        ],
        subtitulo: "Bodega Principal",
        tipo: "ENVIO_PRINCIPAL",
        titulo: "Envio desde Bodega Principal",
        tone: "sky",
        valor: inventarioPrincipal.costo,
      });
    }
  }

  inventariosSede.forEach((item) => {
    timeline.push({
      categoria: "Inventario sede",
      detalle: item.observacion || "Registro del equipo dentro de inventario de sede.",
      fecha: item.createdAt,
      id: `inventario-sede-${item.id}`,
      meta: [
        { label: "Sede", value: item.sede?.nombre || sedeNombre(item.sedeId) },
        { label: "Estado actual", value: item.estadoActual || "-" },
        { label: "Estado financiero", value: item.estadoFinanciero || "-" },
        { label: "Debe a", value: item.deboA || "-" },
        { label: "Origen", value: item.origen || "-" },
        { label: "Valor", value: formatoPesos(item.costo) },
      ],
      subtitulo: item.sede?.nombre || sedeNombre(item.sedeId),
      tipo: "INVENTARIO_SEDE",
      titulo: "Ingreso o presencia en sede",
      tone: "slate",
      valor: item.costo,
    });

    if (item.updatedAt.getTime() !== item.createdAt.getTime()) {
      timeline.push({
        categoria: "Inventario sede",
        detalle: item.observacion || "Actualizacion del estado operativo del equipo.",
        fecha: item.updatedAt,
        id: `inventario-sede-update-${item.id}`,
        meta: [
          { label: "Sede", value: item.sede?.nombre || sedeNombre(item.sedeId) },
          { label: "Estado actual", value: item.estadoActual || "-" },
          { label: "Anterior", value: item.estadoAnterior || "-" },
          { label: "Estado financiero", value: item.estadoFinanciero || "-" },
          { label: "Debe a", value: item.deboA || "-" },
        ],
        subtitulo: item.sede?.nombre || sedeNombre(item.sedeId),
        tipo: "ACTUALIZACION_INVENTARIO_SEDE",
        titulo: "Actualizacion de inventario sede",
        tone: movementTone(item.estadoActual || ""),
        valor: item.costo,
      });
    }
  });

  movimientos.forEach((item) => {
    timeline.push({
      categoria: "Movimiento",
      detalle: item.observacion || "Movimiento de inventario registrado.",
      fecha: item.createdAt,
      id: `movimiento-${item.id}`,
      meta: [
        { label: "Movimiento", value: item.tipoMovimiento },
        { label: "Sede", value: sedeNombre(item.sedeId) },
        { label: "Estado financiero", value: item.estadoFinanciero || "-" },
        { label: "Debe a", value: item.deboA || "-" },
        { label: "Origen", value: item.origen || "-" },
        { label: "Valor", value: item.costo ? formatoPesos(item.costo) : "-" },
      ],
      subtitulo: sedeNombre(item.sedeId),
      tipo: item.tipoMovimiento,
      titulo: item.tipoMovimiento,
      tone: movementTone(item.tipoMovimiento),
      valor: item.costo,
    });
  });

  prestamos.forEach((prestamo) => {
    timeline.push({
      categoria: "Prestamo",
      detalle: `Prestamo entre ${sedeNombre(prestamo.sedeOrigenId)} y ${sedeNombre(
        prestamo.sedeDestinoId
      )}.`,
      fecha: prestamo.createdAt,
      id: `prestamo-${prestamo.id}`,
      meta: [
        { label: "Prestamo", value: `#${prestamo.id}` },
        { label: "Origen", value: sedeNombre(prestamo.sedeOrigenId) },
        { label: "Destino", value: sedeNombre(prestamo.sedeDestinoId) },
        { label: "Estado", value: prestamo.estado },
        { label: "Valor", value: formatoPesos(prestamo.costo) },
      ],
      subtitulo: `${sedeNombre(prestamo.sedeOrigenId)} -> ${sedeNombre(
        prestamo.sedeDestinoId
      )}`,
      tipo: "PRESTAMO",
      titulo: `Prestamo #${prestamo.id}`,
      tone: "sky",
      valor: prestamo.costo,
    });

    if (prestamo.fechaSolicitudPago) {
      timeline.push({
        categoria: "Pago",
        detalle: `Solicitud de pago enviada por ${sedeNombre(prestamo.sedeDestinoId)}.`,
        fecha: prestamo.fechaSolicitudPago,
        id: `prestamo-solicitud-pago-${prestamo.id}`,
        meta: [
          { label: "Prestamo", value: `#${prestamo.id}` },
          { label: "Origen", value: sedeNombre(prestamo.sedeOrigenId) },
          { label: "Destino", value: sedeNombre(prestamo.sedeDestinoId) },
          { label: "Monto", value: formatoPesos(prestamo.montoPago) },
          { label: "Estado", value: prestamo.estado },
        ],
        subtitulo: "Pago pendiente de aprobacion",
        tipo: "SOLICITUD_PAGO",
        titulo: "Solicitud de pago",
        tone: "violet",
        valor: prestamo.montoPago,
      });
    }

    if (prestamo.fechaAprobacionPago) {
      timeline.push({
        categoria: "Pago",
        detalle: `Pago aprobado por ${sedeNombre(prestamo.sedeOrigenId)}.`,
        fecha: prestamo.fechaAprobacionPago,
        id: `prestamo-aprobacion-pago-${prestamo.id}`,
        meta: [
          { label: "Prestamo", value: `#${prestamo.id}` },
          { label: "Ingreso a", value: sedeNombre(prestamo.sedeOrigenId) },
          { label: "Egreso de", value: sedeNombre(prestamo.sedeDestinoId) },
          { label: "Monto", value: formatoPesos(prestamo.montoPago || prestamo.costo) },
          { label: "Estado", value: "PAGADO" },
        ],
        subtitulo: "Caja e inventario actualizados",
        tipo: "APROBACION_PAGO",
        titulo: "Aprobacion de pago",
        tone: "emerald",
        valor: prestamo.montoPago || prestamo.costo,
      });
    }
  });

  cajaMovimientos.forEach((item) => {
    const tipo = String(item.tipo || "").toUpperCase();
    timeline.push({
      categoria: "Caja real",
      detalle: item.descripcion || "Movimiento de caja relacionado al IMEI.",
      fecha: item.createdAt,
      id: `caja-${item.id}`,
      meta: [
        { label: "Movimiento", value: item.tipo },
        { label: "Concepto", value: item.concepto },
        { label: "Sede", value: item.sede?.nombre || sedeNombre(item.sedeId) },
        { label: "Valor", value: formatoPesos(item.valor) },
      ],
      subtitulo: item.sede?.nombre || sedeNombre(item.sedeId),
      tipo: `CAJA_${tipo}`,
      titulo: `${tipo === "INGRESO" ? "Ingreso" : "Egreso"} de caja`,
      tone: tipo === "INGRESO" ? "emerald" : "rose",
      valor: item.valor,
    });
  });

  movimientosCajaSede.forEach((item) => {
    const tipo = String(item.tipo || "").toUpperCase();
    timeline.push({
      categoria: "Caja prestamo",
      detalle: "Movimiento interno de caja asociado al prestamo.",
      fecha: item.createdAt,
      id: `movimiento-caja-sede-${item.id}`,
      meta: [
        { label: "Prestamo", value: item.prestamoId ? `#${item.prestamoId}` : "-" },
        { label: "Movimiento", value: item.tipo },
        { label: "Concepto", value: item.concepto },
        { label: "Sede", value: item.sede?.nombre || sedeNombre(item.sedeId) },
        { label: "Valor", value: formatoPesos(item.valor) },
      ],
      subtitulo: item.sede?.nombre || sedeNombre(item.sedeId),
      tipo: `CAJA_PRESTAMO_${tipo}`,
      titulo:
        tipo === "PENDIENTE_APROBACION"
          ? "Pago pendiente en caja de prestamo"
          : `${tipo === "INGRESO" ? "Ingreso" : tipo === "EGRESO" ? "Egreso" : tipo} en caja de prestamo`,
      tone:
        tipo === "INGRESO"
          ? "emerald"
          : tipo === "EGRESO"
            ? "rose"
            : "amber",
      valor: item.valor,
    });
  });

  registrosVenta.forEach((registro) => {
    timeline.push({
      categoria: "Registro venta",
      detalle: `Registro comercial de ${registro.clienteNombre}.`,
      fecha: registro.createdAt,
      id: `registro-venta-${registro.id}`,
      meta: [
        { label: "Registro", value: `#${registro.id}` },
        { label: "Sede", value: registro.sede?.nombre || sedeNombre(registro.sedeId) },
        { label: "Cliente", value: registro.clienteNombre },
        { label: "Plataforma", value: registro.plataformaCredito },
        { label: "Estado venta", value: registro.estadoVentaRegistro },
        { label: "Facturacion", value: registro.estadoFacturacion },
        { label: "Venta relacionada", value: registro.ventaIdRelacionada || "-" },
      ],
      subtitulo: registro.sede?.nombre || sedeNombre(registro.sedeId),
      tipo: "REGISTRO_VENDEDOR_VENTA",
      titulo: `Registro comercial #${registro.id}`,
      tone: "violet",
    });
  });

  ventas.forEach((venta) => {
    timeline.push({
      categoria: "Venta",
      detalle: `Venta registrada por ${venta.usuario?.nombre || "usuario no disponible"}.`,
      fecha: venta.fecha || venta.createdAt,
      id: `venta-${venta.id}`,
      meta: [
        { label: "Venta", value: venta.idVenta },
        { label: "Sede", value: venta.sede?.nombre || sedeNombre(venta.sedeId) },
        { label: "Servicio", value: venta.servicio },
        { label: "Ingreso", value: formatoPesos(Number(venta.ingreso || 0)) },
        { label: "Utilidad", value: formatoPesos(Number(venta.utilidad || 0)) },
        { label: "Salida", value: formatoPesos(Number(venta.salida || 0)) },
        { label: "Caja oficina", value: formatoPesos(Number(venta.cajaOficina || 0)) },
        { label: "Jalador", value: venta.jalador || "-" },
        { label: "Cerrador", value: venta.cerrador || "-" },
      ],
      subtitulo: venta.sede?.nombre || sedeNombre(venta.sedeId),
      tipo: "VENTA",
      titulo: `Venta ${venta.idVenta}`,
      tone: "emerald",
      valor: Number(venta.ingreso || 0),
    });
  });

  const timelineOrdenado = timeline
    .filter((event) => event.fecha instanceof Date && !Number.isNaN(event.fecha.getTime()))
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  const ultimoEvento = timelineOrdenado[timelineOrdenado.length - 1] ?? null;
  const cicloDetectado = [
    { label: "Ingreso principal", active: Boolean(inventarioPrincipal) },
    { label: "Inventario sede", active: inventariosSede.length > 0 },
    { label: "Prestamo", active: prestamos.length > 0 },
    {
      label: "Solicitud pago",
      active: prestamos.some((item) => Boolean(item.fechaSolicitudPago)),
    },
    {
      label: "Pago aprobado",
      active:
        prestamos.some((item) => Boolean(item.fechaAprobacionPago)) ||
        timelineOrdenado.some((event) => eventoTieneTexto(event, "PAGO_PRESTAMO_APROBADO")),
    },
    { label: "Caja", active: cajaMovimientos.length > 0 || movimientosCajaSede.length > 0 },
    { label: "Venta", active: ventas.length > 0 || registrosVenta.length > 0 },
  ];

  const cobertura = esAdmin ? "Todas las sedes" : user.sedeNombre;
  const totalEventos = timelineOrdenado.length;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f4ee_0%,#edf2f7_100%)] px-4 py-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[36px] border border-[#1f2430] bg-[linear-gradient(135deg,#111318_0%,#1c2330_58%,#7c2d12_100%)] px-6 py-7 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)] md:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(199,154,87,0.18),transparent_28%)]" />

          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <div className="inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f2d7a6]">
                Trazabilidad por IMEI
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Historial avanzado
              </h1>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
                Reconstruye el ciclo del equipo cruzando Bodega Principal,
                inventario de sede, prestamos, caja, registros comerciales y ventas.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-slate-100">
                  Cobertura: <span className="font-semibold text-white">{cobertura}</span>
                </div>
                <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-slate-100">
                  Usuario: <span className="font-semibold text-white">{user.nombre}</span>
                </div>
                {imei && (
                  <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-slate-100">
                    IMEI consultado: <span className="font-semibold text-white">{imei}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <Link
                href="/inventario"
                className="inline-flex h-[56px] min-w-[180px] items-center justify-center rounded-2xl border border-white/12 bg-white/95 px-6 text-center text-[15px] font-bold text-slate-900 transition hover:bg-white"
              >
                Volver
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[30px] border border-[#e4dccd] bg-[linear-gradient(180deg,#ffffff_0%,#fbf8f2_100%)] p-5 shadow-sm">
          <div className="inline-flex rounded-full border border-[#e4dccd] bg-[#faf7f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Busqueda
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            Consulta completa por IMEI
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Escribe un IMEI para ver donde entro, a que sede se movio, como se
            pago, que caja afecto y si termino vendido.
          </p>

          <form className="mt-5 flex flex-col gap-4 xl:flex-row">
            <input
              type="text"
              name="imei"
              defaultValue={imei}
              placeholder="Escribe el IMEI"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            />

            <button
              type="submit"
              className="inline-flex h-[56px] min-w-[190px] items-center justify-center rounded-2xl bg-[#111318] px-6 text-[15px] font-bold text-white transition hover:bg-[#1d2330]"
            >
              Buscar historial
            </button>
          </form>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Eventos"
            value={totalEventos}
            detail={imei ? "Puntos de trazabilidad encontrados." : "Busca un IMEI para iniciar."}
          />
          <MetricCard
            label="Ubicacion actual"
            value={ubicacionActual}
            detail={`Estado: ${estadoActual}`}
            valueClass="text-slate-950 text-2xl"
          />
          <MetricCard
            label="Financiero"
            value={estadoFinancieroActual}
            detail={`Valor base: ${formatoPesos(valorEquipo)}`}
            valueClass={
              String(estadoFinancieroActual).toUpperCase() === "PAGO"
                ? "text-emerald-700"
                : String(estadoFinancieroActual).toUpperCase() === "DEUDA"
                  ? "text-amber-700"
                  : "text-slate-950"
            }
          />
          <MetricCard
            label="Caja real"
            value={`${formatoPesos(totalIngresoCaja)} / ${formatoPesos(totalEgresoCaja)}`}
            detail="Ingresos / egresos localizados por IMEI."
            valueClass="text-2xl text-slate-950"
          />
        </section>

        {imei && (
          <section className="mt-6 rounded-[30px] border border-[#e4dccd] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex rounded-full border border-[#e4dccd] bg-[#faf7f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Ciclo detectado
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                  Resumen operativo del equipo
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Esta lectura combina tablas distintas para que el ciclo se vea
                  en una sola pantalla.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 lg:max-w-xl lg:justify-end">
                {cicloDetectado.map((paso) => (
                  <span
                    key={paso.label}
                    className={[
                      "rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em]",
                      paso.active
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-400",
                    ].join(" ")}
                  >
                    {paso.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Ultimo evento
                </p>
                <p className="mt-2 text-lg font-black text-slate-950">
                  {ultimoEvento?.titulo || "Sin eventos"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {ultimoEvento ? formatoFecha(ultimoEvento.fecha) : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Prestamos
                </p>
                <p className="mt-2 text-lg font-black text-slate-950">
                  {prestamos.length}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Ciclos de traslado o cobro relacionados.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Ventas
                </p>
                <p className="mt-2 text-lg font-black text-slate-950">
                  {ventas.length}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Ventas finales enlazadas al serial.
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="mt-6 rounded-[32px] border border-[#e2d9ca] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#e4dccd] bg-[#faf7f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Linea de tiempo
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                {imei ? `Ciclo del IMEI ${imei}` : "Ciclo del equipo"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Ordenado desde el primer evento hasta el movimiento mas reciente.
              </p>
            </div>

            <span className="text-sm font-medium text-slate-500">
              {timelineOrdenado.length} evento(s)
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {!imei ? (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-500">
                Escribe un IMEI para consultar su historial completo.
              </div>
            ) : timelineOrdenado.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-500">
                No hay eventos relacionados con este IMEI.
              </div>
            ) : (
              timelineOrdenado.map((event, index) => (
                <TimelineCard key={event.id} event={event} index={index} />
              ))
            )}
          </div>
        </section>

        {movimientos.length > 0 && (
          <section className="mt-6 overflow-hidden rounded-[32px] border border-[#e2d9ca] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.10)]">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex rounded-full border border-[#e4dccd] bg-[#faf7f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Movimientos base
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                  Registro de MovimientoInventario
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Tabla original de movimientos para validar el detalle fuente.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1320px] text-sm">
                <thead className="sticky top-0 bg-[#f8fafc]">
                  <tr className="border-b border-slate-200 text-left text-[12px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    <th className="px-4 py-4">ID</th>
                    <th className="px-4 py-4">Movimiento</th>
                    <th className="px-4 py-4">Referencia</th>
                    <th className="px-4 py-4">Color</th>
                    <th className="px-4 py-4">Costo</th>
                    <th className="px-4 py-4">Sede</th>
                    <th className="px-4 py-4">Debe a</th>
                    <th className="px-4 py-4">Estado financiero</th>
                    <th className="px-4 py-4">Origen</th>
                    <th className="px-4 py-4">Observacion</th>
                    <th className="px-4 py-4">Fecha</th>
                  </tr>
                </thead>

                <tbody>
                  {movimientos.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 align-top text-slate-700 transition hover:bg-[#faf7f1]"
                    >
                      <td className="px-4 py-4 font-bold text-slate-950">{item.id}</td>
                      <td className="px-4 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                            badgeMovimiento(item.tipoMovimiento),
                          ].join(" ")}
                        >
                          {item.tipoMovimiento}
                        </span>
                      </td>
                      <td className="px-4 py-4">{valorSeguro(item.referencia)}</td>
                      <td className="px-4 py-4">{valorSeguro(item.color)}</td>
                      <td className="px-4 py-4 font-semibold text-slate-950">
                        {item.costo ? formatoPesos(item.costo) : "-"}
                      </td>
                      <td className="px-4 py-4">{sedeNombre(item.sedeId)}</td>
                      <td className="px-4 py-4">{valorSeguro(item.deboA)}</td>
                      <td className="px-4 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                            badgeFinanciero(item.estadoFinanciero),
                          ].join(" ")}
                        >
                          {item.estadoFinanciero || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-4">{valorSeguro(item.origen)}</td>
                      <td className="px-4 py-4 leading-6 text-slate-600">
                        {valorSeguro(item.observacion)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                        {formatoFecha(item.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
