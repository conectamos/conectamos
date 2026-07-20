"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { NOMBRE_SEDE_BODEGA } from "@/lib/prestamos";
import { TIPOS_PRODUCTO } from "@/lib/product-types";
import { esSedeOperativaInventario } from "@/lib/sedes";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";

type ItemPrincipal = {
  id: number;
  imei: string;
  referencia: string;
  tipoProducto: string;
  color: string | null;
  costo: number;
  numeroFactura: string | null;
  distribuidor: string | null;
  estado?: string | null;
  sedeDestinoId?: number | null;
  estadoCobro?: string | null;
};

type Sede = {
  id: number;
  nombre: string;
};

type ReferenciaCatalogo = {
  id: number;
  nombre: string;
  activo: boolean;
  eliminado?: boolean;
};

type SessionUser = {
  nombre: string;
  usuario: string;
  rolNombre: string;
};

const PAGE_SIZE = 25;

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function mensajeConBloqueos(data: { error?: string; bloqueados?: unknown }, fallback: string) {
  const bloqueos = Array.isArray(data.bloqueados)
    ? data.bloqueados
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];
  const base = data.error || fallback;

  if (bloqueos.length === 0) {
    return base;
  }

  return `${base}. Detalle: ${bloqueos.join(" | ")}`;
}

