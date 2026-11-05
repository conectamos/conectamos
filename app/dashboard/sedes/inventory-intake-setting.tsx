"use client";

import { useEffect, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import styles from "./sedes.module.css";

const ENDPOINT = "/api/admin/inventario-ingreso";

async function leerPermiso(response: Response, mensajeError: string) {
  const data: { habilitado?: unknown; error?: unknown } | null = await response.json().catch(() => null);
  if (!response.ok || typeof data?.habilitado !== "boolean") {
    throw new Error(typeof data?.error === "string" ? data.error : mensajeError);
  }
  return data.habilitado;
}

export default function InventoryIntakeSetting() {
  const [habilitado, setHabilitado] = useState<boolean | null>(null);
  const [intento, setIntento] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const guardandoRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function cargar() {
      try {
        const response = await fetch(ENDPOINT, { cache: "no-store", signal: controller.signal });
        const permiso = await leerPermiso(response, "No se pudo consultar el permiso de ingreso.");
        if (!controller.signal.aborted) setHabilitado(permiso);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "No se pudo consultar el permiso de ingreso.");
        }
      }
    }
    void cargar();
    return () => controller.abort();
  }, [intento]);

  async function cambiarPermiso() {
    if (habilitado === null || guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true);
    setError("");
    try {
      const nuevoPermiso = !habilitado;
      const response = await fetch(ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habilitado: nuevoPermiso }),
      });
      const permiso = await leerPermiso(response, "No se pudo confirmar el cambio de permiso.");
      if (permiso !== nuevoPermiso) throw new Error("No se pudo confirmar el cambio de permiso.");
      setHabilitado(permiso);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo confirmar el cambio de permiso.");
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  }

  return (
    <section className={`${styles.catalogCard} ${styles.inventoryAccess}`} aria-labelledby="inventory-intake-title">
      <span className={styles.catalogIcon}><DashboardIcon name="lock" /></span>
      <div>
        <h2 id="inventory-intake-title">Ingreso directo de inventario</h2>
        <p>
          Permite a supervisores y accesos operativos de sede registrar equipos directamente en su propia sede.
          Bodega principal registra y despacha equipos a las sedes.
        </p>
        <div className={styles.inventoryAccessStatus} role="status">
          {habilitado === null ? (
            error ? "Estado no disponible" : "Consultando permiso…"
          ) : (
            <span className={`${styles.state} ${habilitado ? styles.active : styles.inactive}`}>
              <i aria-hidden="true" />
              {habilitado ? "Habilitado" : "Deshabilitado"}
            </span>
          )}
        </div>
        {error && <p className={styles.inventoryAccessError} role="alert">{error}</p>}
      </div>
      {habilitado === null ? (
        error && (
          <button type="button" className={styles.button} onClick={() => {
            setError("");
            setIntento((actual) => actual + 1);
          }}>
            Reintentar
          </button>
        )
      ) : (
        <button
          type="button"
          className={`${styles.button} ${habilitado ? "" : styles.primary}`}
          disabled={guardando}
          onClick={() => void cambiarPermiso()}
        >
          {guardando ? "Guardando…" : habilitado ? "Deshabilitar" : "Habilitar"}
        </button>
      )}
    </section>
  );
}
