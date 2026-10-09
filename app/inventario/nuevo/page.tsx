"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { TIPOS_PRODUCTO } from "@/lib/product-types";
import { extraerImeisMasivos, normalizarSeparadoresImeisMasivos } from "@/lib/inventory-imeis";
import { triggerLiveRefresh } from "@/lib/use-live-refresh";
import styles from "./nuevo.module.css";

const OPCIONES_PROVEEDOR_SEDE = ["Proveedor FINSER", "Proveedor BUNQUER", "Proveedor TECNOSUPER", "Proveedor IPHONE ANGIE", "Proveedor Felipe", "Proveedor SEDE 1", "Proveedor SEDE 2", "Proveedor SEDE 3", "Proveedor SEDE 4", "Proveedor SEDE 5", "Proveedor SEDE 6", "Proveedor SEDE 7", "Proveedor EMOVIL", "Proveedor POLLO", "Proveedor ANDRES", "Proveedor EMMATECH"];
const OPCIONES_PROVEEDOR_BODEGA = ["COMUNICARIBE", "HOLA PLAZA", "CONMOVIL", "CORBETA", "OPORTUNIDADES", "Proveedor Felipe"];
type SessionUser = { id: number; nombre: string; usuario: string; sedeId: number; sedeNombre: string; rolNombre: string };
type ReferenciaCatalogo = { id: number; nombre: string; activo: boolean };
type Entry = { indice: number; imei: string; estado: "VALIDO" | "INCORRECTO" | "REPETIDO" | "EXISTENTE"; mensaje: string };
type Review = { ok: boolean; entradas: Entry[]; imeisValidos: string[]; detectados: number; validos: number; incorrectos: number; repetidos: number; existentes: number };
type IntakePayload = { imeis: string[]; imei?: string; referencia: string; tipoProducto: string; color: string; costo: number; numeroFactura?: string; distribuidor: string; estadoFinanciero?: string; deboA?: string | null };
type Pending = { key: string; endpoint: string; payload: IntakePayload; modo: "individual" | "masiva"; entrada: string };
type Notice = { error: boolean; text: string } | null;
const pesos = (value: string | number) => `$ ${Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
const draftKey = (userId: number) => `conectamos:inventario-ingreso:pendiente:${userId}`;
function persistPending(userId: number, request: Pending | null) {
  try { if (request) sessionStorage.setItem(draftKey(userId), JSON.stringify(request)); else sessionStorage.removeItem(draftKey(userId)); } catch { /* Keep the request key in memory when storage is unavailable. */ }
}

export default function NuevoInventarioPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [catalogo, setCatalogo] = useState<ReferenciaCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState("");
  const [modo, setModo] = useState<"individual" | "masiva">("individual");
  const [imei, setImei] = useState("");
  const [imeisMasivos, setImeisMasivos] = useState("");
  const [referencia, setReferencia] = useState("");
  const [tipoProducto, setTipoProducto] = useState("TELEFONIA");
  const [color, setColor] = useState("");
  const [costo, setCosto] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [distribuidor, setDistribuidor] = useState("");
  const [estadoFinanciero, setEstadoFinanciero] = useState("PAGO");
  const [deboA, setDeboA] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [resultado, setResultado] = useState(false);
  const lock = useRef(false);
  const reviewLock = useRef(false);
  const requestRef = useRef<Pending | null>(null);
  const reviewedInput = useRef("");
  const lookupRef = useRef(0);
  const esAdmin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre?.toUpperCase() || "");
  const destino = esAdmin ? "Bodega principal" : user?.sedeNombre || "Tu sede";
  const rutaCancelar = esAdmin ? "/inventario-principal" : "/inventario";
  const entrada = modo === "masiva" ? imeisMasivos : imei;
  const entradas = useMemo(() => modo === "masiva" ? extraerImeisMasivos(imeisMasivos) : imei.trim() ? [imei.trim()] : [], [modo, imei, imeisMasivos]);
  const referenciasActivas = useMemo(() => catalogo.filter((item) => item.activo), [catalogo]);
  const opcionesDistribuidor = esAdmin ? OPCIONES_PROVEEDOR_BODEGA : OPCIONES_PROVEEDOR_SEDE;
  const listReady = review !== null && reviewedInput.current === `${modo}:${entrada}`;
  const cantidadValida = pending ? requestRef.current?.payload.imeis.length || 0 : listReady ? review.validos : 0;
  const excluidos = listReady ? review.incorrectos + review.repetidos + review.existentes : 0;
  const ocupado = loading || reviewing || guardando || pending || Boolean(initError);
  const navigation: { href: string; icon: DashboardIconName; label: string }[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" }, { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" }, { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" }, { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico", icon: "reports", label: "Reportes" },
    ...(esAdmin ? [{ href: "/dashboard/sedes", icon: "settings" as const, label: "Configuración" }] : []),
  ];

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const res = await fetch("/api/session", { cache: "no-store" }); const data = await res.json();
        if (!res.ok || !data.id) throw new Error(data.error || "No se pudo cargar la sesión.");
        const admin = ["ADMIN", "AUDITOR"].includes(String(data.rolNombre || "").toUpperCase());
        let referencias: ReferenciaCatalogo[] = [];
        if (admin) {
          const resCatalogo = await fetch("/api/inventario-principal/referencias", { cache: "no-store" }); const dataCatalogo = await resCatalogo.json();
          if (!resCatalogo.ok || !Array.isArray(dataCatalogo.referencias)) throw new Error("No se pudo cargar el catálogo de referencias. Recarga la página.");
          referencias = dataCatalogo.referencias;
        }
        if (!active) return;
        setUser(data); setCatalogo(referencias);
        try {
          const saved = JSON.parse(sessionStorage.getItem(draftKey(data.id)) || "null") as Pending | null;
          const expectedEndpoint = admin ? "/api/inventario-principal" : "/api/inventario";
          if (saved && typeof saved.key === "string" && saved.key.length >= 8 && saved.endpoint === expectedEndpoint && saved.payload && Array.isArray(saved.payload.imeis) && saved.payload.imeis.every((value) => typeof value === "string" && /^\d{15}$/.test(value)) && ["individual", "masiva"].includes(saved.modo)) {
            requestRef.current = saved; setPending(true); setModo(saved.modo);
            if (saved.modo === "masiva") setImeisMasivos(saved.entrada); else setImei(saved.entrada);
            setReferencia(saved.payload.referencia); setTipoProducto(saved.payload.tipoProducto); setColor(saved.payload.color);
            setCosto(String(saved.payload.costo)); setNumeroFactura(saved.payload.numeroFactura || ""); setDistribuidor(saved.payload.distribuidor);
            setEstadoFinanciero(saved.payload.estadoFinanciero || "PAGO"); setDeboA(saved.payload.deboA || "");
            setNotice({ error: true, text: "Hay una carga pendiente de confirmar. Reintenta para consultar su resultado sin duplicarla." });
          }
        } catch { /* Invalid drafts must not block a new authorized intake. */ }
      } catch (error) { if (active) setInitError(error instanceof Error ? error.message : "No se pudo cargar el formulario."); }
      finally { if (active) setLoading(false); }
    };
    void init(); return () => { active = false; };
  }, []);

  const invalidateReview = () => { lookupRef.current += 1; setReview(null); reviewedInput.current = ""; setResultado(false); setNotice(null); };
  const buscarIMEI = async (value: string) => {
    const current = ++lookupRef.current;
    try {
      const res = await fetch("/api/inventario-principal/buscar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imei: value }) }); const data = await res.json();
      if (!res.ok || !data.referencia || current !== lookupRef.current) return;
      setReferencia(data.referencia); setTipoProducto(data.tipoProducto || "TELEFONIA"); setColor(data.color || ""); setCosto(data.costo ? String(data.costo) : "");
    } catch { /* Optional autofill does not prevent manual entry. */ }
  };
  const revisarLista = async (): Promise<Review | null> => {
    if (reviewLock.current || !user) return null;
    if (entradas.length === 0) { setNotice({ error: true, text: "Ingresa al menos un IMEI para revisar." }); return null; }
    reviewLock.current = true; setReviewing(true); setNotice(null); setResultado(false);
    try {
      const res = await fetch("/api/inventario/revisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imeis: entradas, destino: esAdmin ? "PRINCIPAL" : "SEDE" }) }); const data = await res.json();
      if (!res.ok || data.ok !== true || !Array.isArray(data.entradas) || !Array.isArray(data.imeisValidos)) throw new Error(data.error || "No se pudo revisar la lista. Intenta nuevamente.");
      reviewedInput.current = `${modo}:${entrada}`; setReview(data); return data;
    } catch (error) { setReview(null); reviewedInput.current = ""; setNotice({ error: true, text: error instanceof Error ? error.message : "No se pudo revisar la lista." }); return null; }
    finally { reviewLock.current = false; setReviewing(false); }
  };
  const guardar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || reviewLock.current || loading || initError || !user) return;
    setNotice(null); setResultado(false);
    if (!requestRef.current) {
      if (!referencia.trim() || (esAdmin && !referenciasActivas.some((item) => item.nombre === referencia))) { setNotice({ error: true, text: esAdmin ? "Selecciona una referencia activa del catálogo." : "La referencia es obligatoria." }); return; }
      if (!Number.isFinite(Number(costo)) || Number(costo) <= 0) { setNotice({ error: true, text: "El costo unitario debe ser mayor que cero." }); return; }
      if (!distribuidor) { setNotice({ error: true, text: "Selecciona un distribuidor." }); return; }
      if (esAdmin && !numeroFactura.trim()) { setNotice({ error: true, text: "El número de factura es obligatorio." }); return; }
      if (!esAdmin && estadoFinanciero === "DEUDA" && !deboA) { setNotice({ error: true, text: "Selecciona a quién se debe el equipo." }); return; }
      const checked = listReady ? review : await revisarLista();
      if (!checked || checked.imeisValidos.length === 0) { if (checked) setNotice({ error: true, text: "No hay equipos válidos para guardar. Corrige los IMEI de la lista." }); return; }
      if (!listReady) { setNotice({ error: checked.incorrectos + checked.repetidos + checked.existentes > 0, text: "Lista revisada. Comprueba los equipos válidos y las exclusiones antes de pulsar Guardar nuevamente." }); return; }
      const payload: IntakePayload = { imeis: checked.imeisValidos, referencia: referencia.trim(), tipoProducto, color: color.trim(), costo: Number(costo), distribuidor };
      if (esAdmin) payload.numeroFactura = numeroFactura.trim();
      else { payload.imei = checked.imeisValidos[0]; payload.estadoFinanciero = estadoFinanciero; payload.deboA = estadoFinanciero === "DEUDA" ? deboA : null; }
      requestRef.current = { key: crypto.randomUUID(), endpoint: esAdmin ? "/api/inventario-principal" : "/api/inventario", payload, modo, entrada };
      persistPending(user.id, requestRef.current); setPending(true);
    }
    lock.current = true; setGuardando(true);
    const request = requestRef.current;
    try {
      const res = await fetch(request.endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": request.key }, body: JSON.stringify(request.payload) }); const data = await res.json();
      if (!res.ok) {
        if ([400, 401, 403, 404, 409, 422].includes(res.status)) { requestRef.current = null; setPending(false); persistPending(user.id, null); if (res.status === 409) { setReview(null); reviewedInput.current = ""; } }
        throw new Error(data.error || "No se pudo confirmar la carga. Reintenta para verificar el resultado sin duplicarla.");
      }
      if (data.ok !== true || Number(data.insertados) !== request.payload.imeis.length || Number(data.omitidos || 0) !== 0) throw new Error("El servidor no confirmó todos los equipos de esta carga. Conservamos los datos; reintenta para verificar el resultado.");
      requestRef.current = null; setPending(false); persistPending(user.id, null); setResultado(true);
      setNotice({ error: false, text: `${Number(data.insertados).toLocaleString("es-CO")} equipo(s) guardado(s) correctamente en ${destino}.` });
      // Only clear the active confirmed load; keep the inactive IMEI draft.
      if (request.modo === "masiva") setImeisMasivos(""); else setImei("");
      setReview(null); reviewedInput.current = ""; triggerLiveRefresh("inventario-ingreso"); router.refresh();
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "No se pudo confirmar la carga. Reintenta sin duplicarla." }); }
    finally { lock.current = false; setGuardando(false); }
  };

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/dashboard" aria-label="CONECTAMOS, inicio"><Image src="/branding/conectamos-logo.png" alt="" width={42} height={42} priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{navigation.map((item) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/inventario" ? styles.navActive : ""}`} aria-current={item.href === "/inventario" ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
      <SalesProfile name={user?.nombre || user?.usuario || "Usuario"} role={user?.rolNombre || ""} />
    </header>
    <main className={styles.main}>
      <header className={styles.heading}><div><nav className={styles.breadcrumb} aria-label="Ubicación"><Link href={rutaCancelar}>Inventario</Link><span>/</span><span>{destino}</span></nav><h1>Ingresar equipos</h1><p>Registra equipos individuales o en lote.</p></div><span className={styles.destination}><DashboardIcon name="store" />{destino}</span></header>
      {initError && <div className={styles.error} role="alert"><DashboardIcon name="warning" />{initError}</div>}
      {notice && <div className={notice.error ? styles.error : styles.success} role={notice.error ? "alert" : "status"}><DashboardIcon name={notice.error ? "warning" : "approvals"} /><span>{notice.text}{pending && !guardando && " Los datos permanecen bloqueados hasta confirmar el resultado."}</span>{resultado && <Link href={rutaCancelar}>Ver inventario <DashboardIcon name="arrow" /></Link>}</div>}
      <form className={styles.workspace} onSubmit={(event) => void guardar(event)} aria-busy={guardando || reviewing}>
        <div className={styles.formColumn}>
          <section className={styles.card} aria-labelledby="identificacion-title">
            <h2 id="identificacion-title">Identificación de equipos</h2>
            <div className={styles.tabs} role="tablist" aria-label="Modo de ingreso"><button type="button" id="tab-individual" role="tab" aria-selected={modo === "individual"} aria-controls="panel-identificacion" disabled={ocupado} className={modo === "individual" ? styles.activeTab : ""} onClick={() => { setModo("individual"); invalidateReview(); }}>Individual</button><button type="button" id="tab-masiva" role="tab" aria-selected={modo === "masiva"} aria-controls="panel-identificacion" disabled={ocupado} className={modo === "masiva" ? styles.activeTab : ""} onClick={() => { setModo("masiva"); invalidateReview(); }}>Carga masiva</button></div>
            <div id="panel-identificacion" role="tabpanel" aria-labelledby={modo === "masiva" ? "tab-masiva" : "tab-individual"}>
              <label className={styles.imeiLabel} htmlFor={modo === "masiva" ? "imei-masivo" : "imei-individual"}>{modo === "masiva" ? "Un IMEI por línea · 15 dígitos" : "IMEI del equipo · 15 dígitos"}</label>
              {modo === "masiva" ? <textarea id="imei-masivo" className={styles.imeiArea} rows={7} value={imeisMasivos} disabled={ocupado} onChange={(event) => { setImeisMasivos(normalizarSeparadoresImeisMasivos(event.target.value)); invalidateReview(); }} placeholder="Pega los IMEI aquí" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-describedby="imei-separadores" /> : <input id="imei-individual" className={styles.imeiInput} value={imei} disabled={ocupado} inputMode="numeric" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="Ingresa los 15 dígitos del IMEI" onChange={(event) => { const value = event.target.value.trim(); setImei(value); invalidateReview(); lookupRef.current += 1; if (!esAdmin && /^\d{15}$/.test(value)) void buscarIMEI(value); }} />}
              {modo === "masiva" && <p id="imei-separadores" className={styles.imeiHelp}>Pega separados por saltos de línea, comas, espacios o punto y coma.</p>}
              <div className={styles.reviewActions}><span>{entradas.length.toLocaleString("es-CO")} IMEI {entradas.length === 1 ? "detectado" : "detectados"}</span><button type="button" className={`${styles.button} ${styles.reviewButton}`} disabled={ocupado || entradas.length === 0} onClick={() => void revisarLista()}><DashboardIcon name="document-search" />{reviewing ? "Revisando…" : "Revisar lista"}</button></div>
            </div>
            {listReady && <div className={styles.reviewResult} aria-live="polite"><p><strong>{review.validos.toLocaleString("es-CO")} válidos para registrar</strong>{excluidos > 0 ? <span className={styles.excluded}> · {excluidos.toLocaleString("es-CO")} entradas excluidas</span> : <span> · Sin duplicados ni errores</span>}</p>{excluidos > 0 && <p className={styles.exclusionNote}>Se guardarán únicamente los IMEI válidos. Las entradas incorrectas, repetidas o existentes quedan excluidas del total.</p>}<details open={excluidos > 0}><summary>{excluidos > 0 ? "Ver errores y duplicados" : "Ver lista revisada"}</summary><div className={styles.reviewScroll}><table><thead><tr><th>Línea</th><th>IMEI</th><th>Resultado</th></tr></thead><tbody>{review.entradas.map((entry) => <tr key={`${entry.indice}-${entry.imei}`}><td>{entry.indice}</td><td className={styles.imeiText}>{entry.imei}</td><td className={entry.estado === "VALIDO" ? styles.validEntry : styles.invalidEntry}>{entry.mensaje || (entry.estado === "VALIDO" ? "Válido" : entry.estado)}</td></tr>)}</tbody></table></div></details></div>}
          </section>
          <section className={styles.card} aria-labelledby="datos-title"><h2 id="datos-title">Datos del equipo</h2><p className={styles.sectionNote}>{modo === "masiva" ? "Estos datos se aplican a todo el lote." : "Datos comerciales del equipo."}</p>
            <fieldset className={styles.fields} disabled={ocupado}>
              <label htmlFor="ingreso-referencia">Referencia{esAdmin ? <select id="ingreso-referencia" value={referencia} onChange={(event) => setReferencia(event.target.value)} required><option value="">Seleccionar referencia</option>{referenciasActivas.map((item) => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}</select> : <input id="ingreso-referencia" value={referencia} onChange={(event) => setReferencia(event.target.value)} placeholder="Referencia del equipo" required />}</label>
              <label htmlFor="ingreso-tipo">Tipo de producto<select id="ingreso-tipo" value={tipoProducto} onChange={(event) => setTipoProducto(event.target.value)}>{TIPOS_PRODUCTO.map((tipo) => <option key={tipo} value={tipo}>{tipo === "TELEFONIA" ? "TELEFONÍA" : "ELECTRODOMÉSTICO"}</option>)}</select></label>
              <label htmlFor="ingreso-color">Color<input id="ingreso-color" value={color} onChange={(event) => setColor(event.target.value)} placeholder="Color del equipo" /></label>
              <label htmlFor="ingreso-costo">Costo unitario<input id="ingreso-costo" value={costo ? pesos(costo) : ""} onChange={(event) => setCosto(event.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="off" placeholder="$ 0" required /></label>
              {esAdmin && <label htmlFor="ingreso-factura">Número de factura<input id="ingreso-factura" value={numeroFactura} onChange={(event) => setNumeroFactura(event.target.value)} placeholder="Número de factura" required /></label>}
              <label htmlFor="ingreso-distribuidor">Distribuidor<select id="ingreso-distribuidor" value={distribuidor} onChange={(event) => setDistribuidor(event.target.value)} required><option value="">Seleccionar distribuidor</option>{opcionesDistribuidor.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            </fieldset>
          </section>
          {!esAdmin && <section className={styles.card} aria-labelledby="financiero-title"><h2 id="financiero-title">Estado financiero</h2><fieldset className={styles.fields} disabled={ocupado}><label htmlFor="ingreso-estado">Estado financiero<select id="ingreso-estado" value={estadoFinanciero} onChange={(event) => { setEstadoFinanciero(event.target.value); if (event.target.value !== "DEUDA") setDeboA(""); }}><option value="PAGO">Pago</option><option value="DEUDA">Deuda</option><option value="CANCELADO">Cancelado</option></select></label>{estadoFinanciero === "DEUDA" && <label htmlFor="ingreso-acreedor">Debe a<select id="ingreso-acreedor" value={deboA} onChange={(event) => setDeboA(event.target.value)} required><option value="">Seleccionar proveedor</option>{OPCIONES_PROVEEDOR_SEDE.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}</fieldset></section>}
        </div>
        <aside className={styles.summary} aria-labelledby="resumen-title"><div className={styles.summaryTop}><h2 id="resumen-title">Resumen de carga</h2><p className={styles.mode}>{modo === "masiva" ? "Carga masiva" : "Carga individual"}</p><strong className={styles.quantity}>{cantidadValida.toLocaleString("es-CO")} {cantidadValida === 1 ? "equipo" : "equipos"}</strong><p className={styles.reviewStatus}>{pending ? "Carga pendiente de confirmar" : listReady ? excluidos > 0 ? `${excluidos.toLocaleString("es-CO")} entradas excluidas` : "Lista revisada" : entradas.length > 0 ? `${entradas.length.toLocaleString("es-CO")} IMEI por revisar` : "Sin equipos seleccionados"}</p><div className={styles.amounts}><div><span>Costo unitario</span><strong>{pesos(costo)}</strong></div><div><span>Total del lote</span><strong>{pesos(Number(costo || 0) * cantidadValida)}</strong></div></div></div>
          <div className={styles.summaryBody}><dl><div><dt>Referencia</dt><dd>{referencia || "Por seleccionar"}</dd></div><div><dt>Color</dt><dd>{color || "Sin especificar"}</dd></div><div><dt>Distribuidor</dt><dd>{distribuidor || "Por seleccionar"}</dd></div>{esAdmin ? <div><dt>Factura</dt><dd>{numeroFactura || "Por completar"}</dd></div> : <div><dt>Estado financiero</dt><dd>{estadoFinanciero}{estadoFinanciero === "DEUDA" && <span className={styles.creditor}>{deboA || "Acreedor por seleccionar"}</span>}</dd></div>}<div><dt>Destino</dt><dd>{destino}</dd></div></dl>
            {!listReady && !pending && entradas.length > 0 && <p className={styles.summaryNote}>Revisa la lista para calcular el total con los equipos válidos.</p>}
            {listReady && excluidos > 0 && <p className={styles.summaryNote}>El total excluye {excluidos.toLocaleString("es-CO")} entradas incorrectas, repetidas o existentes.</p>}
            <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={loading || reviewing || guardando || Boolean(initError) || !user || (listReady && cantidadValida === 0)}>{guardando ? "Guardando…" : pending ? "Confirmar resultado de la carga" : esAdmin ? "Guardar en bodega principal" : "Guardar inventario"}</button>
            <Link href={rutaCancelar} className={styles.button} onClick={(event) => { if (guardando) event.preventDefault(); }}>Cancelar</Link>
          </div>
        </aside>
      </form>
      {loading && <p className={styles.loading} role="status">Cargando sesión y catálogos…</p>}
    </main>
  </div>;
}
