import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { TraceabilityNavigation, TraceabilitySearch } from "./traceability-parts";
import styles from "./history.module.css";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { etiquetaEstadoInventario } from "@/lib/prestamos";
import { esRolBodega } from "@/lib/access-control";
import BodegaHistory from "./bodega-history";

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

type ControlAlert = {
  detalle: string;
  nivel: "OK" | "INFO" | "ALERTA" | "CRITICO";
  titulo: string;
  tone: TimelineTone;
};

type QuickAction = {
  detalle: string;
  href: string;
  label: string;
  tone: TimelineTone;
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

function movementTone(tipo: string): TimelineTone {
  const valor = String(tipo || "").toUpperCase();

  if (valor.includes("VENTA")) return "emerald";
  if (valor.includes("PRESTAMO")) return "sky";
  if (valor.includes("PAGO")) return "violet";
  if (valor.includes("ELIM")) return "rose";
  if (valor.includes("INGRESO")) return "amber";

  return "slate";
}

function normalizar(valor: string | null | undefined) {
  return String(valor || "").trim().toUpperCase();
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
  if (visibles.length === 0) return null;
  return <dl className={styles.metaGrid}>{visibles.map(item => <div key={`${item.label}-${String(item.value)}`}><dt>{item.label}</dt><dd>{valorSeguro(item.value)}</dd></div>)}</dl>;
}

function MetricCard({ icon, label, value, detail, tone = "slate" }: {
  icon: DashboardIconName; label: string; value: ReactNode; detail: string; tone?: TimelineTone;
}) {
  return <div className={styles.metric} data-tone={tone}><span className={styles.metricIcon}><DashboardIcon name={icon} /></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></div>;
}

function ControlAlertCard({ alerta }: { alerta: ControlAlert }) {
  return <article className={styles.alert} data-tone={alerta.tone}><div className={styles.alertHead}><DashboardIcon name={alerta.nivel === "OK" ? "shield" : alerta.nivel === "INFO" ? "document-search" : "warning"} /><div><h3>{alerta.titulo}</h3><span className={styles.level}>{alerta.nivel === "OK" ? "Sin alertas" : alerta.nivel}</span></div></div><p>{alerta.detalle}</p></article>;
}

function QuickActionCard({ action }: { action: QuickAction }) {
  return <Link href={action.href} className={styles.relatedLink}><div><strong>{action.label}</strong><p>{action.detalle}</p></div><DashboardIcon name="arrow" /></Link>;
}

function TimelineCard({ event, index }: { event: TimelineEvent; index: number }) {
  return <li><span className={styles.eventNumber} aria-label={`Paso ${index + 1}`}>{index + 1}</span><article className={styles.event} data-tone={event.tone}>
    <header className={styles.eventHeading}><div><span className={styles.eventCategory}>{event.categoria}</span><h3>{event.titulo}</h3>{event.subtitulo && <p>{event.subtitulo}</p>}</div><time dateTime={event.fecha.toISOString()}><DashboardIcon name="clock" />{formatoFecha(event.fecha)}</time></header>
    <p className={styles.eventDetail}>{valorSeguro(event.detalle)}</p><MetaGrid items={event.meta} />
  </article></li>;
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
  if (esRolBodega(user.rolNombre)) {
    return <BodegaHistory imei={imei} nombre={user.perfilNombre || user.nombre} />;
  }
  const esAdmin = ["ADMIN", "AUDITOR"].includes(String(user.rolNombre || "").toUpperCase());

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
    id ? sedesPorId.get(id) || "Sede sin configurar" : "-";

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
        { label: "Estado actual", value: etiquetaEstadoInventario(item.estadoActual) },
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
          { label: "Estado actual", value: etiquetaEstadoInventario(item.estadoActual) },
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
  const estadosPrestamoActivos = new Set([
    "PENDIENTE",
    "APROBADO",
    "PAGO_PENDIENTE_APROBACION",
    "DEVOLUCION_PENDIENTE",
  ]);
  const estadosInventarioNoDisponibles = new Set([
    "PRESTAMO",
    "PRESTAMO_POR_ACEPTAR",
    "TRASLADO",
    "VENDIDO",
  ]);
  const inventariosOperativos = inventariosSede.filter(
    (item) => !estadosInventarioNoDisponibles.has(normalizar(item.estadoActual))
  );
  const prestamosActivos = prestamos.filter((item) =>
    estadosPrestamoActivos.has(normalizar(item.estado))
  );
  const prestamosPendientes = prestamos.filter(
    (item) => normalizar(item.estado) === "PENDIENTE"
  );
  const pagosPendientes = prestamos.filter(
    (item) => normalizar(item.estado) === "PAGO_PENDIENTE_APROBACION"
  );
  const registrosVentaPendientes = registrosVenta.filter((registro) => {
    const estadoVenta = normalizar(registro.estadoVentaRegistro);

    return !registro.ventaIdRelacionada && !["COMPLETADA", "FINALIZADA", "ANULADA"].includes(estadoVenta);
  });
  const ventaSinInventario = ventas.some((venta) => !venta.inventarioSedeId);
  const inventarioNoVendidoConVenta =
    ventas.length > 0 &&
    inventariosSede.some(
      (item) => normalizar(item.estadoActual) !== "VENDIDO"
    );
  const deudaSinAcreedor =
    normalizar(registroSedeActual?.estadoFinanciero) === "DEUDA" &&
    !String(registroSedeActual?.deboA || "").trim();
  const principalDisponibleConSede =
    normalizar(inventarioPrincipal?.estado) === "BODEGA" &&
    inventariosSede.length > 0;

  const alertasControl: ControlAlert[] = [];

  if (imei && totalEventos === 0) {
    alertasControl.push({
      detalle: "No hay registros relacionados en inventario, prestamos, caja ni ventas.",
      nivel: "INFO",
      titulo: "IMEI sin trazabilidad",
      tone: "slate",
    });
  }

  if (inventariosOperativos.length > 1) {
    alertasControl.push({
      detalle: `Aparece operativo en ${inventariosOperativos.length} sedes. Revisar antes de vender o mover.`,
      nivel: "CRITICO",
      titulo: "IMEI activo en varias sedes",
      tone: "rose",
    });
  }

  if (principalDisponibleConSede) {
    alertasControl.push({
      detalle: "Figura disponible en Bodega Principal y tambien tiene registro en sede.",
      nivel: "ALERTA",
      titulo: "Principal y sede simultaneos",
      tone: "amber",
    });
  }

  if (deudaSinAcreedor) {
    alertasControl.push({
      detalle: "El equipo esta en DEUDA, pero no tiene acreedor definido.",
      nivel: "ALERTA",
      titulo: "Deuda sin acreedor",
      tone: "amber",
    });
  }

  if (prestamosPendientes.length > 0) {
    alertasControl.push({
      detalle: `${prestamosPendientes.length} solicitud(es) esperan aprobacion de la sede destino.`,
      nivel: "INFO",
      titulo: "Prestamo por aceptar",
      tone: "sky",
    });
  }

  if (pagosPendientes.length > 0) {
    alertasControl.push({
      detalle: `${pagosPendientes.length} pago(s) requieren aprobacion de la sede acreedora.`,
      nivel: "ALERTA",
      titulo: "Pago pendiente de aprobacion",
      tone: "violet",
    });
  }

  if (ventaSinInventario) {
    alertasControl.push({
      detalle: "Hay venta registrada sin relacion directa al inventario de sede.",
      nivel: "ALERTA",
      titulo: "Venta sin inventario enlazado",
      tone: "amber",
    });
  }

  if (inventarioNoVendidoConVenta) {
    alertasControl.push({
      detalle: "Existe venta del IMEI y al menos un registro de inventario no esta marcado como VENDIDO.",
      nivel: "ALERTA",
      titulo: "Venta con inventario abierto",
      tone: "amber",
    });
  }

  if (registrosVentaPendientes.length > 0) {
    alertasControl.push({
      detalle: `${registrosVentaPendientes.length} registro(s) comercial(es) siguen sin venta final enlazada.`,
      nivel: "INFO",
      titulo: "Registro comercial pendiente",
      tone: "violet",
    });
  }

  if (imei && totalEventos > 0 && alertasControl.length === 0) {
    alertasControl.push({
      detalle: "No se detectaron inconsistencias principales para este IMEI.",
      nivel: "OK",
      titulo: "Lectura estable",
      tone: "emerald",
    });
  }

  const quickActions: QuickAction[] = [
    {
      detalle: "Listado operativo por sede, estado y deuda.",
      href: "/inventario",
      label: "Inventario",
      tone: "slate",
    },
    {
      detalle: `${prestamosActivos.length} prestamo(s) activo(s) relacionado(s).`,
      href: "/prestamos",
      label: "Prestamos",
      tone: "sky",
    },
    {
      detalle: `${ventas.length} venta(s) final(es) y ${registrosVenta.length} registro(s) comercial(es).`,
      href: "/ventas/aprobaciones",
      label: "Ventas / aprobaciones",
      tone: "emerald",
    },
  ];

  if (ventas[0]) {
    quickActions.push({
      detalle: `Abrir venta ${ventas[0].idVenta}.`,
      href: `/ventas/editar/${ventas[0].id}`,
      label: "Venta relacionada",
      tone: "emerald",
    });
  }

  if (esAdmin) {
    quickActions.push({
      detalle: "Cruzar hallazgos generales con auditoria.",
      href: "/dashboard/auditoria",
      label: "Auditoria",
      tone: "amber",
    });
  }

  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    { href: "/cierre", icon: "reports", label: "CIERRE" },
    {
      href: "/dashboard/aprobaciones",
      icon: "approvals",
      label: "Aprobaciones",
    },
    {
      href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico",
      icon: "reports",
      label: "Reportes",
    },
    ...(esAdmin
      ? ([
          {
            href: "/dashboard/sedes",
            icon: "settings",
            label: "Configuración",
          },
        ] satisfies NavigationItem[])
      : []),
  ];
  return (
    <div className={styles.page}>
      <TraceabilityNavigation items={navigationItems} name={user.nombre} role={user.rolNombre} />
      <main className={styles.main}>
        <div className={styles.heading}>
          <div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/inventario">Inventario</Link><DashboardIcon name="arrow" /><span>Historial IMEI</span></nav><h1>Centro de trazabilidad</h1><p className={styles.subtitle}>Ubicación, movimientos y estado comercial de cada equipo.</p></div>
          <div className={styles.headingActions}><span className={styles.coverage}><DashboardIcon name="store" />{cobertura}</span><Link href="/inventario" className={styles.button}><DashboardIcon name="inventory" />Ver inventario</Link></div>
        </div>

        <section className={`${styles.panel} ${styles.searchPanel}`} aria-labelledby="search-title">
          <div className={styles.sectionHeading}><span className={styles.sectionIcon}><DashboardIcon name="document-search" /></span><div><h2 id="search-title">Buscar equipo por IMEI</h2><p>Consulta su historial en inventario, préstamos, caja y ventas.</p></div></div>
          <TraceabilitySearch imei={imei} />
        </section>

        <section className={styles.summary} aria-label="Resumen del equipo">
          <MetricCard icon="reports" label="Eventos registrados" value={imei ? totalEventos.toLocaleString("es-CO") : "—"} detail={imei ? "En el ciclo completo del equipo" : "Consulta un IMEI para comenzar"} />
          <MetricCard icon="pin" label="Ubicación actual" value={imei ? ubicacionActual : "—"} detail={imei ? `Estado: ${etiquetaEstadoInventario(estadoActual)}` : "Inventario principal y sedes"} />
          <MetricCard icon="cash" label="Estado financiero" value={imei ? estadoFinancieroActual : "—"} detail={imei ? `Valor base: ${formatoPesos(valorEquipo)}` : "Deuda o pago del equipo"} tone={String(estadoFinancieroActual).toUpperCase() === "PAGO" ? "emerald" : String(estadoFinancieroActual).toUpperCase() === "DEUDA" ? "amber" : "slate"} />
          <MetricCard icon="wallet" label="Caja real" value={imei ? <span className={styles.cashValues}><span><em>Ingresos</em>{formatoPesos(totalIngresoCaja)}</span><span><em>Egresos</em>{formatoPesos(totalEgresoCaja)}</span></span> : "—"} detail="Movimientos de caja localizados por IMEI" />
        </section>

        {imei && <section className={`${styles.panel} ${styles.cycle}`} aria-labelledby="cycle-title">
          <div className={styles.panelHeader}><h2 id="cycle-title">Resumen operativo del equipo</h2><span className={styles.count}>IMEI {imei}</span></div>
          <div className={styles.cycleStages}>{cicloDetectado.map(paso => <span key={paso.label} className={`${styles.stage} ${paso.active ? styles.stageActive : ""}`} aria-label={`${paso.label}: ${paso.active ? "con registros" : "sin registros"}`}>{paso.label}</span>)}</div>
          <dl className={styles.cycleFacts}>
            <div><dt>Último evento</dt><dd>{ultimoEvento?.titulo || "Sin eventos"}</dd><small>{ultimoEvento ? formatoFecha(ultimoEvento.fecha) : "—"}</small></div>
            <div><dt>Préstamos relacionados</dt><dd>{prestamos.length.toLocaleString("es-CO")}</dd></div>
            <div><dt>Ventas relacionadas</dt><dd>{ventas.length.toLocaleString("es-CO")}</dd></div>
          </dl>
        </section>}

        <div className={`${styles.workspace} ${!imei ? styles.workspaceEmpty : ""}`}>
          <section className={styles.panel} aria-labelledby="timeline-title">
            <div className={styles.panelHeader}><div><h2 id="timeline-title">Ciclo del equipo</h2><p>{imei ? `IMEI ${imei} · Desde el primer evento hasta el más reciente.` : "Línea de tiempo del inventario y sus operaciones"}</p></div><span className={styles.count}>{timelineOrdenado.length.toLocaleString("es-CO")} evento{timelineOrdenado.length === 1 ? "" : "s"}</span></div>
            {!imei || timelineOrdenado.length === 0 ? <div className={styles.empty}>
              <span className={styles.emptyIllustration}><DashboardIcon name={!imei ? "document-search" : "inventory"} /></span><h3>{!imei ? "Consulta la historia de tu equipo" : "Sin eventos relacionados"}</h3><p>{!imei ? "Ingresa el IMEI para conocer su ubicación, seguir sus movimientos y consultar su estado financiero." : `No encontramos movimientos para el IMEI ${imei}. Puedes consultar otro equipo.`}</p>
              {!imei && <div className={styles.emptySteps}><span><DashboardIcon name="inventory" />Inventario</span><span><DashboardIcon name="transfer" />Préstamos</span><span><DashboardIcon name="cash" />Caja</span><span><DashboardIcon name="sales" />Ventas</span></div>}
            </div> : <ol className={styles.timeline} aria-label="Línea de tiempo del equipo">{timelineOrdenado.map((event,index) => <TimelineCard key={event.id} event={event} index={index} />)}</ol>}
          </section>
          {imei && <aside className={styles.sidebar} aria-label="Control y accesos relacionados">
            <section className={styles.panel} aria-labelledby="alerts-title"><div className={styles.panelHeader}><h2 id="alerts-title">Lectura del equipo</h2><span className={styles.count}>{alertasControl.length} hallazgo(s)</span></div><div className={styles.alertList}>{alertasControl.map(alerta => <ControlAlertCard key={`${alerta.nivel}-${alerta.titulo}`} alerta={alerta} />)}</div></section>
            <section className={styles.panel} aria-labelledby="related-title"><div className={styles.panelHeader}><h2 id="related-title">Módulos relacionados</h2></div>{quickActions.map(action => <QuickActionCard key={action.label} action={action} />)}</section>
          </aside>}
        </div>

        {movimientos.length > 0 && (
          <section className={`${styles.panel} ${styles.sourceTable}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2 >
                  Detalle de movimientos
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Registro original de inventario · {movimientos.length} movimiento(s).
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
                      className="border-b border-slate-100 align-top text-slate-700 transition hover:bg-slate-50/70"
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
      </main>
    </div>
  );
}
