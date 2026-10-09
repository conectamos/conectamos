"use client";

import Link from "next/link";
import Image from "next/image";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import LoanDialog from "./_components/loan-dialog";
import { LOAN_TABS, prestamoEnPestana, textoEstadoPrestamo, paginasPrestamos, numerosPaginaPrestamos, type LoanTab } from "@/lib/loans-dashboard-view";
import styles from "./loans.module.css";
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
  const [pestana, setPestana] = useState<LoanTab>("Todos");
  const [soloPagables, setSoloPagables] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [filasPorPagina, setFilasPorPagina] = useState(5);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [confirmacionPago, setConfirmacionPago] = useState<{ tipo: "solicitar" | "aprobar"; ids: number[] } | null>(null);
  const solicitudListado = useRef(0);

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
    const solicitud = ++solicitudListado.current;
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

      if (solicitud !== solicitudListado.current) return;
      setPrestamos(data);
      setIdsSolicitudPago((actuales) => actuales.filter((id) => data.some((item: Prestamo) =>
        item.id === id && item.estado === "APROBADO" && Boolean(item.requiereAprobacionEntreSedes) && (esAdmin || user?.sedeId === item.sedeDestinoId))));
      setMensaje((actual) =>
        actual === "Error cargando prestamos" || actual === "Error cargando sesion"
          ? ""
          : actual
      );
    } catch {
      if (solicitud === solicitudListado.current) setMensaje("Error cargando prestamos");
    } finally {
      if (solicitud === solicitudListado.current) setCargandoListado(false);
    }
  }, [esAdmin, sedeFiltroId, user?.sedeId]);

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
    if (seleccionados.length !== ids.length || !seleccionados.every(puedeSolicitarPago)) {
      setMensaje("Error: la selección contiene préstamos que ya no son elegibles para pago");
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

  const prestamosConsulta = useMemo(() => {
    return prestamos
      .filter((prestamo) => prestamoEnPestana(prestamo.estado, pestana))
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
  }, [prestamos, filtroEstado, busqueda, pestana]);
  const prestamosFiltrados = soloPagables
    ? prestamosConsulta.filter(puedeSolicitarPago)
    : prestamosConsulta;
  const totalPaginas = paginasPrestamos(prestamosFiltrados.length, filasPorPagina);
  const paginaActual = Math.min(pagina, totalPaginas);

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
  const totalSolicitudPagoSeleccionada =
    prestamosSolicitudPagoSeleccionados.reduce(
      (acumulado, prestamo) => acumulado + Number(prestamo.costo || 0),
      0
    );
  const todosDisponiblesSeleccionados = prestamosSeleccionablesPago.length > 0 &&
    prestamosSeleccionablesPago.every((item) => idsSolicitudPago.includes(item.id));
  const seleccionarDisponibles = () => {
    if (cargando || cargandoListado || prestamosSeleccionablesPago.length === 0) return;
    const ids = prestamosSeleccionablesPago.map((item) => item.id);
    setIdsSolicitudPago((actuales) => todosDisponiblesSeleccionados
      ? actuales.filter((id) => !ids.includes(id))
      : Array.from(new Set([...actuales, ...ids])));
  };
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
    if (cargando || !idsSolicitudPagoValidos.has(id)) return;
    setIdsSolicitudPago((actuales) =>
      actuales.includes(id)
        ? actuales.filter((itemId) => itemId !== id)
        : [...actuales, id]
    );
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
  const prestamosPagina = prestamosFiltrados.slice((paginaActual - 1) * filasPorPagina, paginaActual * filasPorPagina);
  const pagablesPagina = prestamosPagina.filter(puedeSolicitarPago);
  const todosPagablesPaginaSeleccionados = pagablesPagina.length > 0 && pagablesPagina.every((item) => idsSolicitudPago.includes(item.id));
  const seleccionarPagina = () => {
    const ids = pagablesPagina.map((item) => item.id);
    setIdsSolicitudPago((actuales) => todosPagablesPaginaSeleccionados
      ? actuales.filter((id) => !ids.includes(id)) : Array.from(new Set([...actuales, ...ids])));
  };
  const cambiarConsulta = () => { setPagina(1); setIdsSolicitudPago([]); setDetalleId(null); };
  const mostrarDisponiblesPago = () => { cambiarConsulta(); setSoloPagables(true); };
  const quitarFiltroDisponibles = () => { cambiarConsulta(); setSoloPagables(false); };
  const motivoNoSeleccionPago = (item: Prestamo) => {
    if (puedeSolicitarPago(item)) return "";
    if (item.estado !== "APROBADO") return `No disponible para pago: préstamo ${textoEstadoPrestamo(item.estado).toLowerCase()}.`;
    if (!item.requiereAprobacionEntreSedes) return "No tiene un pago entre sedes disponible. La deuda con proveedor se gestiona desde Inventario.";
    return "Solo la sede destino o un administrador pueden solicitar este pago.";
  };
  const accionesPrestamo = (item: Prestamo) => [
    { label: "Solicitar devolución", allowed: puedeSolicitarDevolucion(item), run: () => solicitarDevolucionPrestamo(item.id) },
    { label: "Aprobar devolución", allowed: puedeAprobarDevolucion(item), run: () => aprobarDevolucionPrestamo(item.id) },
    { label: "Rechazar devolución", allowed: puedeRechazarDevolucion(item), run: () => rechazarDevolucionPrestamo(item.id) },
    { label: "Aprobar préstamo", allowed: puedeAprobarPrestamo(item), run: () => aprobarPrestamo(item.id) },
    { label: "Rechazar préstamo", allowed: puedeRechazarPrestamo(item), run: () => cerrarPrestamoPendiente(item.id, "RECHAZADO") },
    { label: "Cancelar préstamo", allowed: puedeCancelarPrestamo(item), run: () => cerrarPrestamoPendiente(item.id, "CANCELADO") },
    { label: "Solicitar pago", allowed: puedeSolicitarPago(item), run: () => solicitarPagoPrestamo(item.id) },
    { label: "Aprobar pago", allowed: puedeAprobarPago(item) && !idsEnLotesMultiples.has(item.id), run: () => aprobarPagoPrestamo(item.id) },
  ].filter((action) => action.allowed);
  const tonoEstado = (estado: string) => {
    if (["APROBADO", "PAGADO", "FINALIZADO", "DEVUELTO", "PAGO"].includes(estado)) return styles.dotGreen;
    if (["PENDIENTE", "PAGO_PENDIENTE_APROBACION", "DEVOLUCION_PENDIENTE", "DEUDA"].includes(estado)) return styles.dotAmber;
    if (estado === "RECHAZADO") return styles.dotRed;
    return styles.dotGray;
  };
  const itemsConfirmacion = confirmacionPago ? prestamos.filter((item) => confirmacionPago.ids.includes(item.id)) : [];
  const confirmacionValida = Boolean(confirmacionPago && itemsConfirmacion.length > 0 && itemsConfirmacion.length === confirmacionPago.ids.length &&
    itemsConfirmacion.every(confirmacionPago.tipo === "solicitar" ? puedeSolicitarPago : puedeAprobarPago));
  const gruposConfirmacion = Array.from(itemsConfirmacion.reduce((mapa, item) => {
    const key = `${item.sedeOrigenId}:${item.sedeDestinoId}`;
    mapa.set(key, [...(mapa.get(key) || []), item]); return mapa;
  }, new Map<string, Prestamo[]>()).values());
  const valorConfirmacion = (item: Prestamo) => Number(confirmacionPago?.tipo === "aprobar" ? item.montoPago || item.costo || 0 : item.costo || 0);
  const totalConfirmacion = itemsConfirmacion.reduce((total, item) => total + valorConfirmacion(item), 0);
  const confirmarPago = async () => {
    if (!confirmacionPago || !confirmacionValida || cargando || cargandoListado) return;
    if (confirmacionPago.tipo === "solicitar") await solicitarPagoPrestamoLote(confirmacionPago.ids);
    else await aprobarPagoPrestamoLote(confirmacionPago.ids);
    setConfirmacionPago(null);
  };

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS · Inicio"><Image src="/branding/conectamos-logo.png" width={44} height={44} alt="" priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">
        {navigationItems.map((item) => <Link key={item.href} href={item.href} aria-current={item.href === "/prestamos" ? "page" : undefined}
          aria-label={item.label} title={item.label} className={`${styles.navItem} ${item.href === "/prestamos" ? styles.navActive : ""} ${item.icon === "settings" ? styles.settingsLink : ""}`}>
          {item.icon === "settings" ? <DashboardIcon name="settings" /> : item.label}
        </Link>)}
      </nav>
      <SalesProfile name={user?.nombre || user?.usuario || "Cargando usuario"} role={user?.rolNombre || "Sesión activa"} />
    </header>
    <main className={styles.main}>
      <header className={styles.heading}>
        <div className={styles.headingCopy}><h1>Préstamos</h1><p>Control entre sedes y bodega principal</p></div>
        <div className={styles.headingActions}><Link href="/prestamos/nuevo" className={`${styles.button} ${styles.primary}`}><span aria-hidden="true">＋</span>Nuevo préstamo</Link><Link href="/inventario" className={`${styles.button} ${styles.outline}`}>Ver inventario</Link></div>
      </header>
      {mensaje && <div role={mensajeEsError ? "alert" : "status"} className={`${styles.message} ${mensajeEsError ? styles.error : ""}`}>{mensaje}</div>}
      <section className={styles.summary} aria-label={`Resumen de préstamos · ${sedeFiltroNombre}`} aria-busy={cargandoListado}>
        <div className={styles.summaryValue}><strong>{cargandoListado ? "—" : formatoPesos(valorTotalPrestamos)}</strong><span>Valor total en préstamos</span></div>
        {[
          ["Total", totalPrestamos], ["Bodega principal", totalDesdePrincipal], ["Entre sedes", totalEntreSedes],
          ["Pendientes", totalPendientes], ["Pago pendiente", totalPagoPendiente], ["Finalizados", totalFinalizados],
        ].map(([label, value]) => <div className={styles.summaryMetric} key={label}><strong>{cargandoListado ? "—" : Number(value).toLocaleString("es-CO")}</strong><span>{label}</span></div>)}
      </section>
      <section className={styles.panel} aria-label="Préstamos registrados">
        <div className={styles.filterBar}>
          <div className={styles.tabs} role="tablist" aria-label="Estado de los préstamos">{LOAN_TABS.map((tab) => <button key={tab} type="button" role="tab" aria-selected={pestana === tab} aria-controls="prestamos-listado"
            className={`${styles.tab} ${pestana === tab ? styles.tabActive : ""}`} onClick={() => { cambiarConsulta(); setSoloPagables(false); setPestana(tab); setFiltroEstado("TODOS"); }}>{tab}</button>)}</div>
          <div className={styles.filters}>
            {esAdmin ? <select aria-label="Filtrar por sede" value={sedeFiltroId} disabled={cargando} onChange={(event) => { cambiarConsulta(); setPrestamos([]); setMensaje(""); setCargandoListado(true); setSedeFiltroId(event.target.value); }}><option value="TODAS">Todas las sedes</option>{sedes.map((sede) => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}</select>
              : <span aria-label="Cobertura">{user?.sedeNombre || "Tu sede"}</span>}
            <select aria-label="Filtrar por estado" value={filtroEstado} onChange={(event) => { cambiarConsulta(); setSoloPagables(false); setPestana("Todos"); setFiltroEstado(event.target.value); }}>
              {estadosFiltro.map((estado) => <option key={estado} value={estado}>{estado === "TODOS" ? "Todos los estados" : textoEstadoPrestamo(estado)}</option>)}
            </select>
          </div>
        </div>
        <div className={styles.searchLine}><label className={styles.search}><DashboardIcon name="search" /><input aria-label="Buscar préstamos" placeholder="Buscar por IMEI, referencia o sede" value={busqueda} onChange={(event) => { cambiarConsulta(); setBusqueda(event.target.value); }} /></label><span className={styles.resultCount} aria-live="polite">{cargandoListado ? "Cargando…" : `${prestamosFiltrados.length.toLocaleString("es-CO")} registros`}</span></div>
        {soloPagables && <div className={styles.availableFilter} role="status"><span>Mostrando solo disponibles para pago</span><button type="button" onClick={quitarFiltroDisponibles} aria-label="Quitar filtro de disponibles">Mostrar todos <DashboardIcon name="close" /></button></div>}
        <div id="prestamos-listado" role="tabpanel" aria-label={pestana} className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th className={styles.selectionCell}><input type="checkbox" aria-label="Seleccionar préstamos pagables visibles" checked={todosPagablesPaginaSeleccionados} disabled={cargando || cargandoListado || pagablesPagina.length === 0} onChange={seleccionarPagina} /></th><th>Equipo e IMEI</th><th>Origen</th><th>Destino</th><th>Estado</th><th>Financiero</th><th>Acciones</th></tr></thead>
            <tbody>{cargandoListado ? <tr><td colSpan={7} className={styles.empty} role="status">Cargando préstamos…</td></tr>
              : prestamosPagina.length === 0 ? <tr><td colSpan={7} className={styles.empty}>No hay préstamos registrados en esta vista.</td></tr>
              : prestamosPagina.map((item) => {
                const abierto = detalleId === item.id;
                const actions = accionesPrestamo(item);
                const paso = resolverSiguientePaso(item);
                return <Fragment key={item.id}>
                  <tr className={styles.loanRow}>
                    <td data-label="Seleccionar" className={styles.selectionCell}><span title={motivoNoSeleccionPago(item)}><input type="checkbox" aria-label={`Seleccionar préstamo ${item.id}`} title={motivoNoSeleccionPago(item)} checked={idsSolicitudPago.includes(item.id) && idsSolicitudPagoValidos.has(item.id)} disabled={cargando || !puedeSolicitarPago(item)} onChange={() => alternarSeleccionSolicitudPago(item.id)} /></span></td>
                    <td data-label="Equipo e IMEI"><div className={styles.equipment}><span className={styles.phoneIcon} aria-hidden="true"><svg viewBox="0 0 28 42" fill="none"><rect x="4" y="2" width="20" height="38" rx="4" stroke="currentColor" strokeWidth="1.7" /><path d="M10 2v3h8V2" stroke="currentColor" strokeWidth="1.7" /></svg></span><div className={styles.equipmentCopy}><strong>{item.referencia}</strong><p>IMEI <span>{item.imei}</span></p><p>{item.color || "Sin color"} · ID {item.id}</p></div></div></td>
                    <td data-label="Origen">{item.sedeOrigenNombre ?? "Sede sin configurar"}</td><td data-label="Destino">{item.sedeDestinoNombre ?? "Sede sin configurar"}</td>
                    <td data-label="Estado"><span className={styles.status}><i className={`${styles.dot} ${tonoEstado(item.estado)}`} />{textoEstadoPrestamo(item.estado)}</span></td>
                    <td data-label="Financiero"><div><span className={styles.status}><i className={`${styles.dot} ${tonoEstado(item.estadoFinancieroActual || "")}`} />{textoEstadoPrestamo(item.estadoFinancieroActual || "")}</span>{item.estadoActualActual && <p className={styles.muted}>Equipo {textoEstadoPrestamo(item.estadoActualActual).toLowerCase()}</p>}</div></td>
                    <td data-label="Acciones"><div className={styles.rowActions}><button id={`abrir-prestamo-${item.id}`} type="button" className={styles.detailButton} aria-label={`${abierto ? "Cerrar" : "Ver"} detalle del préstamo ${item.id}`} aria-expanded={abierto} aria-controls={`detalle-prestamo-${item.id}`} onClick={() => setDetalleId(abierto ? null : item.id)}>{abierto ? "Cerrar detalle" : "Ver detalle"}</button></div></td>
                  </tr>
                  {abierto && <tr className={styles.detailRow} id={`detalle-prestamo-${item.id}`}><td colSpan={7}>
                    <section className={styles.detail} aria-label={`Detalle del préstamo ${item.id}`}>
                      <div className={styles.detailHeading}><h3>Detalle del préstamo #{item.id}</h3><button type="button" aria-label={`Cerrar detalle del préstamo ${item.id}`} onClick={() => { setDetalleId(null); document.getElementById(`abrir-prestamo-${item.id}`)?.focus(); }}><DashboardIcon name="close" /></button></div>
                      <dl className={styles.detailGrid}>
                        <div><dt>Equipo / IMEI</dt><dd>{item.referencia}<br />{item.imei}</dd></div><div><dt>Color</dt><dd>{item.color || "Sin color"}</dd></div>
                        <div><dt>Costo</dt><dd>{formatoPesos(item.costo)}</dd></div><div><dt>Tipo</dt><dd>{item.prestamoDesdePrincipal ? "Bodega principal · Sin devolución" : "Entre sedes"}</dd></div>
                        <div><dt>Origen</dt><dd>{item.sedeOrigenNombre ?? "Sede sin configurar"}</dd></div><div><dt>Destino</dt><dd>{item.sedeDestinoNombre ?? "Sede sin configurar"}</dd></div>
                        <div><dt>Estado del préstamo</dt><dd>{textoEstadoPrestamo(item.estado)}</dd></div><div><dt>Estado del equipo</dt><dd>{item.estadoActualActual || "Sin información"}</dd></div>
                        <div><dt>Debe a</dt><dd>{item.deboAActual || "Sin información"}</dd></div><div><dt>Estado financiero</dt><dd>{item.estadoFinancieroActual || "Sin información"}</dd></div>
                        <div><dt>Monto de pago</dt><dd>{item.montoPago == null ? "Sin solicitud" : formatoPesos(Number(item.montoPago))}</dd></div><div><dt>Solicitud de pago</dt><dd>{item.fechaSolicitudPago ? new Date(item.fechaSolicitudPago).toLocaleString("es-CO") : "Sin solicitud"}</dd></div>
                      </dl>
                      <p><strong>{paso.titulo}.</strong> {paso.detalle}</p>
                      {!puedeSolicitarPago(item) && <p className={styles.muted}>{motivoNoSeleccionPago(item)}</p>}
                      <div className={styles.detailActions}>{actions.map((action) => <button key={action.label} type="button" className={styles.button} disabled={cargando || cargandoListado} onClick={() => void action.run()}>{action.label}</button>)}
                        {puedeAprobarPago(item) && idsEnLotesMultiples.has(item.id) && <button type="button" className={`${styles.button} ${styles.primary}`} disabled={cargando || cargandoListado} onClick={() => {
                          const lote = lotesPagoPendiente.find((group) => group.items.some((loan) => loan.id === item.id));
                          if (lote) setConfirmacionPago({ tipo: "aprobar", ids: lote.items.map((loan) => loan.id) });
                        }}>Revisar y aprobar lote</button>}
                        {actions.length === 0 && !puedeAprobarPago(item) && <span className={styles.muted}>Sin acciones disponibles para tu rol en este estado.</span>}
                      </div>
                    </section>
                  </td></tr>}
                </Fragment>;
              })}</tbody>
          </table>
        </div>
      </section>
      <section className={styles.batchBar} aria-label="Pago por lote">
        <div className={styles.batchAvailable}><input type="checkbox" aria-label={`Seleccionar todos los disponibles para pago (${prestamosSeleccionablesPago.length})`} aria-describedby="alcance-seleccion-disponibles" checked={todosDisponiblesSeleccionados} disabled={cargando || cargandoListado || prestamosSeleccionablesPago.length === 0} onChange={seleccionarDisponibles} /><button type="button" className={styles.availableButton} aria-label="Ver disponibles para pago" aria-pressed={soloPagables} disabled={cargando || cargandoListado || prestamosSeleccionablesPago.length === 0} onClick={mostrarDisponiblesPago}><span><strong>{prestamosSeleccionablesPago.length.toLocaleString("es-CO")}</strong> disponibles para pago</span><small id="alcance-seleccion-disponibles">Ver disponibles · selección en todas las páginas</small></button></div>
        <div className={styles.batchSelected}><strong>{prestamosSolicitudPagoSeleccionados.length}</strong> seleccionados</div>
        <div className={styles.batchTotal}><span>Total</span><strong>{formatoPesos(totalSolicitudPagoSeleccionada)}</strong></div>
        <div className={styles.batchActions}><button type="button" className={styles.textButton} title="Selecciona únicamente los préstamos elegibles de la página actual" onClick={seleccionarPagina} disabled={cargando || cargandoListado || pagablesPagina.length === 0}>{todosPagablesPaginaSeleccionados ? "Quitar visibles" : "Seleccionar visibles"}</button><button type="button" className={styles.button} onClick={limpiarSeleccionSolicitudPago} disabled={cargando || prestamosSolicitudPagoSeleccionados.length === 0}>Limpiar</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={cargando || cargandoListado || prestamosSolicitudPagoSeleccionados.length === 0} onClick={() => setConfirmacionPago({ tipo: "solicitar", ids: prestamosSolicitudPagoSeleccionados.map((item) => item.id) })}>{cargando ? "Procesando…" : "Enviar a pagar"}</button></div>
      </section>
      <footer className={styles.pagination}>
        <span>{cargandoListado ? "Cargando registros…" : `Mostrando ${prestamosFiltrados.length ? (paginaActual - 1) * filasPorPagina + 1 : 0}–${Math.min(paginaActual * filasPorPagina, prestamosFiltrados.length)} de ${prestamosFiltrados.length.toLocaleString("es-CO")}`}</span>
        <label>Filas por página <select aria-label="Filas por página" value={filasPorPagina} onChange={(event) => { setFilasPorPagina(Number(event.target.value)); setPagina(1); }}>{[5, 10, 25, 50].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <nav aria-label="Páginas de préstamos"><button type="button" className={styles.pageButton} aria-label="Página anterior" disabled={paginaActual <= 1} onClick={() => setPagina(paginaActual - 1)}><DashboardIcon name="chevron" /></button>
          {numerosPaginaPrestamos(paginaActual, totalPaginas).map((value, index, numbers) => <Fragment key={value}>{index > 0 && value - numbers[index - 1] > 1 && <span aria-hidden="true">…</span>}<button type="button" className={`${styles.pageButton} ${value === paginaActual ? styles.pageActive : ""}`} aria-current={value === paginaActual ? "page" : undefined} aria-label={`Página ${value}`} onClick={() => setPagina(value)}>{value}</button></Fragment>)}
          <button type="button" className={styles.pageButton} aria-label="Página siguiente" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(paginaActual + 1)}><DashboardIcon name="chevron" /></button></nav>
      </footer>
        {lotesPagoPendiente.length > 0 && <details className={styles.pendingGroups}>
          <summary className={styles.pendingSummary}>Pagos agrupados para aprobar · {lotesPagoPendiente.length} {lotesPagoPendiente.length === 1 ? "lote" : "lotes"} · {formatoPesos(lotesPagoPendiente.reduce((total, lote) => total + lote.total, 0))}</summary>
          {lotesPagoPendiente.map((lote) => {
            const expansionKey = `pendiente:${lote.key}`;
            const expandido = lotesImeisExpandidos.includes(expansionKey);
            const resumen = imeisResumenLote(lote.items, expandido);
            return <article key={lote.key} className={styles.pendingGroup}>
              <div className={styles.groupHeading}><div><h3>{lote.destino} paga a {lote.origen}</h3><p>{lote.items.length} equipos · Solicitado: {lote.fecha ? new Date(lote.fecha).toLocaleString("es-CO") : "Sin fecha"}</p></div><strong>{formatoPesos(lote.total)}</strong></div>
              <div className={styles.groupEquipment}>{resumen.visibles.map((item) => <span key={item.id}>{item.imei}</span>)}{(resumen.restantes > 0 || expandido) && <button type="button" className={styles.textButton} onClick={() => alternarImeisLote(expansionKey)}>{expandido ? "Ver menos" : `Ver ${resumen.restantes} más`}</button>}</div>
              <div className={styles.detailActions}><button type="button" className={styles.button} onClick={() => alternarDetalleLote(lote.key)}>{lotesDetalleAbiertos.includes(lote.key) ? "Ocultar detalle del lote" : "Ver detalle del lote"}</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={cargando || cargandoListado} onClick={() => setConfirmacionPago({ tipo: "aprobar", ids: lote.items.map((item) => item.id) })}>Aprobar lote</button></div>
              {lotesDetalleAbiertos.includes(lote.key) && <div className={styles.groupEquipment}>{lote.items.map((item) => <p key={item.id}><strong>{item.referencia}</strong> · IMEI {item.imei} · {formatoPesos(Number(item.montoPago || item.costo || 0))}</p>)}</div>}
            </article>;
          })}
        </details>}
      {lotesSolicitudPago.length > 0 && <details className={styles.pendingGroups}>
        <summary className={styles.pendingSummary}>Selección por destinatario · {lotesConSeleccionPago.length} grupos seleccionados</summary>
        {lotesSolicitudPago.map((lote) => <section key={lote.key} className={styles.pendingGroup}>
          <div className={styles.groupHeading}><div><h3>{lote.destino} paga a {lote.origen}</h3><p>{lote.items.length} disponibles · {lote.seleccionados.length} seleccionados</p></div><strong>{formatoPesos(lote.totalSeleccionado)}</strong></div>
          <div className={styles.detailActions}><button type="button" className={styles.button} disabled={cargando || cargandoListado} onClick={() => alternarSeleccionGrupoPago(lote.items)}>{lote.seleccionados.length === lote.items.length ? "Quitar grupo" : "Seleccionar grupo"}</button></div>
          <div className={styles.groupEquipment}>{lote.items.map((item) => <label key={item.id}><input type="checkbox" checked={idsSolicitudPago.includes(item.id)} disabled={cargando || cargandoListado} onChange={() => alternarSeleccionSolicitudPago(item.id)} />{item.referencia} · IMEI {item.imei} · {formatoPesos(item.costo)}</label>)}</div>
        </section>)}
      </details>}
    </main>
    {confirmacionPago && <LoanDialog title={confirmacionPago.tipo === "solicitar" ? "Confirmar envío a pagar" : "Confirmar aprobación de pago"} open busy={cargando} onClose={() => setConfirmacionPago(null)} footer={<><button type="button" className={styles.button} disabled={cargando} onClick={() => setConfirmacionPago(null)}>Cancelar</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={cargando || cargandoListado || !confirmacionValida} onClick={() => void confirmarPago()}>{cargando ? "Procesando…" : confirmacionPago.tipo === "solicitar" ? "Confirmar envío" : "Confirmar aprobación"}</button></>}>
      <p>{itemsConfirmacion.length} equipos · Total <strong>{formatoPesos(totalConfirmacion)}</strong></p>
      {!confirmacionValida && <p role="alert" className={styles.error}>La elegibilidad de la selección cambió. Cierra esta ventana y revisa los préstamos.</p>}
      {gruposConfirmacion.map((items) => <section className={styles.confirmationGroup} key={`${items[0].sedeOrigenId}:${items[0].sedeDestinoId}`}><h3>{items[0].sedeDestinoNombre} paga a {items[0].sedeOrigenNombre}</h3><p>{items.length} equipos · {formatoPesos(items.reduce((total, item) => total + valorConfirmacion(item), 0))}</p><ul>{items.map((item) => <li key={item.id}><div><strong>{item.referencia}</strong><span>IMEI {item.imei}</span></div><strong>{formatoPesos(valorConfirmacion(item))}</strong></li>)}</ul></section>)}
    </LoanDialog>}
  </div>;
}
