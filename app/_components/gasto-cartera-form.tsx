"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { triggerLiveRefresh } from "@/lib/use-live-refresh";
import styles from "./gasto-cartera-form.module.css";

type Sede = { id: number; nombre: string };
type SessionUser = { id: number; nombre: string; usuario: string; sedeId: number; sedeNombre: string; rolId: number; rolNombre: string };
type GastoCarteraFormProps = { backHref?: string; badgeLabel?: string; detailHref?: string | null; description?: string };
type PendingRequest = { key: string; payload: { valor: number; observacion: string; sedeId: number } };
type Notice = { text: string; error: boolean } | null;

function limpiarNumero(value: string) {
  const limpio = value.replace(/[^\d-]/g, "");
  return limpio.startsWith("-") ? `-${limpio.slice(1).replace(/-/g, "")}` : limpio.replace(/-/g, "");
}
function formatoNumero(value: string | number) {
  const numero = Number(value || 0);
  return Number.isFinite(numero) ? numero.toLocaleString("es-CO") : "0";
}
function storageKey(userId: number) { return `conectamos:gasto-cartera:pendiente:${userId}`; }
function storePending(userId: number, request: PendingRequest | null) {
  try {
    if (request) sessionStorage.setItem(storageKey(userId), JSON.stringify(request));
    else sessionStorage.removeItem(storageKey(userId));
  } catch { /* The same request key is retained in memory when storage is unavailable. */ }
}

