import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { etiquetaEstadoInventario } from "@/lib/prestamos";

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

  if (visibles.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {visibles.map((item) => (
        <div
          key={`${item.label}-${String(item.value)}`}
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
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
  icon,
  label,
  value,
  detail,
  valueClass = "text-slate-950",
}: {
  icon: DashboardIconName;
  label: string;
  value: ReactNode;
  detail: string;
  valueClass?: string;
}) {
  return (
    <div className="flex min-h-[142px] items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
        <DashboardIcon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <p className={["mt-2 break-words text-[26px] font-black leading-tight tracking-tight", valueClass].join(" ")}>
          {value}
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function ControlAlertCard({ alerta }: { alerta: ControlAlert }) {
  return (
    <article className={["rounded-2xl border px-4 py-4", toneBadge(alerta.tone)].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em]">
            {alerta.nivel}
          </p>
          <h3 className="mt-2 text-base font-black text-slate-950">
            {alerta.titulo}
          </h3>
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{alerta.detalle}</p>
    </article>
  );
}

function QuickActionCard({ action }: { action: QuickAction }) {
  return (
    <Link
      href={action.href}
      className={[
        "group block rounded-2xl border px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-sm",
        toneBadge(action.tone),
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.16em]">ABRIR</p>
        <DashboardIcon name="arrow" className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </div>
      <h3 className="mt-2 text-base font-black text-slate-950">{action.label}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{action.detalle}</p>
    </Link>
  );
}

function TimelineCard({ event, index }: { event: TimelineEvent; index: number }) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_6px_20px_rgba(15,23,42,0.035)]">
      <span className="absolute inset-y-0 left-0 w-1 bg-[#e30613]" />
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
  const inicialesUsuario = String(user.nombre || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/inventario"
        coverageLabel={cobertura}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                <Link href="/inventario" className="transition hover:text-[#e30613]">
                  Inventario
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-slate-600">Historial IMEI</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Centro de trazabilidad
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Consulta el ciclo completo de un equipo entre inventario, préstamos,
                caja, registros comerciales y ventas.
              </p>
              {imei && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold text-[#e30613]">
                  <DashboardIcon name="search" className="h-4 w-4" />
                  IMEI {imei}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || "US"}
                </span>
                <div className="min-w-0 pr-2">
                  <p className="max-w-[170px] truncate text-sm font-bold">{user.nombre}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {user.rolNombre}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-[52px] uppercase" />
            </div>
          </header>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                <DashboardIcon name="search" className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Consulta directa
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                  Buscar equipo por IMEI
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Ingresa el serial para reconstruir su ubicación, movimientos,
                  pagos, caja y estado comercial.
                </p>
              </div>
            </div>

            <form className="mt-5 flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <DashboardIcon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  name="imei"
                  defaultValue={imei}
                  placeholder="Escribe el IMEI de 15 dígitos"
                  className="min-h-[54px] w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-base font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                />
              </div>

              <button
                type="submit"
                className="inline-flex min-h-[54px] min-w-[190px] items-center justify-center gap-2 rounded-xl bg-[#e30613] px-6 text-xs font-black tracking-[0.08em] text-white transition hover:bg-[#c9000b]"
              >
                <DashboardIcon name="search" className="h-5 w-5" />
                BUSCAR IMEI
              </button>
            </form>
          </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon="reports"
            label="Eventos"
            value={totalEventos}
            detail={imei ? "Puntos de trazabilidad encontrados." : "Busca un IMEI para iniciar."}
          />
          <MetricCard
            icon="store"
            label="Ubicacion actual"
            value={ubicacionActual}
            detail={`Estado: ${etiquetaEstadoInventario(estadoActual)}`}
            valueClass="text-slate-950 text-2xl"
          />
          <MetricCard
            icon="cash"
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
            icon="trend"
            label="Caja real"
            value={`${formatoPesos(totalIngresoCaja)} / ${formatoPesos(totalEgresoCaja)}`}
            detail="Ingresos / egresos localizados por IMEI."
            valueClass="text-2xl text-slate-950"
          />
        </section>

        {imei && (
          <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    Alertas operativas
                  </p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                    Lectura del equipo
                  </h2>
                </div>
                <span className="text-sm font-medium text-slate-500">
                  {alertasControl.length} hallazgo(s)
                </span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {alertasControl.map((alerta) => (
                  <ControlAlertCard
                    key={`${alerta.nivel}-${alerta.titulo}`}
                    alerta={alerta}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                Accesos relacionados
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                Modulos relacionados
              </h2>

              <div className="mt-5 grid gap-3">
                {quickActions.map((action) => (
                  <QuickActionCard key={action.label} action={action} />
                ))}
              </div>
            </div>
          </section>
        )}

        {imei && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Ciclo detectado
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
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
                        ? "border-[#e30613] bg-[#e30613] text-white"
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

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                Línea de tiempo
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                {imei ? `Ciclo del IMEI ${imei}` : "Ciclo del equipo"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Ordenado desde el primer evento hasta el movimiento mas reciente.
              </p>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
              {timelineOrdenado.length} EVENTO{timelineOrdenado.length === 1 ? "" : "S"}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {!imei ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-slate-500">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                  <DashboardIcon name="search" className="h-6 w-6" />
                </span>
                <p className="mt-3 font-bold text-slate-700">Consulta un equipo</p>
                <p className="mt-1 text-sm">Escribe un IMEI para abrir su centro de trazabilidad.</p>
              </div>
            ) : timelineOrdenado.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-slate-500">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                  <DashboardIcon name="inventory" className="h-6 w-6" />
                </span>
                <p className="mt-3 font-bold text-slate-700">Sin eventos relacionados</p>
                <p className="mt-1 text-sm">No encontramos movimientos para este IMEI.</p>
              </div>
            ) : (
              timelineOrdenado.map((event, index) => (
                <TimelineCard key={event.id} event={event} index={index} />
              ))
            )}
          </div>
        </section>

        {movimientos.length > 0 && (
          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Movimientos base
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
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
    </div>
  );
}