function MetricCard({
  icon,
  iconClassName,
  label,
  value,
  detail,
  valueClass = "text-slate-950",
}: {
  icon: DashboardIconName;
  iconClassName: string;
  label: string;
  value: string | number;
  detail: string;
  valueClass?: string;
}) {
  return (
    <div className="min-h-[148px] min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start gap-4">
        <span
          className={[
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            iconClassName,
          ].join(" ")}
        >
          <DashboardIcon name={icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            {label}
          </p>
          <p
            className={[
              "mt-2 max-w-full text-[clamp(1.4rem,1.55vw,1.9rem)] font-black leading-tight tracking-tight [overflow-wrap:anywhere]",
              valueClass,
            ].join(" ")}
          >
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function IconoEditar() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M13.5 6 18 10.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function IconoEnviar() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 12h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="m13 6 6 6-6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function IconoVolver() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M9 10H5V6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M5.5 10A7 7 0 1 1 7.6 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function IconoEliminar() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M5 7h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="M9 7V5h6v2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M8 10v8m4-8v8m4-8v8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="M7 7l1 13h8l1-13"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ActionIconButton({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: "neutral" | "dark" | "success" | "danger";
  children: ReactNode;
}) {
  const toneClass = {
    neutral:
      "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
    dark: "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    danger: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  }[tone];

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-45",
        toneClass,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function InventarioPrincipalPage() {
  const [items, setItems] = useState<ItemPrincipal[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [referenciasCatalogo, setReferenciasCatalogo] = useState<ReferenciaCatalogo[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroSedeDestinoId, setFiltroSedeDestinoId] = useState("");
  const [pagina, setPagina] = useState(1);
  const [nuevaReferencia, setNuevaReferencia] = useState("");
  const [referenciaEditada, setReferenciaEditada] = useState("");
  const [editandoReferenciaId, setEditandoReferenciaId] = useState<number | null>(null);
  const [mostrarCatalogoReferencias, setMostrarCatalogoReferencias] = useState(false);
  const [puedeEliminar, setPuedeEliminar] = useState(false);

  const [mostrarModal, setMostrarModal] = useState(false);
  const [mostrarModalMasivo, setMostrarModalMasivo] = useState(false);
  const [itemSeleccionado, setItemSeleccionado] = useState<ItemPrincipal | null>(null);
  const [sedeDestinoId, setSedeDestinoId] = useState("");
  const [idsSeleccionados, setIdsSeleccionados] = useState<number[]>([]);
  const [mostrarModalEdicion, setMostrarModalEdicion] = useState(false);
  const [idsEdicion, setIdsEdicion] = useState<number[]>([]);
  const [edicionReferencia, setEdicionReferencia] = useState("");
  const [edicionTipoProducto, setEdicionTipoProducto] = useState("");
  const [edicionColor, setEdicionColor] = useState("");
  const [edicionCosto, setEdicionCosto] = useState("");
  const [edicionFactura, setEdicionFactura] = useState("");
  const [edicionDistribuidor, setEdicionDistribuidor] = useState("");
  const [exportandoExcel, setExportandoExcel] = useState(false);

  const mensajeEsError = mensaje.trim().toUpperCase().startsWith("ERROR");

  const cargarInventarioPrincipal = useCallback(async () => {
    try {
      setMensaje("");

      const res = await fetch("/api/inventario-principal", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "Error cargando bodega principal"}`);
        return;
      }

      setItems(Array.isArray(data) ? data : []);
    } catch {
      setMensaje("Error cargando inventario principal");
    }
  }, []);

  const cargarSedes = useCallback(async () => {
    try {
      const res = await fetch("/api/sedes", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setSedes(Array.isArray(data) ? data : []);
      }
    } catch {}
  }, []);

  const cargarSession = useCallback(async () => {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setUser(data);
      }
    } catch {}
  }, []);

  const cargarReferenciasCatalogo = useCallback(async () => {
    try {
      const res = await fetch("/api/inventario-principal/referencias", {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "Error cargando catalogo de referencias"}`);
        return;
      }

      setReferenciasCatalogo(Array.isArray(data.referencias) ? data.referencias : []);
      setPuedeEliminar(Boolean(data.puedeEliminar));
    } catch {
      setMensaje("Error cargando catalogo de referencias");
    }
  }, []);

  useEffect(() => {
    void cargarInventarioPrincipal();
    void cargarSession();
    void cargarSedes();
    void cargarReferenciasCatalogo();
  }, [
    cargarInventarioPrincipal,
    cargarReferenciasCatalogo,
    cargarSedes,
    cargarSession,
  ]);

  useLiveRefresh(cargarInventarioPrincipal, { intervalMs: 30000 });

  useEffect(() => {
    setIdsSeleccionados((actuales) =>
      actuales.filter((id) => items.some((item) => item.id === id))
    );
  }, [items]);

  const equiposDisponibles = useMemo(
    () =>
      items.filter(
        (item) => String(item.estado || "BODEGA").toUpperCase() === "BODEGA"
      ),
    [items]
  );

  const valorEnBodega = useMemo(
    () => equiposDisponibles.reduce((acc, item) => acc + Number(item.costo || 0), 0),
    [equiposDisponibles]
  );

  const equiposEnviados = useMemo(
    () =>
      items.filter(
        (item) => ["PRESTAMO", "PAGO"].includes(String(item.estado || "").toUpperCase())
      ),
    [items]
  );

  const pendientesCobro = useMemo(
    () => items.filter((item) => String(item.estadoCobro || "").toUpperCase() === "PENDIENTE"),
    [items]
  );

  const referenciasActivas = useMemo(
    () => referenciasCatalogo.filter((item) => item.activo),
    [referenciasCatalogo]
  );

  const referenciasOcultas = useMemo(
    () => referenciasCatalogo.filter((item) => !item.activo),
    [referenciasCatalogo]
  );

  const itemsFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return items.filter((item) => {
      const sedeDestino =
        sedes.find((sede) => sede.id === item.sedeDestinoId)?.nombre || "";

      if (
        filtroSedeDestinoId &&
        Number(item.sedeDestinoId || 0) !== Number(filtroSedeDestinoId)
      ) {
        return false;
      }

      if (!termino) {
        return true;
      }

      return [
        String(item.imei || ""),
        String(item.referencia || ""),
        String(item.tipoProducto || ""),
        String(item.color || ""),
        String(item.distribuidor || ""),
        String(item.numeroFactura || ""),
        String(item.estado || ""),
        String(item.estadoCobro || ""),
        sedeDestino,
      ]
        .join(" ")
        .toLowerCase()
        .includes(termino);
    });
  }, [busqueda, filtroSedeDestinoId, items, sedes]);

  const totalPaginas = Math.max(1, Math.ceil(itemsFiltrados.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const itemsPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * PAGE_SIZE;
    return itemsFiltrados.slice(inicio, inicio + PAGE_SIZE);
  }, [itemsFiltrados, paginaActual]);
  const paginasVisibles = useMemo(() => {
    const candidatas = new Set([
      1,
      totalPaginas,
      paginaActual - 1,
      paginaActual,
      paginaActual + 1,
    ]);

    return Array.from(candidatas)
      .filter((numero) => numero >= 1 && numero <= totalPaginas)
      .sort((a, b) => a - b);
  }, [paginaActual, totalPaginas]);
  const primerResultado =
    itemsFiltrados.length === 0 ? 0 : (paginaActual - 1) * PAGE_SIZE + 1;
  const ultimoResultado = Math.min(
    paginaActual * PAGE_SIZE,
    itemsFiltrados.length
  );

  useEffect(() => {
    setPagina(1);
  }, [busqueda, filtroSedeDestinoId]);

  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas);
    }
  }, [pagina, totalPaginas]);

  const idsVisibles = useMemo(
    () => itemsPaginados.map((item) => item.id),
    [itemsPaginados]
  );

  const todosVisiblesSeleccionados = useMemo(
    () =>
      idsVisibles.length > 0 &&
      idsVisibles.every((id) => idsSeleccionados.includes(id)),
    [idsSeleccionados, idsVisibles]
  );

  const itemsSeleccionados = useMemo(
    () => items.filter((item) => idsSeleccionados.includes(item.id)),
    [idsSeleccionados, items]
  );

  const itemsSeleccionadosDisponibles = useMemo(
    () =>
      itemsSeleccionados.filter(
        (item) => String(item.estado || "BODEGA").toUpperCase() === "BODEGA"
      ),
    [itemsSeleccionados]
  );

  const itemsSeleccionadosEnPrestamo = useMemo(
    () =>
      itemsSeleccionados.filter(
        (item) => String(item.estado || "").toUpperCase() === "PRESTAMO"
      ),
    [itemsSeleccionados]
  );

  const itemsEdicion = useMemo(
    () => items.filter((item) => idsEdicion.includes(item.id)),
    [idsEdicion, items]
  );

  const sedesDestinoOperativas = useMemo(
    () =>
      sedes.filter(
        (sede) =>
          esSedeOperativaInventario(sede.nombre) &&
          String(sede.nombre || "").trim().toUpperCase() !== NOMBRE_SEDE_BODEGA
      ),
    [sedes]
  );

  const exportarInventarioExcel = useCallback(async () => {
    if (itemsFiltrados.length === 0) {
      setMensaje("No hay equipos visibles para exportar");
      return;
    }

    try {
      setExportandoExcel(true);
      setMensaje("");

      const XLSX = await import("xlsx");
      const nombreSedeDestino = (id?: number | null) =>
        sedes.find((sede) => sede.id === id)?.nombre || "-";

      const filas = itemsFiltrados.map((item) => ({
        ID: item.id,
        IMEI: String(item.imei || ""),
        REFERENCIA: item.referencia || "",
        TIPO: item.tipoProducto || "TELEFONIA",
        COLOR: item.color || "",
        COSTO: Number(item.costo || 0),
        FACTURA: item.numeroFactura || "",
        DISTRIBUIDOR: item.distribuidor || "",
        ESTADO: String(item.estado || "BODEGA").toUpperCase(),
        COBRO: item.estadoCobro || "-",
        "SEDE DESTINO": item.sedeDestinoId ? nombreSedeDestino(item.sedeDestinoId) : "-",
      }));

      const worksheet = XLSX.utils.json_to_sheet(filas);
      itemsFiltrados.forEach((item, index) => {
        const row = index + 2;
        const imeiCell = worksheet[`B${row}`];
        const costoCell = worksheet[`F${row}`];

        if (imeiCell) {
          imeiCell.t = "s";
          imeiCell.z = "@";
          imeiCell.v = String(item.imei || "");
        }

        if (costoCell) {
          costoCell.t = "n";
          costoCell.v = Number(item.costo || 0);
          costoCell.z = '"$"#,##0';
        }
      });
      worksheet["!cols"] = [
        { wch: 8 },
        { wch: 18 },
        { wch: 34 },
        { wch: 14 },
        { wch: 16 },
        { wch: 14 },
        { wch: 18 },
        { wch: 24 },
        { wch: 14 },
        { wch: 14 },
        { wch: 22 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario principal");
      const fecha = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `inventario-principal-${fecha}.xlsx`);

      setMensaje(`Exportacion completada: ${itemsFiltrados.length} equipo(s) en Excel.`);
    } catch {
      setMensaje("Error: No fue posible exportar el inventario a Excel");
    } finally {
      setExportandoExcel(false);
    }
  }, [itemsFiltrados, sedes]);

  const alternarSeleccion = (id: number) => {
    setIdsSeleccionados((actuales) =>
      actuales.includes(id)
        ? actuales.filter((itemId) => itemId !== id)
        : [...actuales, id]
    );
  };

  const alternarSeleccionVisibles = () => {
    setIdsSeleccionados((actuales) => {
      if (todosVisiblesSeleccionados) {
        return actuales.filter((id) => !idsVisibles.includes(id));
      }

      return Array.from(new Set([...actuales, ...idsVisibles]));
    });
  };

  const limpiarSeleccionMasiva = () => {
    setIdsSeleccionados([]);
    setSedeDestinoId("");
    setMostrarModalMasivo(false);
  };

  const limpiarFormularioEdicion = () => {
    setEdicionReferencia("");
    setEdicionTipoProducto("");
    setEdicionColor("");
    setEdicionCosto("");
    setEdicionFactura("");
    setEdicionDistribuidor("");
  };

  const abrirModalEdicion = (ids: number[]) => {
    const idsValidos = ids.filter((id) => items.some((item) => item.id === id));

    if (idsValidos.length === 0) {
      setMensaje("Debes seleccionar al menos un equipo para editar");
      return;
    }

    setIdsEdicion(idsValidos);
    limpiarFormularioEdicion();
    setMostrarModalEdicion(true);
  };

  const cerrarModalEdicion = () => {
    setMostrarModalEdicion(false);
    setIdsEdicion([]);
    limpiarFormularioEdicion();
  };

  const agregarReferencia = async () => {
    const nombre = nuevaReferencia.trim();

    if (!nombre) {
      setMensaje("Debes escribir una referencia para agregar al catalogo");
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario-principal/referencias", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nombre }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "No se pudo guardar la referencia"}`);
        return;
      }

      setReferenciasCatalogo(Array.isArray(data.referencias) ? data.referencias : []);
      setNuevaReferencia("");
      setMensaje(data.mensaje || "Referencia agregada correctamente");
    } catch {
      setMensaje("Error guardando referencia");
    } finally {
      setCargando(false);
    }
  };

  const iniciarEdicionReferencia = (item: ReferenciaCatalogo) => {
    setEditandoReferenciaId(item.id);
    setReferenciaEditada(item.nombre);
  };

  const cancelarEdicionReferencia = () => {
    setEditandoReferenciaId(null);
    setReferenciaEditada("");
  };

  const actualizarReferencia = async (item: ReferenciaCatalogo, activo?: boolean) => {
    const nombre = referenciaEditada.trim();
    const editandoNombre = editandoReferenciaId === item.id;

    if (editandoNombre && !nombre) {
      setMensaje("La referencia no puede quedar vacia");
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario-principal/referencias", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          ...(editandoNombre ? { nombre } : {}),
          ...(typeof activo === "boolean" ? { activo } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "No se pudo actualizar la referencia"}`);
        return;
      }

      setReferenciasCatalogo(Array.isArray(data.referencias) ? data.referencias : []);
      cancelarEdicionReferencia();
      setMensaje(data.mensaje || "Referencia actualizada correctamente");
    } catch {
      setMensaje("Error actualizando referencia");
    } finally {
      setCargando(false);
    }
  };

  const eliminarReferencia = async (item: ReferenciaCatalogo) => {
    if (!puedeEliminar) {
      setMensaje("Error: El rol actual no puede eliminar referencias");
      return;
    }

    const confirmado = window.confirm(
      `Eliminar "${item.nombre}" del catalogo? Los equipos ya registrados no se modifican.`
    );

    if (!confirmado) {
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch(`/api/inventario-principal/referencias?id=${item.id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "No se pudo eliminar la referencia"}`);
        return;
      }

      setReferenciasCatalogo(Array.isArray(data.referencias) ? data.referencias : []);
      if (editandoReferenciaId === item.id) {
        cancelarEdicionReferencia();
      }
      setMensaje(data.mensaje || "Referencia eliminada del catalogo");
    } catch {
      setMensaje("Error eliminando referencia");
    } finally {
      setCargando(false);
    }
  };

  const eliminar = async (id: number) => {
    if (!puedeEliminar) {
      setMensaje("Error: El rol actual no puede eliminar equipos");
      return;
    }

    const confirmado = window.confirm(
      "Seguro que deseas eliminar este equipo de bodega principal? Si esta en PRESTAMO solo se eliminara si no tiene ventas, pagos ni movimientos posteriores."
    );

    if (!confirmado) {
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario-principal/eliminar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "Error eliminando equipo"}`);
        return;
      }

      setMensaje("Equipo eliminado correctamente");
      await cargarInventarioPrincipal();
    } catch {
      setMensaje("Error eliminando equipo");
    } finally {
      setCargando(false);
    }
  };

  const restaurarBodega = async (id: number) => {
    const confirmado = window.confirm(
      "Volver este equipo directamente a Bodega Principal? Esta accion no requiere aprobacion de sede. Se bloqueara si ya tiene venta o movimientos de caja."
    );

    if (!confirmado) {
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario-principal/restaurar-bodega", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${mensajeConBloqueos(data, "No se pudo volver a bodega")}`);
        return;
      }

      setMensaje(data.mensaje || "Equipo devuelto a Bodega Principal");
      await cargarInventarioPrincipal();
    } catch {
      setMensaje("Error devolviendo equipo a Bodega Principal");
    } finally {
      setCargando(false);
    }
  };

  const eliminarSeleccion = async () => {
    if (!puedeEliminar) {
      setMensaje("Error: El rol actual no puede eliminar equipos");
      return;
    }

    if (idsSeleccionados.length === 0) {
      setMensaje("Debes seleccionar al menos un equipo para eliminar");
      return;
    }

    const confirmado = window.confirm(
      `Eliminar ${idsSeleccionados.length} equipo(s) seleccionado(s)? Se eliminaran los que esten en BODEGA y los envios en PRESTAMO que no tengan ventas, pagos ni movimientos posteriores.`
    );

    if (!confirmado) {
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario-principal/eliminar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: idsSeleccionados }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "No se pudo eliminar la seleccion"}`);
        return;
      }

      setMensaje(
        [
          data.mensaje || "Seleccion eliminada correctamente",
          Number(data.omitidos || 0) > 0
            ? `${data.omitidos} equipo(s) no se eliminaron por estar bloqueados.`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      );
      setIdsSeleccionados([]);
      await cargarInventarioPrincipal();
    } catch {
      setMensaje("Error eliminando seleccion");
    } finally {
      setCargando(false);
    }
  };

  const restaurarSeleccionBodega = async () => {
    if (itemsSeleccionadosEnPrestamo.length === 0) {
      setMensaje("Debes seleccionar al menos un equipo en PRESTAMO para volver a bodega");
      return;
    }

    const confirmado = window.confirm(
      `Volver ${itemsSeleccionadosEnPrestamo.length} equipo(s) directamente a Bodega Principal? Esta accion no requiere aprobacion de sede. Se bloquearan los que ya tengan venta o movimientos de caja.`
    );

    if (!confirmado) {
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario-principal/restaurar-bodega", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: itemsSeleccionadosEnPrestamo.map((item) => item.id) }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(
          `Error: ${mensajeConBloqueos(data, "No se pudo volver la seleccion a bodega")}`
        );
        return;
      }

      setMensaje(
        [
          data.mensaje || "Seleccion devuelta a Bodega Principal",
          Array.isArray(data.bloqueados) && data.bloqueados.length > 0
            ? `${data.bloqueados.length} equipo(s) no se procesaron por bloqueo: ${data.bloqueados
                .slice(0, 4)
                .join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      );
      setIdsSeleccionados([]);
      await cargarInventarioPrincipal();
    } catch {
      setMensaje("Error devolviendo seleccion a Bodega Principal");
    } finally {
      setCargando(false);
    }
  };

  const guardarEdicionMasiva = async () => {
    if (idsEdicion.length === 0) {
      setMensaje("Debes seleccionar al menos un equipo para editar");
      return;
    }

    const payload: Record<string, unknown> = { ids: idsEdicion };

    if (edicionReferencia) payload.referencia = edicionReferencia;
    if (edicionTipoProducto) payload.tipoProducto = edicionTipoProducto;
    if (edicionColor.trim()) payload.color = edicionColor.trim();
    if (edicionCosto.trim()) payload.costo = Number(edicionCosto.replace(/\D/g, ""));
    if (edicionFactura.trim()) payload.numeroFactura = edicionFactura.trim();
    if (edicionDistribuidor.trim()) payload.distribuidor = edicionDistribuidor.trim();

    if (Object.keys(payload).length === 1) {
      setMensaje("Completa al menos un campo para editar");
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario-principal/actualizar", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "No se pudo actualizar la seleccion"}`);
        return;
      }

      setMensaje(data.mensaje || "Inventario actualizado correctamente");
      cerrarModalEdicion();
      setIdsSeleccionados([]);
      await cargarInventarioPrincipal();
    } catch {
      setMensaje("Error actualizando seleccion");
    } finally {
      setCargando(false);
    }
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setItemSeleccionado(null);
    setSedeDestinoId("");
  };

  const abrirModalEnvio = (item: ItemPrincipal) => {
    setItemSeleccionado(item);
    setSedeDestinoId("");
    setMostrarModal(true);
  };

  const enviarASede = async () => {
    if (!itemSeleccionado) {
      return;
    }

    if (!sedeDestinoId) {
      setMensaje("Debes seleccionar una sede destino");
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario-principal/enviar-a-sede", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: itemSeleccionado.id,
          sedeDestinoId: Number(sedeDestinoId),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "Error enviando a sede"}`);
        return;
      }

      setMensaje(data.mensaje || "Equipo enviado correctamente a la sede");
      cerrarModal();
      await cargarInventarioPrincipal();
    } catch {
      setMensaje("Error enviando equipo a sede");
    } finally {
      setCargando(false);
    }
  };

  const enviarMasivoASede = async () => {
    if (!sedeDestinoId) {
      setMensaje("Debes seleccionar una sede destino");
      return;
    }

    if (itemsSeleccionadosDisponibles.length === 0) {
      setMensaje("No hay equipos disponibles seleccionados para enviar");
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      let enviados = 0;
      const errores: string[] = [];

      for (const item of itemsSeleccionadosDisponibles) {
        const res = await fetch("/api/inventario-principal/enviar-a-sede", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: item.id,
            sedeDestinoId: Number(sedeDestinoId),
          }),
        });

        const data = await res.json();

        if (res.ok) {
          enviados += 1;
        } else {
          errores.push(`${item.imei}: ${data.error || "Error enviando a sede"}`);
        }
      }

      setMensaje(
        [
          `Envio masivo finalizado: ${enviados} equipo${
            enviados === 1 ? "" : "s"
          } enviado${enviados === 1 ? "" : "s"}.`,
          errores.length
            ? `${errores.length} no se procesaron. ${errores.slice(0, 3).join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      );

      limpiarSeleccionMasiva();
      await cargarInventarioPrincipal();
    } catch {
      setMensaje("Error ejecutando envio masivo");
    } finally {
      setCargando(false);
    }
  };

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
    { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
    { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
  ];
  const inicialesUsuario = String(user?.nombre || user?.usuario || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/inventario"
        coverageLabel="Bodega principal"
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                Inventario principal
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Control de stock, referencias y despachos desde bodega principal
              </p>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              <label className="relative w-full sm:w-[360px] xl:w-[420px]">
                <span className="sr-only">Buscar en inventario principal</span>
                <input
                  type="search"
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder="Buscar por IMEI, referencia, factura o distribuidor..."
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-12 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                />
                <DashboardIcon
                  name="search"
                  className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
                />
              </label>
              <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[185px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || (
                    <DashboardIcon name="user" className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {user?.nombre || user?.usuario || "Cargando usuario"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {user?.rolNombre || "Sesión activa"}
                  </p>
                </div>
              </div>
              <LogoutButton
                variant="light"
                className="min-h-12 shrink-0 rounded-xl"
              />
              <Link
                href="/inventario/nuevo"
                className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[#e30613] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#bd0711]"
              >
                + Nuevo inventario
              </Link>
            </div>
          </header>

        {mensaje && (
          <div
            className={[
              "mt-5 rounded-2xl border px-5 py-4 text-sm font-medium shadow-sm",
              mensajeEsError
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800",
            ].join(" ")}
          >
            {mensaje}
          </div>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon="inventory"
            iconClassName="bg-slate-100 text-slate-700"
            label="Equipos en bodega"
            value={equiposDisponibles.length}
            detail="Stock listo para enviar a sede."
          />
          <MetricCard
            icon="cash"
            iconClassName="bg-emerald-50 text-emerald-600"
            label="Valor en bodega"
            value={formatoPesos(valorEnBodega)}
            detail="Suma solo equipos en estado BODEGA."
            valueClass="text-emerald-700"
          />
          <MetricCard
            icon="send"
            iconClassName="bg-blue-50 text-blue-600"
            label="Enviados a sede"
            value={equiposEnviados.length}
            detail="Equipos ya despachados desde bodega."
            valueClass="text-sky-700"
          />
          <MetricCard
            icon="document"
            iconClassName="bg-orange-50 text-orange-600"
            label="Cobro pendiente"
            value={pendientesCobro.length}
            detail="Casos enviados con seguimiento de cobro."
            valueClass="text-amber-600"
          />
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <button
            type="button"
            onClick={() => setMostrarCatalogoReferencias((actual) => !actual)}
            aria-expanded={mostrarCatalogoReferencias}
            className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-slate-50"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <DashboardIcon name="catalog" className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-black tracking-tight text-slate-950">
                Referencias de bodega
              </h2>
              <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em]">
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-100">
                  {referenciasActivas.length} activas
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600 ring-1 ring-slate-200">
                  {referenciasOcultas.length} ocultas
                </span>
              </div>
            </div>
            <span
              className={[
                "text-xl text-slate-500 transition-transform",
                mostrarCatalogoReferencias ? "rotate-180" : "",
              ].join(" ")}
              aria-hidden="true"
            >
              ⌄
            </span>
          </button>

          {mostrarCatalogoReferencias && (
            <div className="border-t border-slate-200 p-5">
              <div className="grid max-w-[760px] gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                <input
                  type="text"
                  value={nuevaReferencia}
                  onChange={(event) => setNuevaReferencia(event.target.value)}
                  placeholder="Nueva referencia..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                />
                <button
                  type="button"
                  onClick={() => void agregarReferencia()}
                  disabled={cargando}
                  className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Agregar
                </button>
              </div>
              <div className="mt-5 max-w-[760px] rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {referenciasCatalogo.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                    Aun no hay referencias en el catalogo.
                  </div>
                ) : (
                  referenciasCatalogo.map((item) => {
                    const editando = editandoReferenciaId === item.id;

                    return (
                      <div
                        key={item.id}
                        className={[
                          "rounded-2xl border bg-white px-4 py-3 shadow-sm transition",
                          item.activo
                            ? "border-emerald-100"
                            : "border-slate-200 opacity-75",
                        ].join(" ")}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          {editando ? (
                            <input
                              value={referenciaEditada}
                              onChange={(event) => setReferenciaEditada(event.target.value)}
                              className="min-h-[42px] min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                            />
                          ) : (
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-950">
                                {item.nombre}
                              </p>
                              <span
                                className={[
                                  "mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
                                  item.activo
                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                                    : "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
                                ].join(" ")}
                              >
                                {item.activo ? "Activa" : "Oculta"}
                              </span>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 md:justify-end">
                            {editando ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void actualizarReferencia(item)}
                                  disabled={cargando}
                                  className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelarEdicionReferencia}
                                  disabled={cargando}
                                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => iniciarEdicionReferencia(item)}
                                  disabled={cargando}
                                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void actualizarReferencia(item, !item.activo)}
                                  disabled={cargando}
                                  className={[
                                    "rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-60",
                                    item.activo
                                      ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                      : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                                  ].join(" ")}
                                >
                                  {item.activo ? "Ocultar" : "Activar"}
                                </button>
                                {puedeEliminar && (
                                  <button
                                    type="button"
                                    onClick={() => void eliminarReferencia(item)}
                                    disabled={cargando}
                                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                                  >
                                    Eliminar
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            </div>
          )}
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <DashboardIcon name="inventory" className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                  Stock de inventario principal
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Administra disponibilidad, despachos hacia sedes y eliminación de registros.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label>
                <span className="sr-only">Filtrar por sede destino</span>
                <select
                  value={filtroSedeDestinoId}
                  onChange={(event) => setFiltroSedeDestinoId(event.target.value)}
                  className="min-h-10 min-w-[210px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                >
                  <option value="">Todas las sedes</option>
                  {sedesDestinoOperativas.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void exportarInventarioExcel()}
                disabled={exportandoExcel || itemsFiltrados.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <DashboardIcon name="download" className="h-4 w-4" />
                {exportandoExcel ? "Exportando..." : "Exportar Excel"}
              </button>
              <div className="text-sm font-medium tabular-nums text-slate-500">
                {itemsFiltrados.length} resultado(s)
              </div>
            </div>
          </div>

          {idsSeleccionados.length > 0 && (
            <div className="border-b border-red-100 bg-red-50/60 px-6 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-950">
                    {idsSeleccionados.length} equipo
                    {idsSeleccionados.length === 1 ? "" : "s"} seleccionado
                    {idsSeleccionados.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {itemsSeleccionadosDisponibles.length} disponible
                    {itemsSeleccionadosDisponibles.length === 1 ? "" : "s"} para envio
                    desde Bodega Principal. {itemsSeleccionadosEnPrestamo.length} en PRESTAMO
                    para correccion admin.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSedeDestinoId("");
                      setMostrarModalMasivo(true);
                    }}
                    disabled={cargando || itemsSeleccionadosDisponibles.length === 0}
                    className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Enviar a sede
                  </button>

                  <button
                    type="button"
                    onClick={() => abrirModalEdicion(idsSeleccionados)}
                    disabled={cargando}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Editar seleccion
                  </button>

                  <button
                    type="button"
                    onClick={() => void restaurarSeleccionBodega()}
                    disabled={cargando || itemsSeleccionadosEnPrestamo.length === 0}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Volver a bodega
                  </button>

                  {puedeEliminar && (
                    <button
                      type="button"
                      onClick={() => void eliminarSeleccion()}
                      disabled={cargando}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                    >
                      Eliminar seleccion
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={limpiarSeleccionMasiva}
                    disabled={cargando}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Limpiar seleccion
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] text-sm">
              <thead className="sticky top-0 bg-[#f8fafc]">
                <tr className="border-b border-slate-200 text-left text-[12px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={todosVisiblesSeleccionados}
                      onChange={alternarSeleccionVisibles}
                      aria-label="Seleccionar equipos visibles"
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                  </th>
                  <th className="px-4 py-4">ID</th>
                  <th className="px-4 py-4">IMEI</th>
                  <th className="px-4 py-4">Referencia</th>
                  <th className="px-4 py-4">Color</th>
                  <th className="px-4 py-4">Costo</th>
                  <th className="px-4 py-4">Factura</th>
                  <th className="px-4 py-4">Distribuidor</th>
                  <th className="px-4 py-4">Estado</th>
                  <th className="px-4 py-4">Cobro</th>
                  <th className="px-4 py-4">Sede destino</th>
                  <th className="px-4 py-4">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {itemsFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-16 text-center text-slate-500">
                      No hay equipos que coincidan en inventario principal.
                    </td>
                  </tr>
                ) : (
                  itemsPaginados.map((item) => {
                    const estadoNormalizado = String(item.estado || "BODEGA").toUpperCase();
                    const enviado = estadoNormalizado === "PRESTAMO";
                    const pagado = estadoNormalizado === "PAGO";
                    const bloqueadoParaEnvio = estadoNormalizado !== "BODEGA";
                    const sedeDestino =
                      sedes.find((sede) => sede.id === item.sedeDestinoId)?.nombre || "-";

                    return (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 align-top text-slate-700 transition hover:bg-slate-50"
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={idsSeleccionados.includes(item.id)}
                            onChange={() => alternarSeleccion(item.id)}
                            aria-label={`Seleccionar ${item.imei}`}
                            className="h-4 w-4 rounded border-slate-300 text-slate-900"
                          />
                        </td>
                        <td className="px-4 py-4 font-bold text-slate-950">{item.id}</td>
                        <td className="px-4 py-4 font-semibold text-slate-950">{item.imei}</td>
                        <td className="px-4 py-4">
                          <div>{item.referencia}</div>
                          <span className="mt-1 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                            {item.tipoProducto || "TELEFONIA"}
                          </span>
                        </td>
                        <td className="px-4 py-4">{item.color ?? "-"}</td>
                        <td className="px-4 py-4 font-semibold text-slate-950">
                          {formatoPesos(item.costo)}
                        </td>
                        <td className="px-4 py-4">{item.numeroFactura ?? "-"}</td>
                        <td className="px-4 py-4">{item.distribuidor ?? "-"}</td>
                        <td className="px-4 py-4">
                          <span
                            className={[
                              "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                              enviado
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : pagado
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-slate-100 text-slate-700",
                            ].join(" ")}
                          >
                            {estadoNormalizado}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={[
                              "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                              String(item.estadoCobro || "").toUpperCase() === "PENDIENTE"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-slate-200 bg-slate-100 text-slate-500",
                            ].join(" ")}
                          >
                            {item.estadoCobro ?? "-"}
                          </span>
                        </td>
                        <td className="px-4 py-4">{item.sedeDestinoId ? sedeDestino : "-"}</td>
                        <td className="px-4 py-4">
                          <div className="flex min-w-[9.5rem] items-center justify-end gap-2">
                            <ActionIconButton
                              label="Editar"
                              onClick={() => abrirModalEdicion([item.id])}
                              disabled={cargando}
                              tone="neutral"
                            >
                              <IconoEditar />
                            </ActionIconButton>

                            <ActionIconButton
                              label="Enviar a sede"
                              onClick={() => abrirModalEnvio(item)}
                              disabled={cargando || bloqueadoParaEnvio}
                              tone="dark"
                            >
                              <IconoEnviar />
                            </ActionIconButton>

                            <ActionIconButton
                              label="Volver a bodega"
                              onClick={() => void restaurarBodega(item.id)}
                              disabled={cargando || estadoNormalizado !== "PRESTAMO"}
                              tone="success"
                            >
                              <IconoVolver />
                            </ActionIconButton>

                            {puedeEliminar && (
                              <ActionIconButton
                                label="Eliminar"
                                onClick={() => eliminar(item.id)}
                                disabled={cargando}
                                tone="danger"
                              >
                                <IconoEliminar />
                              </ActionIconButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Mostrando {primerResultado}-{ultimoResultado} de {itemsFiltrados.length} registros
            </p>
            <nav
              className="flex flex-wrap items-center gap-1.5"
              aria-label="Paginación de inventario"
            >
              <button
                type="button"
                onClick={() => setPagina((actual) => Math.max(1, actual - 1))}
                disabled={paginaActual === 1}
                aria-label="Página anterior"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-red-200 hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-40"
              >
                ‹
              </button>
              {paginasVisibles.map((numero, index) => {
                const anterior = paginasVisibles[index - 1];

                return (
                  <span key={numero} className="flex items-center gap-1.5">
                    {anterior && numero - anterior > 1 && (
                      <span className="px-1 text-sm text-slate-400">…</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPagina(numero)}
                      aria-current={paginaActual === numero ? "page" : undefined}
                      className={[
                        "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-bold transition",
                        paginaActual === numero
                          ? "border-[#e30613] bg-red-50 text-[#e30613]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:text-[#e30613]",
                      ].join(" ")}
                    >
                      {numero}
                    </button>
                  </span>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  setPagina((actual) => Math.min(totalPaginas, actual + 1))
                }
                disabled={paginaActual === totalPaginas}
                aria-label="Página siguiente"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-red-200 hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-40"
              >
                ›
              </button>
            </nav>
          </div>
        </section>
        </main>
      </div>

      {mostrarModalEdicion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
              Edicion masiva
            </div>
            <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              Editar inventario principal
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Se actualizaran {itemsEdicion.length || idsEdicion.length} equipo
              {(itemsEdicion.length || idsEdicion.length) === 1 ? "" : "s"}. Deja vacios
              los campos que no quieras cambiar.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-600">
                  Referencia
                </label>
                <select
                  value={edicionReferencia}
                  onChange={(event) => setEdicionReferencia(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Mantener referencia</option>
                  {referenciasActivas.map((item) => (
                    <option key={item.id} value={item.nombre}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-600">
                  Tipo de producto
                </label>
                <select
                  value={edicionTipoProducto}
                  onChange={(event) => setEdicionTipoProducto(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Mantener tipo</option>
                  {TIPOS_PRODUCTO.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-600">
                  Color
                </label>
                <input
                  value={edicionColor}
                  onChange={(event) => setEdicionColor(event.target.value)}
                  placeholder="Mantener color"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-600">
                  Costo
                </label>
                <input
                  value={edicionCosto ? formatoPesos(Number(edicionCosto)) : ""}
                  onChange={(event) =>
                    setEdicionCosto(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Mantener costo"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-600">
                  Factura
                </label>
                <input
                  value={edicionFactura}
                  onChange={(event) => setEdicionFactura(event.target.value)}
                  placeholder="Mantener factura"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-600">
                  Distribuidor
                </label>
                <input
                  value={edicionDistribuidor}
                  onChange={(event) => setEdicionDistribuidor(event.target.value)}
                  placeholder="Mantener distribuidor"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => void guardarEdicionMasiva()}
                disabled={cargando}
                className="inline-flex h-[56px] w-full items-center justify-center rounded-2xl bg-[#111318] px-5 text-sm font-bold text-white transition hover:bg-[#1d2330] disabled:opacity-70"
              >
                Guardar cambios
              </button>

              <button
                onClick={cerrarModalEdicion}
                disabled={cargando}
                className="inline-flex h-[56px] w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-70"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalMasivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
              Envio masivo
            </div>
            <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              Enviar seleccion a sede
            </h3>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Se enviaran {itemsSeleccionadosDisponibles.length} equipo
              {itemsSeleccionadosDisponibles.length === 1 ? "" : "s"} disponible
              {itemsSeleccionadosDisponibles.length === 1 ? "" : "s"} en BODEGA.
              {idsSeleccionados.length > itemsSeleccionadosDisponibles.length
                ? ` ${idsSeleccionados.length - itemsSeleccionadosDisponibles.length} seleccionado${
                    idsSeleccionados.length - itemsSeleccionadosDisponibles.length === 1
                      ? ""
                      : "s"
                  } no aplica por estado actual.`
                : ""}
            </p>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Cada equipo ingresara de inmediato en la sede destino con estado{" "}
              <span className="font-semibold">BODEGA</span> y deuda activa a{" "}
              <span className="font-semibold">Proveedor Finser</span>.
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-600">
                Sede destino
              </label>
              <select
                value={sedeDestinoId}
                onChange={(event) => setSedeDestinoId(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">Seleccionar sede</option>
                {sedesDestinoOperativas.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                onClick={enviarMasivoASede}
                disabled={cargando || itemsSeleccionadosDisponibles.length === 0}
                className="inline-flex h-[56px] w-full items-center justify-center rounded-2xl bg-[#111318] px-5 text-sm font-bold text-white transition hover:bg-[#1d2330] disabled:opacity-70"
              >
                Confirmar envio
              </button>

              <button
                onClick={() => {
                  setMostrarModalMasivo(false);
                  setSedeDestinoId("");
                }}
                className="inline-flex h-[56px] w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModal && itemSeleccionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
              Envio a sede
            </div>
            <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              Confirmar despacho
            </h3>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <p>
                <span className="font-semibold text-slate-950">IMEI:</span> {itemSeleccionado.imei}
              </p>
              <p>
                <span className="font-semibold text-slate-950">Referencia:</span>{" "}
                {itemSeleccionado.referencia}
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              El equipo ingresara de inmediato en la sede destino con estado{" "}
              <span className="font-semibold">BODEGA</span> y deuda activa a{" "}
              <span className="font-semibold">Proveedor Finser</span>.
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-600">
                Sede destino
              </label>
              <select
                value={sedeDestinoId}
                onChange={(event) => setSedeDestinoId(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">Seleccionar sede</option>
                {sedesDestinoOperativas.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                onClick={enviarASede}
                disabled={cargando}
                className="inline-flex h-[56px] w-full items-center justify-center rounded-2xl bg-[#111318] px-5 text-sm font-bold text-white transition hover:bg-[#1d2330] disabled:opacity-70"
              >
                Confirmar envio
              </button>

              <button
                onClick={cerrarModal}
                className="inline-flex h-[56px] w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
