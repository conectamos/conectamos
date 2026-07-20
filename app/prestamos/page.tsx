"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import { useLiveRefresh } from "@/lib/use-live-refresh";

type Prestamo = {
  id: number;
  imei: string;
  referencia: string;
  color: string | null;
  costo: number;
  montoPago?: number | null;
  fechaSolicitudPago?: string | null;
  sedeOrigenId: number;
  sedeDestinoId: number;
  sedeOrigenNombre?: string;
  sedeDestinoNombre?: string;
  estado: string;
  deboAActual?: string | null;
  estadoFinancieroActual?: string | null;
  estadoActualActual?: string | null;
  requiereAprobacionEntreSedes?: boolean;
  prestamoDesdePrincipal?: boolean;
};

type SessionUser = {
  id: number;
  nombre: string;
  usuario: string;
  sedeId: number;
  sedeNombre: string;
  rolId: number;
  rolNombre: string;
};

type Sede = {
  id: number;
  nombre: string;
};

type PagoPendienteLote = {
  key: string;
  origen: string;
  destino: string;
  fecha: string;
  total: number;
  items: Prestamo[];
  ultimoTiempo: number | null;
};

type SolicitudPagoLote = {
  key: string;
  origen: string;
  destino: string;
  total: number;
  items: Prestamo[];
};

type SolicitudPagoLoteSeleccionable = SolicitudPagoLote & {
  seleccionados: Prestamo[];
  totalSeleccionado: number;
};

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function tiempoSolicitudPago(fecha: string | null | undefined) {
  if (!fecha) {
    return null;
  }

  const fechaPago = new Date(fecha);

  if (Number.isNaN(fechaPago.getTime())) {
    return null;
  }

  return fechaPago.getTime();
}