export default function GastoCarteraForm({
  backHref = "/dashboard",
  detailHref = "/dashboard/financiero/cartera/detalle",
  description = "Completa los datos del movimiento.",
}: GastoCarteraFormProps) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeId, setSedeId] = useState("");
  const [valor, setValor] = useState("");
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [initError, setInitError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const guardandoRef = useRef(false);
  const requestRef = useRef<PendingRequest | null>(null);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const resUser = await fetch("/api/session", { cache: "no-store" });
        const dataUser = await resUser.json();
        if (!resUser.ok || !dataUser.id) throw new Error(dataUser.error || "No se pudo cargar la sesión.");
        let dataSedes: Sede[] = [];
        if (["ADMIN", "AUDITOR"].includes(String(dataUser.rolNombre || "").toUpperCase())) {
          const resSedes = await fetch("/api/sedes", { cache: "no-store" });
          const result = await resSedes.json();
          if (!resSedes.ok || !Array.isArray(result)) throw new Error("No se pudieron cargar las sedes. Recarga la página.");
          dataSedes = result;
        }
        if (!active) return;
        setUser(dataUser); setSedes(dataSedes); setSedeId(String(dataUser.sedeId || ""));
        try {
          const saved = JSON.parse(sessionStorage.getItem(storageKey(dataUser.id)) || "null") as PendingRequest | null;
          if (saved && typeof saved.key === "string" && saved.key.length >= 8 && saved.payload && Number.isFinite(saved.payload.valor) && saved.payload.valor > 0 && Number.isInteger(saved.payload.sedeId) && typeof saved.payload.observacion === "string") {
            requestRef.current = saved; setPending(true);
            setSedeId(String(saved.payload.sedeId)); setValor(String(saved.payload.valor)); setObservacion(saved.payload.observacion);
            setNotice({ text: "Hay un gasto pendiente de confirmar. Reintenta el registro para verificarlo sin duplicarlo.", error: true });
          }
        } catch { /* An unavailable or invalid draft must not prevent loading the form. */ }
      } catch (error) {
        if (active) setInitError(error instanceof Error ? error.message : "Error cargando información inicial.");
      } finally { if (active) setCargando(false); }
    };
    void init();
    return () => { active = false; };
  }, []);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(String(user?.rolNombre || "").toUpperCase());
  const sedeSeleccionada = sedes.find((sede) => String(sede.id) === sedeId)?.nombre
    || (sedeId === String(user?.sedeId) ? user?.sedeNombre : "")
    || (cargando ? "Cargando sede…" : "Seleccionar sede");
  const navigation: { href: string; icon: DashboardIconName; label: string }[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" }, { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" }, { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" }, { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico", icon: "reports", label: "Reportes" },
    ...(esAdmin ? [{ href: "/dashboard/sedes", icon: "settings" as const, label: "Configuración" }] : []),
  ];

  const guardar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (guardandoRef.current || cargando || initError || !user) return;
    const payload = requestRef.current?.payload || { valor: Number(valor || 0), observacion: observacion.trim(), sedeId: Number(sedeId || 0) };
    if (!Number.isInteger(payload.sedeId) || payload.sedeId <= 0 || (esAdmin && !sedes.some((sede) => sede.id === payload.sedeId))) {
      setNotice({ text: "Selecciona una sede autorizada.", error: true }); return;
    }
    if (!Number.isFinite(payload.valor) || payload.valor <= 0) {
      setNotice({ text: "El valor debe ser mayor que cero.", error: true }); return;
    }
    guardandoRef.current = true; setGuardando(true); setNotice(null);
    try {
      const request = requestRef.current || { key: crypto.randomUUID(), payload };
      requestRef.current = request; setPending(true); storePending(user.id, request);
      const res = await fetch("/api/financiero/cartera", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": request.key },
        body: JSON.stringify(request.payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if ([400, 401, 403, 404, 422].includes(res.status)) {
          requestRef.current = null; setPending(false); storePending(user.id, null);
        }
        throw new Error(data.error || "No se pudo confirmar el gasto. Reintenta para verificarlo sin duplicarlo.");
      }
      if (data.ok !== true || !data.item?.id) throw new Error("No se pudo confirmar el gasto. Reintenta para verificarlo sin duplicarlo.");
      requestRef.current = null; setPending(false); storePending(user.id, null);
      setNotice({ text: "Gasto de cartera registrado correctamente.", error: false });
      setValor(""); setObservacion("");
      triggerLiveRefresh("gasto-cartera"); router.refresh();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "No se pudo confirmar el gasto. Reintenta para verificarlo sin duplicarlo.", error: true });
    } finally { guardandoRef.current = false; setGuardando(false); }
  };

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/dashboard" aria-label="CONECTAMOS, inicio"><Image src="/branding/conectamos-logo.png" alt="" width={42} height={42} priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{navigation.map((item) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/caja" ? styles.navActive : ""}`} aria-current={item.href === "/caja" ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
      <SalesProfile name={user?.nombre || user?.usuario || "Usuario"} role={user?.rolNombre || ""} />
    </header>
    <main className={styles.main}>
      <nav className={styles.breadcrumb} aria-label="Ubicación"><Link href="/dashboard/financiero">Centro financiero</Link><span>/</span><span>Cartera</span></nav>
      <header className={styles.heading}><div><h1>Registrar gasto de cartera</h1><p>{description}</p></div>{detailHref && <Link href={detailHref} className={`${styles.button} ${styles.detailButton}`}><DashboardIcon name="document" />Ver detalle</Link>}</header>
      {initError && <div role="alert" className={styles.error}><DashboardIcon name="warning" />{initError}</div>}
      {notice && <div role={notice.error ? "alert" : "status"} className={notice.error ? styles.error : styles.success}><DashboardIcon name={notice.error ? "warning" : "approvals"} /><span>{notice.text}{pending && !guardando && " Los datos se conservarán hasta confirmar el resultado."}</span></div>}
      <form className={styles.card} onSubmit={(event) => void guardar(event)} aria-busy={guardando}>
        <section className={styles.formPanel} aria-labelledby="cartera-form-title">
          <div className={styles.sectionHeading}><span className={styles.headingIcon}><DashboardIcon name="document" /></span><h2 id="cartera-form-title">Datos del movimiento</h2></div>
          {cargando ? <p className={styles.loading} role="status">Cargando información de cartera…</p> : <fieldset className={styles.fields} disabled={guardando || pending || Boolean(initError)}>
            <label className={styles.field} htmlFor="cartera-sede">Sede
              {esAdmin ? <span className={styles.select}><select id="cartera-sede" value={sedeId} onChange={(event) => setSedeId(event.target.value)} required><option value="">Seleccionar sede</option>{sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.nombre}</option>)}</select><DashboardIcon name="chevron" /></span>
                : <input id="cartera-sede" value={sedeSeleccionada} readOnly />}
            </label>
            <label className={styles.field} htmlFor="cartera-valor">Valor<span className={styles.moneyInput}><span aria-hidden="true">$</span><input id="cartera-valor" value={valor ? formatoNumero(valor) : ""} onChange={(event) => setValor(limpiarNumero(event.target.value))} inputMode="numeric" placeholder="0" autoComplete="off" required /></span></label>
            <label className={styles.field} htmlFor="cartera-observacion">Observación<textarea id="cartera-observacion" value={observacion} onChange={(event) => setObservacion(event.target.value)} rows={4} placeholder="Escribe el motivo del gasto" /></label>
          </fieldset>}
        </section>
        <aside className={styles.preview} aria-labelledby="cartera-preview-title">
          <div className={styles.previewHeading}><span className={styles.headingIcon}><DashboardIcon name="document" /></span><h2 id="cartera-preview-title">Resumen del gasto</h2><span>Vista previa</span></div>
          <dl><div><dt>Sede</dt><dd className={styles.sedeValue}>{sedeSeleccionada}</dd></div><div><dt>Valor del gasto</dt><dd className={styles.amount}>$ {formatoNumero(valor)}</dd></div><div><dt>Observación</dt><dd className={styles.observation}>{observacion.trim() || "Sin observación"}</dd></div></dl>
          <p className={styles.previewNote}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></svg>Revisa los datos antes de registrar.</p>
        </aside>
        <footer className={styles.footer}><Link href={backHref} className={styles.button}>Volver</Link><button type="submit" disabled={guardando || cargando || Boolean(initError) || !user} className={`${styles.button} ${styles.primary}`}><DashboardIcon name="document" />{guardando ? "Registrando…" : "Registrar gasto"}</button></footer>
      </form>
    </main>
  </div>;
}
