"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveRefresh } from "@/lib/use-live-refresh";

type PrestamoPendiente = {
  costo: number;
  creadoEn: string;
  id: number;
  imei: string;
  referencia: string;
  sedeOrigenNombre: string;
};

type PrestamosPendientesResponse = {
  items: PrestamoPendiente[];
  total: number;
};

const STORAGE_PREFIX = "conectamos:prestamos-destino-revisados";

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

export default function PendingLoanAlertModal({
  sessionKey,
}: {
  sessionKey: string;
}) {
  const [prestamos, setPrestamos] = useState<PrestamosPendientesResponse>({
    items: [],
    total: 0,
  });
  const [visible, setVisible] = useState(false);
  const storageKey = `${STORAGE_PREFIX}:${sessionKey}`;

  const cargarPendientes = useCallback(async () => {
    try {
      const response = await fetch("/api/prestamos/pendientes-destino", {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as PrestamosPendientesResponse;
      const items = Array.isArray(data.items) ? data.items : [];
      const total = Number(data.total || 0);
      const siguiente = { items, total };

      setPrestamos(siguiente);

      if (total <= 0 || items.length === 0) {
        setVisible(false);
        return;
      }

      const firmaActual = items
        .map((prestamo) => prestamo.id)
        .sort((a, b) => a - b)
        .join(",");

      if (window.sessionStorage.getItem(storageKey) !== firmaActual) {
        setVisible(true);
      }
    } catch {
      // La alerta no debe bloquear el dashboard si la consulta temporalmente falla.
    }
  }, [storageKey]);

  useLiveRefresh(cargarPendientes, {
    intervalMs: 30000,
    runOnMount: true,
  });

  const firmaActual = useMemo(
    () =>
      prestamos.items
        .map((prestamo) => prestamo.id)
        .sort((a, b) => a - b)
        .join(","),
    [prestamos.items]
  );

  const cerrar = useCallback(() => {
    if (firmaActual) {
      window.sessionStorage.setItem(storageKey, firmaActual);
    }
    setVisible(false);
  }, [firmaActual, storageKey]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const overflowAnterior = document.body.style.overflow;
    const cerrarConEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cerrar();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", cerrarConEscape);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", cerrarConEscape);
    };
  }, [cerrar, visible]);

  if (!visible) {
    return null;
  }

  const visibles = prestamos.items.slice(0, 6);
  const adicionales = Math.max(0, prestamos.total - visibles.length);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 px-4 py-6 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-alerta-prestamo"
        className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_35px_100px_rgba(15,23,42,0.32)]"
      >
        <header className="bg-[linear-gradient(135deg,#0f172a_0%,#172554_58%,#0f766e_100%)] px-6 py-6 text-white sm:px-8">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
                Aprobacion pendiente
              </p>
              <h2
                id="titulo-alerta-prestamo"
                className="mt-3 text-2xl font-black tracking-normal sm:text-3xl"
              >
                Tienes {prestamos.total} {prestamos.total === 1 ? "equipo" : "equipos"} por recibir
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
                Otra sede envio este inventario. Revisa los datos y aprueba o rechaza el prestamo antes de operarlo.
              </p>
            </div>

            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar alerta de prestamo"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-black text-white transition hover:bg-white/20"
            >
              X
            </button>
          </div>
        </header>

        <div className="max-h-[52vh] space-y-2 overflow-y-auto bg-slate-50 p-4 sm:p-6">
          {visibles.map((prestamo) => (
            <article
              key={prestamo.id}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-800">
                    Prestamo #{prestamo.id}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    Envia: {prestamo.sedeOrigenNombre}
                  </span>
                </div>
                <p className="mt-2 truncate text-sm font-black text-slate-950 sm:text-base">
                  {prestamo.referencia}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  IMEI {prestamo.imei}
                </p>
              </div>
              <p className="text-base font-black text-slate-950">
                {formatoPesos(prestamo.costo)}
              </p>
            </article>
          ))}

          {adicionales > 0 && (
            <p className="px-2 pt-2 text-center text-sm font-semibold text-slate-500">
              Hay {adicionales} {adicionales === 1 ? "equipo adicional" : "equipos adicionales"} en la bandeja de prestamos.
            </p>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={cerrar}
            className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            Recordar despues
          </button>
          <Link
            href="/prestamos"
            onClick={cerrar}
            className="rounded-2xl bg-slate-950 px-6 py-3 text-center text-sm font-black text-white transition hover:bg-slate-800"
          >
            Revisar y aprobar
          </Link>
        </footer>
      </section>
    </div>
  );
}