function imeisResumenLote(items: Prestamo[], expandido = false) {
  const visibles = expandido ? items : items.slice(0, 10);
  const restantes = Math.max(items.length - visibles.length, 0);

  return { visibles, restantes };
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  iconClass,
  valueClass = "text-slate-950",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: DashboardIconName;
  iconClass: string;
  valueClass?: string;
}) {
  return (
    <article className="min-h-[138px] rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          <DashboardIcon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p className={["mt-1.5 text-[28px] font-black leading-tight tracking-tight", valueClass].join(" ")}>
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

export default function PrestamosPage() {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  const [cargandoListado, setCargandoListado] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeFiltroId, setSedeFiltroId] = useState("TODAS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [lotesDetalleAbiertos, setLotesDetalleAbiertos] = useState<string[]>([]);
  const [lotesImeisExpandidos, setLotesImeisExpandidos] = useState<string[]>([]);
  const [idsSolicitudPago, setIdsSolicitudPago] = useState<number[]>([]);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre?.toUpperCase() || "");
  const mensajeEsError = mensaje.trim().toUpperCase().startsWith("ERROR");

  const cargarUsuario = useCallback(async () => {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setUser(data);
      }
    } catch {
      setMensaje("Error cargando sesion");
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

  const cargarPrestamos = useCallback(async () => {
    try {
      const params = new URLSearchParams();

      if (esAdmin && sedeFiltroId !== "TODAS") {
        params.set("sedeId", sedeFiltroId);
      }

      const endpoint = params.size
        ? `/api/prestamos?${params.toString()}`
        : "/api/prestamos";

      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !Array.isArray(data)) {
        throw new Error(data?.error || "Error cargando prestamos");
      }

      setPrestamos(data);
      setMensaje((actual) =>
        actual === "Error cargando prestamos" || actual === "Error cargando sesion"
          ? ""
          : actual
      );
    } catch {
      setMensaje("Error cargando prestamos");
    } finally {
      setCargandoListado(false);
    }
  }, [esAdmin, sedeFiltroId]);

  useEffect(() => {
    const init = async () => {
      await cargarUsuario();
      await cargarSedes();
    };

    void init();
  }, [cargarSedes, cargarUsuario]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void cargarPrestamos();
  }, [cargarPrestamos, user]);

  useLiveRefresh(async () => {
    if (!user) {
      return;
    }

    await cargarPrestamos();
  }, { enabled: Boolean(user), intervalMs: 30000 });

  const sedeFiltroNombre = useMemo(() => {
    if (!esAdmin) {
      return user?.sedeNombre || "tu sede";
    }

    if (sedeFiltroId === "TODAS") {
      return "todas las sedes";
    }

    return (
      sedes.find((sede) => String(sede.id) === sedeFiltroId)?.nombre ||
      "la sede seleccionada"
    );
  }, [esAdmin, sedeFiltroId, sedes, user?.sedeNombre]);

  const solicitarDevolucionPrestamo = async (id: number) => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/prestamos/solicitar-devolucion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error solicitando devolucion");
        return;
      }

      setMensaje("Solicitud de devolucion enviada correctamente");
      await cargarPrestamos();
    } catch {
      setMensaje("Error de conexion al solicitar devolucion");
    } finally {
      setCargando(false);
    }
  };

  const aprobarDevolucionPrestamo = async (id: number) => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/prestamos/devolver", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error aprobando devolucion");
        return;
      }

      setMensaje("Devolucion aprobada correctamente");
      await cargarPrestamos();
    } catch {
      setMensaje("Error de conexion al aprobar devolucion");
    } finally {
      setCargando(false);
    }
  };

  const rechazarDevolucionPrestamo = async (id: number) => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/prestamos/rechazar-devolucion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error rechazando devolucion");
        return;
      }

      setMensaje("Devolucion rechazada correctamente");
      await cargarPrestamos();
    } catch {
      setMensaje("Error de conexion al rechazar devolucion");
    } finally {
      setCargando(false);
    }
  };

  const solicitarPagoPrestamo = async (id: number) => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/prestamos/solicitar-pago", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error solicitando pago");
        return;
      }

      setMensaje("Solicitud de pago enviada correctamente");
      await cargarPrestamos();
    } catch {
      setMensaje("Error de conexion al solicitar pago");
    } finally {
      setCargando(false);
    }
  };

  const solicitarPagoPrestamoLote = async (ids: number[]) => {
    if (ids.length === 0) {
      setMensaje("Selecciona al menos un prestamo pagable");
      return;
    }

    const seleccionados = prestamos.filter((prestamo) => ids.includes(prestamo.id));
    const total = seleccionados.reduce(
      (acumulado, prestamo) => acumulado + Number(prestamo.costo || 0),
      0
    );
    const confirmado = window.confirm(
      `Confirmas enviar ${ids.length} equipo(s) a pagar por ${formatoPesos(total)}?`
    );

    if (!confirmado) {
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/prestamos/solicitar-pago-lote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prestamoIds: ids }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error solicitando pago por lote");
        return;
      }

      setMensaje(data.mensaje || "Solicitud de pago por lote enviada correctamente");
      setIdsSolicitudPago([]);
      await cargarPrestamos();
    } catch {
      setMensaje("Error de conexion al solicitar pago por lote");
    } finally {
      setCargando(false);
    }
  };

  const aprobarPagoPrestamo = async (id: number) => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/prestamos/aprobar-pago", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error aprobando pago");
        return;
      }

      setMensaje("Pago aprobado correctamente");
      await cargarPrestamos();
    } catch {
      setMensaje("Error de conexion al aprobar pago");
    } finally {
      setCargando(false);
    }
  };

  const aprobarPagoPrestamoLote = async (ids: number[]) => {
    if (ids.length === 0) {
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/prestamos/aprobar-pago-lote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prestamoIds: ids }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error aprobando pago por lote");
        return;
      }

      setMensaje(data.mensaje || "Pago por lote aprobado correctamente");
      await cargarPrestamos();
    } catch {
      setMensaje("Error de conexion al aprobar pago por lote");
    } finally {
      setCargando(false);
    }
  };

  const aprobarPrestamo = async (id: number) => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/prestamos/aprobar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error aprobando prestamo");
        return;
      }

      setMensaje("Prestamo aprobado correctamente");
      await cargarPrestamos();
    } catch {
      setMensaje("Error de conexion al aprobar prestamo");
    } finally {
      setCargando(false);
    }
  };

  const cerrarPrestamoPendiente = async (
    id: number,
    accion: "RECHAZADO" | "CANCELADO"
  ) => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/prestamos/cerrar-pendiente", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, accion }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error cerrando solicitud");
        return;
      }

      setMensaje(
        accion === "RECHAZADO"
          ? "Solicitud rechazada correctamente"
          : "Solicitud cancelada correctamente"
      );
      await cargarPrestamos();
    } catch {
      setMensaje("Error de conexion al cerrar solicitud");
    } finally {
      setCargando(false);
    }
  };

  const puedeSolicitarDevolucion = (prestamo: Prestamo) => {
    if (!user) return false;

    const destino = user.sedeId === prestamo.sedeDestinoId;
    const estadoActual = String(prestamo.estadoActualActual || "")
      .trim()
      .toUpperCase();

    return (
      !prestamo.prestamoDesdePrincipal &&
      prestamo.estado === "APROBADO" &&
      estadoActual === "BODEGA" &&
      (esAdmin || destino)
    );
  };

  const puedeAprobarDevolucion = (prestamo: Prestamo) => {
    if (!user) return false;

    const origen = user.sedeId === prestamo.sedeOrigenId;
    return prestamo.estado === "DEVOLUCION_PENDIENTE" && (esAdmin || origen);
  };

  const puedeRechazarDevolucion = (prestamo: Prestamo) => {
    if (!user) return false;

    const origen = user.sedeId === prestamo.sedeOrigenId;
    return prestamo.estado === "DEVOLUCION_PENDIENTE" && (esAdmin || origen);
  };

  const puedeSolicitarPago = (prestamo: Prestamo) => {
    if (!user) return false;

    const destino = user.sedeId === prestamo.sedeDestinoId;

    return (
      prestamo.estado === "APROBADO" &&
      Boolean(prestamo.requiereAprobacionEntreSedes) &&
      (esAdmin || destino)
    );
  };

  const puedeAprobarPrestamo = (prestamo: Prestamo) => {
    if (!user) return false;

    const destino = user.sedeId === prestamo.sedeDestinoId;
    return prestamo.estado === "PENDIENTE" && (esAdmin || destino);
  };

  const puedeRechazarPrestamo = (prestamo: Prestamo) => {
    if (!user) return false;

    const destino = user.sedeId === prestamo.sedeDestinoId;
    return prestamo.estado === "PENDIENTE" && (esAdmin || destino);
  };

  const puedeCancelarPrestamo = (prestamo: Prestamo) => {
    if (!user) return false;

    const origen = user.sedeId === prestamo.sedeOrigenId;
    return prestamo.estado === "PENDIENTE" && (esAdmin || origen);
  };

  const puedeAprobarPago = (prestamo: Prestamo) => {
    if (!user) return false;

    const origen = user.sedeId === prestamo.sedeOrigenId;
    return prestamo.estado === "PAGO_PENDIENTE_APROBACION" && (esAdmin || origen);
  };

  const alternarDetalleLote = (key: string) => {
    setLotesDetalleAbiertos((actuales) =>
      actuales.includes(key)
        ? actuales.filter((item) => item !== key)
        : [...actuales, key]
    );
  };

  const alternarImeisLote = (key: string) => {
    setLotesImeisExpandidos((actuales) =>
      actuales.includes(key)
        ? actuales.filter((item) => item !== key)
        : [...actuales, key]
    );
  };

  const prestamosFiltrados = useMemo(() => {
    return prestamos
      .filter((prestamo) => {
        if (filtroEstado === "TODOS") return true;
        return prestamo.estado === filtroEstado;
      })
      .filter((prestamo) => {
        const termino = busqueda.trim().toLowerCase();
        if (!termino) return true;

        return (
          prestamo.imei.toLowerCase().includes(termino) ||
          prestamo.referencia.toLowerCase().includes(termino) ||
          String(prestamo.color || "").toLowerCase().includes(termino) ||
          String(prestamo.sedeOrigenNombre || prestamo.sedeOrigenId)
            .toLowerCase()
            .includes(termino) ||
          String(prestamo.sedeDestinoNombre || prestamo.sedeDestinoId)
            .toLowerCase()
            .includes(termino) ||
          prestamo.estado.toLowerCase().includes(termino)
        );
      });
  }, [prestamos, filtroEstado, busqueda]);

  const prestamosSeleccionablesPago = prestamosFiltrados.filter((prestamo) =>
    puedeSolicitarPago(prestamo)
  );
  const idsSolicitudPagoValidos = new Set(
    prestamosSeleccionablesPago.map((prestamo) => prestamo.id)
  );
  const prestamosSolicitudPagoSeleccionados = prestamos.filter(
    (prestamo) =>
      idsSolicitudPago.includes(prestamo.id) &&
      idsSolicitudPagoValidos.has(prestamo.id)
  );
  const todosPagablesVisiblesSeleccionados =
    prestamosSeleccionablesPago.length > 0 &&
    prestamosSeleccionablesPago.every((prestamo) =>
      idsSolicitudPago.includes(prestamo.id)
    );
  const totalSolicitudPagoSeleccionada =
    prestamosSolicitudPagoSeleccionados.reduce(
      (acumulado, prestamo) => acumulado + Number(prestamo.costo || 0),
      0
    );
  const lotesSolicitudPago: SolicitudPagoLoteSeleccionable[] = Array.from(
    prestamosSeleccionablesPago
      .reduce((mapa, prestamo) => {
        const origen = prestamo.sedeOrigenNombre ?? "Sede sin configurar";
        const destino = prestamo.sedeDestinoNombre ?? "Sede sin configurar";
        const key = `${prestamo.sedeOrigenId}:${prestamo.sedeDestinoId}`;
        const actual =
          mapa.get(key) || {
            key,
            origen,
            destino,
            total: 0,
            items: [],
          };

        actual.total += Number(prestamo.costo || 0);
        actual.items.push(prestamo);
        mapa.set(key, actual);

        return mapa;
      }, new Map<string, SolicitudPagoLote>())
      .values()
  )
    .map((lote) => {
      const seleccionados = lote.items.filter((item) =>
        idsSolicitudPago.includes(item.id)
      );

      return {
        ...lote,
        seleccionados,
        totalSeleccionado: seleccionados.reduce(
          (acumulado, item) => acumulado + Number(item.costo || 0),
          0
        ),
      };
    })
    .sort((a, b) => b.totalSeleccionado - a.totalSeleccionado || b.total - a.total);
  const lotesConSeleccionPago = lotesSolicitudPago.filter(
    (lote) => lote.seleccionados.length > 0
  );

  const alternarSeleccionSolicitudPago = (id: number) => {
    setIdsSolicitudPago((actuales) =>
      actuales.includes(id)
        ? actuales.filter((itemId) => itemId !== id)
        : [...actuales, id]
    );
  };

  const alternarSeleccionPagablesVisibles = () => {
    const idsVisibles = prestamosSeleccionablesPago.map((prestamo) => prestamo.id);

    setIdsSolicitudPago((actuales) => {
      if (todosPagablesVisiblesSeleccionados) {
        return actuales.filter((id) => !idsVisibles.includes(id));
      }

      return Array.from(new Set([...actuales, ...idsVisibles]));
    });
  };

  const alternarSeleccionGrupoPago = (items: Prestamo[]) => {
    const idsGrupo = items.map((item) => item.id);
    const grupoCompleto = idsGrupo.every((id) => idsSolicitudPago.includes(id));

    setIdsSolicitudPago((actuales) => {
      if (grupoCompleto) {
        return actuales.filter((id) => !idsGrupo.includes(id));
      }

      return Array.from(new Set([...actuales, ...idsGrupo]));
    });
  };

  const limpiarSeleccionSolicitudPago = () => {
    setIdsSolicitudPago([]);
  };

  const lotesPagoPendiente = useMemo(() => {
    if (!user) {
      return [];
    }

    const ventanaLoteMs = 5 * 60 * 1000;
    const lotes: PagoPendienteLote[] = [];

    prestamos
      .filter((prestamo) => {
        if (prestamo.estado !== "PAGO_PENDIENTE_APROBACION") {
          return false;
        }

        return esAdmin || user.sedeId === prestamo.sedeOrigenId;
      })
      .sort((a, b) => {
        const tiempoA = tiempoSolicitudPago(a.fechaSolicitudPago) ?? 0;
        const tiempoB = tiempoSolicitudPago(b.fechaSolicitudPago) ?? 0;

        return tiempoA - tiempoB || a.id - b.id;
      })
      .forEach((prestamo) => {
        const origen = prestamo.sedeOrigenNombre ?? "Sede sin configurar";
        const destino = prestamo.sedeDestinoNombre ?? "Sede sin configurar";
        const tiempo = tiempoSolicitudPago(prestamo.fechaSolicitudPago);
        const loteActual = [...lotes].reverse().find((lote) => {
          if (
            lote.items[0]?.sedeOrigenId !== prestamo.sedeOrigenId ||
            lote.items[0]?.sedeDestinoId !== prestamo.sedeDestinoId
          ) {
            return false;
          }

          if (lote.ultimoTiempo === null || tiempo === null) {
            return lote.ultimoTiempo === tiempo;
          }

          return Math.abs(tiempo - lote.ultimoTiempo) <= ventanaLoteMs;
        });

        if (loteActual) {
          loteActual.items.push(prestamo);
          loteActual.total += Number(prestamo.montoPago || prestamo.costo || 0);
          loteActual.ultimoTiempo = tiempo ?? loteActual.ultimoTiempo;
          loteActual.key = loteActual.items.map((item) => item.id).join("-");
          return;
        }

        lotes.push({
          key: String(prestamo.id),
          origen,
          destino,
          fecha: prestamo.fechaSolicitudPago || "",
          total: Number(prestamo.montoPago || prestamo.costo || 0),
          items: [prestamo],
          ultimoTiempo: tiempo,
        });
      });

    return lotes.sort((a, b) => b.total - a.total);
  }, [esAdmin, prestamos, user]);

  const idsEnLotesMultiples = useMemo(
    () =>
      new Set(
        lotesPagoPendiente
          .filter((lote) => lote.items.length > 1)
          .flatMap((lote) => lote.items.map((item) => item.id))
      ),
    [lotesPagoPendiente]
  );

  const totalPrestamos = prestamos.length;
  const totalDesdePrincipal = prestamos.filter((p) => p.prestamoDesdePrincipal).length;
  const totalEntreSedes = prestamos.filter((p) => !p.prestamoDesdePrincipal).length;
  const totalPendientes = prestamos.filter((p) => p.estado === "PENDIENTE").length;
  const totalPagoPendiente = prestamos.filter(
    (p) => p.estado === "PAGO_PENDIENTE_APROBACION"
  ).length;
  const totalFinalizados = prestamos.filter(
    (p) =>
      p.estado === "RECHAZADO" ||
      p.estado === "CANCELADO" ||
      p.estado === "DEVUELTO" ||
      p.estado === "PAGADO" ||
      p.estado === "FINALIZADO"
  ).length;

  const valorTotalPrestamos = prestamos.reduce(
    (acc, p) => acc + Number(p.costo || 0),
    0
  );

  const estadosFiltro = [
    "TODOS",
    "PENDIENTE",
    "APROBADO",
    "DEVOLUCION_PENDIENTE",
    "PAGO_PENDIENTE_APROBACION",
    "PAGADO",
    "RECHAZADO",
    "CANCELADO",
    "DEVUELTO",
    "FINALIZADO",
  ];

  const claseEstado = (estado: string) => {
    const normalizado = String(estado || "").toUpperCase();

    if (normalizado === "PENDIENTE") return "bg-amber-100 text-amber-700";
    if (normalizado === "APROBADO") return "bg-sky-100 text-sky-700";
    if (normalizado === "DEVOLUCION_PENDIENTE") {
      return "bg-violet-100 text-violet-700";
    }
    if (normalizado === "PAGO_PENDIENTE_APROBACION") {
      return "bg-yellow-100 text-yellow-700";
    }
    if (normalizado === "PAGADO" || normalizado === "FINALIZADO") {
      return "bg-emerald-100 text-emerald-700";
    }
    if (normalizado === "RECHAZADO") return "bg-rose-100 text-rose-700";
    if (normalizado === "CANCELADO") return "bg-slate-200 text-slate-700";
    if (normalizado === "DEVUELTO") return "bg-slate-200 text-slate-700";
    return "bg-slate-200 text-slate-700";
  };

  const claseTipoPrestamo = (prestamo: Prestamo) =>
    prestamo.prestamoDesdePrincipal
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-sky-200 bg-sky-50 text-sky-800";

  const claseFinanciera = (estado: string | null | undefined) => {
    const normalizado = String(estado || "").toUpperCase();

    if (normalizado === "PAGO") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (normalizado === "DEUDA") return "border-amber-200 bg-amber-50 text-amber-700";
    if (normalizado === "CANCELADO") return "border-slate-200 bg-slate-100 text-slate-700";
    return "border-slate-200 bg-slate-50 text-slate-500";
  };

  const resolverSiguientePaso = (prestamo: Prestamo) => {
                    const origen = prestamo.sedeOrigenNombre ?? "Sede sin configurar";
                    const destino = prestamo.sedeDestinoNombre ?? "Sede sin configurar";

    if (prestamo.estado === "PENDIENTE") {
      return {
        detalle: `${destino} debe aprobar o rechazar la recepcion.`,
        titulo: "Aprueba destino",
        tono: "border-amber-200 bg-amber-50 text-amber-800",
      };
    }

    if (prestamo.estado === "APROBADO") {
      if (prestamo.prestamoDesdePrincipal) {
        return {
          detalle: `${destino} solicita el pago desde Inventario. No aplica devolucion.`,
          titulo: "Cobro Bodega Principal",
          tono: "border-amber-200 bg-amber-50 text-amber-800",
        };
      }

      if (prestamo.requiereAprobacionEntreSedes) {
        return {
          detalle: `${destino} solicita pago y ${origen} lo aprueba.`,
          titulo: "Pago entre sedes",
          tono: "border-sky-200 bg-sky-50 text-sky-800",
        };
      }

      return {
        detalle: "Prestamo activo en seguimiento.",
        titulo: "Seguimiento",
        tono: "border-slate-200 bg-slate-50 text-slate-700",
      };
    }

    if (prestamo.estado === "PAGO_PENDIENTE_APROBACION") {
      return {
        detalle: `Al aprobar, entra dinero a ${origen} y sale de ${destino}.`,
        titulo: prestamo.prestamoDesdePrincipal
          ? "Aprueba Bodega Principal"
          : `Aprueba ${origen}`,
        tono: "border-violet-200 bg-violet-50 text-violet-800",
      };
    }

    if (prestamo.estado === "DEVOLUCION_PENDIENTE") {
      const estadoEquipo = String(prestamo.estadoActualActual || "").toUpperCase();

      if (estadoEquipo === "VENDIDO") {
        return {
          detalle:
            "El equipo ya fue vendido. La devolucion no aplica; rechaza para volver al cobro del prestamo.",
          titulo: "Venta detectada",
          tono: "border-rose-200 bg-rose-50 text-rose-800",
        };
      }

      return {
        detalle: `${origen} debe aprobar o rechazar la devolucion.`,
        titulo: "Aprueba origen",
        tono: "border-violet-200 bg-violet-50 text-violet-800",
      };
    }

    if (prestamo.estado === "PAGADO") {
      return {
        detalle: "Caja e inventario ya fueron actualizados.",
        titulo: "Cerrado por pago",
        tono: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    }

    return {
      detalle: "No hay accion pendiente en este estado.",
      titulo: "Sin accion pendiente",
      tono: "border-slate-200 bg-slate-50 text-slate-600",
    };
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
  const inicialesUsuario = String(user?.nombre || user?.usuario || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/prestamos"
        coverageLabel={user?.sedeNombre || "Cargando cobertura"}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                Gestión de préstamos
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Control de préstamos entre sedes, devoluciones y pagos
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Cobertura: {sedeFiltroNombre}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  {prestamosFiltrados.length} registros visibles
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/prestamos/nuevo"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#bd0711]"
              >
                <span className="text-lg leading-none">+</span>
                Nuevo préstamo
              </Link>
              <Link
                href="/inventario"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-[#e30613]"
              >
                Ver inventario
              </Link>
              <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[185px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || <DashboardIcon name="user" className="h-5 w-5" />}
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
              <LogoutButton variant="light" className="min-h-12 shrink-0 rounded-xl" />
            </div>
          </header>

        {mensaje && (
          <div
            className={[
              "mt-5 rounded-xl border px-5 py-4 text-sm font-medium shadow-sm",
              mensajeEsError
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800",
            ].join(" ")}
          >
            {mensaje}
          </div>
        )}

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            label="Total prestamos"
            value={cargandoListado ? "—" : totalPrestamos}
            detail="Solicitudes visibles en esta cobertura."
            icon="loans"
            iconClass="bg-red-50 text-[#e30613]"
          />
          <MetricCard
            label="Bodega principal"
            value={cargandoListado ? "—" : totalDesdePrincipal}
            detail="Equipos enviados desde principal."
            icon="inventory"
            iconClass="bg-orange-50 text-orange-600"
            valueClass="text-amber-600"
          />
          <MetricCard
            label="Entre sedes"
            value={cargandoListado ? "—" : totalEntreSedes}
            detail="Prestamos operativos sede a sede."
            icon="store"
            iconClass="bg-blue-50 text-blue-600"
            valueClass="text-sky-600"
          />
          <MetricCard
            label="Pendientes"
            value={cargandoListado ? "—" : totalPendientes}
            detail="Solicitudes a la espera de aprobacion."
            icon="approvals"
            iconClass="bg-orange-50 text-orange-600"
            valueClass="text-amber-600"
          />
          <MetricCard
            label="Pago pendiente"
            value={cargandoListado ? "—" : totalPagoPendiente}
            detail="Casos a la espera de aprobacion."
            icon="cash"
            iconClass="bg-violet-50 text-violet-600"
            valueClass="text-amber-600"
          />
          <MetricCard
            label="Finalizados"
            value={cargandoListado ? "—" : totalFinalizados}
            detail="Ciclos ya cerrados por pago o devolucion."
            icon="approvals"
            iconClass="bg-emerald-50 text-emerald-600"
            valueClass="text-emerald-600"
          />
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                Control operativo
              </div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                Seguimiento de préstamos
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
                Filtra por estado, IMEI, referencia o sede sin perder trazabilidad.
              </p>
            </div>

            <div className="grid w-full gap-4 xl:max-w-[760px] xl:grid-cols-[minmax(0,1fr)_260px]">
              <input
                placeholder="Buscar IMEI, referencia, color, sede o estado..."
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
              />

              {esAdmin ? (
                <select
                  value={sedeFiltroId}
                  onChange={(event) => {
                    setCargandoListado(true);
                    setSedeFiltroId(event.target.value);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                >
                  <option value="TODAS">Todas las sedes</option>
                  {sedes.map((sede) => (
                    <option key={sede.id} value={String(sede.id)}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-700">
                  Cobertura: {user?.sedeNombre || "Tu sede"}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {estadosFiltro.map((estado) => (
              <button
                key={estado}
                type="button"
                onClick={() => setFiltroEstado(estado)}
                className={[
                  "rounded-lg px-3.5 py-2 text-xs font-bold transition",
                  filtroEstado === estado
                    ? "border border-[#e30613] bg-[#e30613] text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50",
                ].join(" ")}
              >
                {estado}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50/45 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Valor total en préstamos
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Exposición económica acumulada de la cartera visible.
              </p>
            </div>
            <p className="text-[28px] font-black tracking-tight text-[#e30613]">
              $ {valorTotalPrestamos.toLocaleString("es-CO")}
            </p>
          </div>
        </section>

        {prestamosSeleccionablesPago.length > 0 && (
          <section className="mt-5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Enviar a pagar
                </div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                  Lote de pagos seleccionado
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  Pagos de prestamos entre sedes filtrados en esta vista, agrupados por quien recibe el dinero.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={alternarSeleccionPagablesVisibles}
                  disabled={cargando || prestamosSeleccionablesPago.length === 0}
                  className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-4 text-xs font-black tracking-[0.06em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {todosPagablesVisiblesSeleccionados
                    ? "QUITAR VISIBLES"
                    : "SELECCIONAR VISIBLES"}
                </button>

                <button
                  type="button"
                  onClick={limpiarSeleccionSolicitudPago}
                  disabled={cargando || idsSolicitudPago.length === 0}
                  className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-4 text-xs font-black tracking-[0.06em] text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  LIMPIAR
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void solicitarPagoPrestamoLote(
                      prestamosSolicitudPagoSeleccionados.map((prestamo) => prestamo.id)
                    )
                  }
                  disabled={cargando || prestamosSolicitudPagoSeleccionados.length === 0}
                  className="min-h-[42px] rounded-xl bg-[#e30613] px-5 text-xs font-black tracking-[0.06em] text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  ENVIAR LOTE A PAGAR
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Pagables visibles
                </p>
                <p className="mt-2 text-3xl font-black text-slate-950">
                  {prestamosSeleccionablesPago.length}
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Seleccionados
                </p>
                <p className="mt-2 text-3xl font-black text-amber-700">
                  {prestamosSolicitudPagoSeleccionados.length}
                </p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Total a enviar
                </p>
                <p className="mt-2 text-3xl font-black text-emerald-700">
                  {formatoPesos(totalSolicitudPagoSeleccionada)}
                </p>
              </div>
            </div>

            {lotesConSeleccionPago.length > 0 && (
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {lotesConSeleccionPago.map((lote) => {
                  const expansionKey = `solicitud:${lote.key}`;
                  const imeisExpandidos = lotesImeisExpandidos.includes(expansionKey);
                  const resumenImeis = imeisResumenLote(lote.items, imeisExpandidos);
                  const grupoCompleto = lote.seleccionados.length === lote.items.length;

                  return (
                    <article
                      key={lote.key}
                      className={`rounded-2xl border p-5 transition ${
                        lote.seleccionados.length > 0
                          ? "border-red-200 bg-red-50/25 shadow-sm"
                          : "border-slate-200 bg-slate-50/35"
                      }`}
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {lote.destino} envia pago a
                          </p>
                          <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                            {lote.origen}
                          </h3>
                          <p className="mt-2 text-sm text-slate-500">
                            {lote.seleccionados.length} de {lote.items.length} equipos seleccionados
                          </p>
                        </div>

                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-right">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                            Valor seleccionado
                          </p>
                          <p className="mt-1 text-2xl font-black text-emerald-700">
                            {formatoPesos(lote.totalSeleccionado)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          Selecciona los IMEI del lote
                        </p>
                        <button
                          type="button"
                          onClick={() => alternarSeleccionGrupoPago(lote.items)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-black tracking-[0.06em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
                        >
                          {grupoCompleto ? "QUITAR GRUPO" : "SELECCIONAR GRUPO"}
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {resumenImeis.visibles.map((item) => {
                          const seleccionado = idsSolicitudPago.includes(item.id);

                          return (
                            <button
                              type="button"
                              key={item.id}
                              onClick={() => alternarSeleccionSolicitudPago(item.id)}
                              aria-pressed={seleccionado}
                              title={`${item.referencia} · ${formatoPesos(item.costo)}`}
                              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                                seleccionado
                                  ? "border-[#e30613] bg-[#e30613] text-white shadow-sm"
                                  : "border-slate-300 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50"
                              }`}
                            >
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                                  seleccionado
                                    ? "border-white/70 bg-white text-[#e30613]"
                                    : "border-slate-300 bg-white text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                              {item.imei}
                            </button>
                          );
                        })}
                        {(resumenImeis.restantes > 0 || imeisExpandidos) && (
                          <button
                            type="button"
                            onClick={() => alternarImeisLote(expansionKey)}
                            className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-700"
                          >
                            {imeisExpandidos
                              ? "VER MENOS"
                              : `VER +${resumenImeis.restantes} MÁS`}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {lotesPagoPendiente.length > 0 && (
          <section className="mt-5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Lotes por recibir
                </div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                  Pagos agrupados para aprobar
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  Cada lote resume la sede que paga, la sede que recibe, los IMEIs incluidos y el valor total antes de confirmar.
                </p>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Total visible
                </p>
                <p className="mt-1 text-2xl font-black text-emerald-700">
                  {formatoPesos(
                    lotesPagoPendiente.reduce(
                      (acumulado, lote) => acumulado + lote.total,
                      0
                    )
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {lotesPagoPendiente.map((lote) => {
                const detalleAbierto = lotesDetalleAbiertos.includes(lote.key);
                const ids = lote.items.map((item) => item.id);
                const expansionKey = `pendiente:${lote.key}`;
                const imeisExpandidos = lotesImeisExpandidos.includes(expansionKey);
                const resumenImeis = imeisResumenLote(lote.items, imeisExpandidos);

                return (
                  <article
                    key={lote.key}
                    className="rounded-xl border border-slate-200 bg-slate-50/35 p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Lote de pago
                        </p>
                        <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                          {lote.destino} paga a {lote.origen}
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">
                          {lote.items.length} equipo
                          {lote.items.length === 1 ? "" : "s"} pendiente
                          {lote.items.length === 1 ? "" : "s"} de aprobacion
                          {" "}- Solicitado: {lote.fecha ? new Date(lote.fecha).toLocaleString("es-CO") : "-"}
                        </p>
                      </div>

                      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Valor a recibir
                        </p>
                        <p className="mt-1 text-2xl font-black text-emerald-700">
                          {formatoPesos(lote.total)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Recibe
                        </p>
                        <p className="mt-1 text-base font-black text-slate-950">
                          {lote.origen}
                        </p>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Paga
                        </p>
                        <p className="mt-1 text-base font-black text-slate-950">
                          {lote.destino}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-3xl border border-slate-200 bg-white px-4 py-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Resumen de IMEIs
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          {lote.items.length} serial
                          {lote.items.length === 1 ? "" : "es"} en el lote
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {resumenImeis.visibles.map((item) => (
                          <span
                            key={item.id}
                            title={`${item.referencia} · ${formatoPesos(item.costo)}`}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
                          >
                            {item.imei}
                          </span>
                        ))}
                        {(resumenImeis.restantes > 0 || imeisExpandidos) && (
                          <button
                            type="button"
                            onClick={() => alternarImeisLote(expansionKey)}
                            className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-700"
                          >
                            {imeisExpandidos
                              ? "VER MENOS"
                              : `VER +${resumenImeis.restantes} MÁS`}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => alternarDetalleLote(lote.key)}
                        className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                      >
                        {detalleAbierto ? "Ocultar detalle" : "Ver detalle"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void aprobarPagoPrestamoLote(ids)}
                        disabled={cargando}
                        className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
                      >
                        Aprobar lote
                      </button>
                    </div>

                    {detalleAbierto && (
                      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            <tr>
                              <th className="px-4 py-3">IMEI</th>
                              <th className="px-4 py-3">Referencia</th>
                              <th className="px-4 py-3 text-right">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lote.items.map((item) => (
                              <tr key={item.id} className="border-t border-slate-100">
                                <td className="px-4 py-3 font-semibold text-slate-950">
                                  {item.imei}
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {item.referencia}
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-slate-950">
                                  {formatoPesos(Number(item.montoPago || item.costo || 0))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                Solicitudes
              </div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                Préstamos registrados
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Consulta cada solicitud, revisa su estado y ejecuta acciones segun tu alcance.
              </p>
            </div>

            <span className="text-sm font-medium text-slate-500">
              {prestamosFiltrados.length} resultado(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1620px] text-sm">
              <thead className="sticky top-0 bg-[#f8fafc]">
                <tr className="border-b border-slate-200 text-left text-[12px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={todosPagablesVisiblesSeleccionados}
                      onChange={alternarSeleccionPagablesVisibles}
                      disabled={prestamosSeleccionablesPago.length === 0}
                      aria-label="Seleccionar prestamos pagables visibles"
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 disabled:opacity-40"
                    />
                  </th>
                  <th className="px-4 py-4">ID</th>
                  <th className="px-4 py-4">Equipo</th>
                  <th className="px-4 py-4">Tipo</th>
                  <th className="px-4 py-4">Flujo</th>
                  <th className="px-4 py-4">Estado</th>
                  <th className="px-4 py-4">Financiero</th>
                  <th className="px-4 py-4">Siguiente paso</th>
                  <th className="px-4 py-4">Accion</th>
                </tr>
              </thead>

              <tbody>
                {cargandoListado ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-slate-500">
                      <span className="inline-flex items-center gap-3 font-semibold">
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />
                        Cargando préstamos...
                      </span>
                    </td>
                  </tr>
                ) : prestamosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-slate-500">
                      No hay prestamos registrados en esta vista.
                    </td>
                  </tr>
                ) : (
                  prestamosFiltrados.map((item) => {
                    const paso = resolverSiguientePaso(item);
                    const origen = item.sedeOrigenNombre ?? "Sede sin configurar";
                    const destino = item.sedeDestinoNombre ?? "Sede sin configurar";

                    return (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 align-top text-slate-700 transition hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={idsSolicitudPago.includes(item.id)}
                            onChange={() => alternarSeleccionSolicitudPago(item.id)}
                            disabled={!puedeSolicitarPago(item)}
                            aria-label={`Seleccionar prestamo ${item.id}`}
                            className="h-4 w-4 rounded border-slate-300 text-slate-900 disabled:opacity-30"
                          />
                        </td>
                        <td className="px-4 py-4 font-bold text-slate-950">{item.id}</td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-950">{item.imei}</div>
                          <div className="mt-1 text-xs font-medium text-slate-500">
                            {item.referencia}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {item.color ?? "-"} | {formatoPesos(item.costo)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${claseTipoPrestamo(
                              item
                            )}`}
                          >
                            {item.prestamoDesdePrincipal ? "Bodega Principal" : "Entre sedes"}
                          </span>
                          <div className="mt-2 text-xs font-medium text-slate-500">
                            {item.prestamoDesdePrincipal
                              ? "Sin devolucion"
                              : "Permite devolucion segun estado"}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                              Origen
                            </p>
                            <p className="mt-1 font-semibold text-slate-900">{origen}</p>
                          </div>
                          <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                              Destino
                            </p>
                            <p className="mt-1 font-semibold text-slate-900">{destino}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${claseEstado(
                              item.estado
                            )}`}
                          >
                            {item.estado}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${claseFinanciera(
                              item.estadoFinancieroActual
                            )}`}
                          >
                            {item.estadoFinancieroActual ?? "-"}
                          </span>
                          <div className="mt-2 space-y-1 text-xs text-slate-500">
                            <p>
                              Debe a:{" "}
                              <span className="font-semibold text-slate-700">
                                {item.deboAActual ?? "-"}
                              </span>
                            </p>
                            <p>
                              Equipo:{" "}
                              <span className="font-semibold text-slate-700">
                                {item.estadoActualActual ?? "-"}
                              </span>
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className={`rounded-2xl border px-4 py-3 ${paso.tono}`}>
                            <p className="text-xs font-black uppercase tracking-[0.12em]">
                              {paso.titulo}
                            </p>
                            <p className="mt-2 text-xs leading-5">{paso.detalle}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {puedeSolicitarDevolucion(item) && (
                            <button
                              type="button"
                              onClick={() =>
                                void solicitarDevolucionPrestamo(item.id)
                              }
                              disabled={cargando}
                              className="rounded-xl bg-[#111318] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1d2330] disabled:opacity-70"
                            >
                              Solicitar devolucion
                            </button>
                          )}

                          {puedeAprobarDevolucion(item) && (
                            <button
                              type="button"
                              onClick={() =>
                                void aprobarDevolucionPrestamo(item.id)
                              }
                              disabled={cargando}
                              className="rounded-xl bg-[#111318] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1d2330] disabled:opacity-70"
                            >
                              Aprobar devolucion
                            </button>
                          )}

                          {puedeRechazarDevolucion(item) && (
                            <button
                              type="button"
                              onClick={() =>
                                void rechazarDevolucionPrestamo(item.id)
                              }
                              disabled={cargando}
                              className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-70"
                            >
                              Rechazar devolucion
                            </button>
                          )}

                          {puedeAprobarPrestamo(item) && (
                            <button
                              type="button"
                              onClick={() => void aprobarPrestamo(item.id)}
                              disabled={cargando}
                              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-70"
                            >
                              Aprobar
                            </button>
                          )}

                          {puedeRechazarPrestamo(item) && (
                            <button
                              type="button"
                              onClick={() =>
                                void cerrarPrestamoPendiente(item.id, "RECHAZADO")
                              }
                              disabled={cargando}
                              className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-70"
                            >
                              Rechazar
                            </button>
                          )}

                          {puedeCancelarPrestamo(item) && (
                            <button
                              type="button"
                              onClick={() =>
                                void cerrarPrestamoPendiente(item.id, "CANCELADO")
                              }
                              disabled={cargando}
                              className="rounded-xl bg-slate-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-70"
                            >
                              Cancelar
                            </button>
                          )}

                          {puedeSolicitarPago(item) && (
                            <button
                              type="button"
                              onClick={() => void solicitarPagoPrestamo(item.id)}
                              disabled={cargando}
                              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-70"
                            >
                              Solicitar pago
                            </button>
                          )}

                          {puedeAprobarPago(item) && idsEnLotesMultiples.has(item.id) && (
                            <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
                              Aprobar desde lote
                            </span>
                          )}

                          {puedeAprobarPago(item) && !idsEnLotesMultiples.has(item.id) && (
                            <button
                              type="button"
                              onClick={() => void aprobarPagoPrestamo(item.id)}
                              disabled={cargando}
                              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
                            >
                              Aprobar pago
                            </button>
                          )}

                          {!puedeSolicitarDevolucion(item) &&
                            !puedeAprobarDevolucion(item) &&
                            !puedeRechazarDevolucion(item) &&
                            !puedeAprobarPrestamo(item) &&
                            !puedeRechazarPrestamo(item) &&
                            !puedeCancelarPrestamo(item) &&
                            !puedeSolicitarPago(item) &&
                            !puedeAprobarPago(item) && (
                              <span className="text-xs font-medium text-slate-400">
                                Sin acciones
                              </span>
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
        </section>
        </main>
      </div>
    </div>
  );
}
