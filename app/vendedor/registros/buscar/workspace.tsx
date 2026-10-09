"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import type { RegistroVendedorDetalle } from "../types";
import { RecordDeviceVisual } from "./device-visual";
import styles from "./record-search.module.css";

type SessionProps = { nombre: string; sedeNombre: string; rolNombre: string; perfilNombre: string; perfilTipoLabel: string };
type NavigationItem = { href: string; icon: DashboardIconName; label: string };

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";

  try {
    return new Date(value).toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function formatDateOnly(value: string | null) {
  if (!value) return "Sin fecha";

  try {
    return new Date(value).toLocaleDateString("es-CO", { timeZone: "UTC" });
  } catch {
    return value;
  }
}

function formatMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Sin valor";

  const parsed =
    typeof value === "number" ? value : Number(String(value).replace(/[^\d.]/g, ""));

  if (!Number.isFinite(parsed)) return "Sin valor";

  return `$ ${parsed.toLocaleString("es-CO")}`;
}

function resolveFinancieras(registro: RegistroVendedorDetalle) {
  if (
    Array.isArray(registro.financierasDetalle) &&
    registro.financierasDetalle.length > 0
  ) {
    return registro.financierasDetalle;
  }

  return [
    {
      plataformaCredito: registro.plataformaCredito,
      creditoAutorizado: registro.creditoAutorizado,
      cuotaInicial: registro.cuotaInicial,
      tipoPagoInicial: registro.medioPago1Tipo,
      valorCuota: registro.valorCuota,
      numeroCuotas: registro.numeroCuotas,
      frecuenciaCuota: registro.frecuenciaCuota,
    },
  ].filter((item) => item.plataformaCredito || item.creditoAutorizado !== null);
}

function esServicioContado(value: unknown) {
  return String(value || "").trim().toUpperCase() === "CONTADO";
}


function documentoVisible(value: string | null | undefined) {
  return String(value || "").replace(/[.\s]/g, "");
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className={styles.field}><dt>{label}</dt><dd>{value && String(value).trim() ? value : "Sin dato"}</dd></div>;
}

function SectionHeading({ icon, title }: { icon: DashboardIconName; title: string }) {
  return <h3 className={styles.sectionHeading}><DashboardIcon name={icon} />{title}</h3>;
}

function SummaryCell({ icon, label, value }: { icon: DashboardIconName; label: string; value: string | null | undefined }) {
  return <div className={styles.summaryCell}><DashboardIcon name={icon} /><div><dt>{label}</dt><dd>{value && String(value).trim() ? value : "Sin dato"}</dd></div></div>;
}

function StatusPill({ label }: { label: string }) {
  const positive = ["COMPLETADO", "APROBADO", "FINALIZADO", "VENDIDO"].some(status => label.toUpperCase().includes(status));
  return <span className={styles.statusPill + " " + (positive ? styles.positiveStatus : "")}>{label}</span>;
}

function EditIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15v5Z" /></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>;
}

function AttachmentCard({ alt, children, src, title }: { alt: string; children?: ReactNode; src: string | null; title: string }) {
  return <article className={styles.attachment}>
    <h4><DashboardIcon name="document" />{title}</h4>
    {src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} loading="lazy" />
    ) : <div>{children ?? "Sin archivo cargado."}</div>}
  </article>;
}

export default function BuscarRegistroWorkspace({ session }: { session: SessionProps }) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<RegistroVendedorDetalle[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [buscando, setBuscando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [busquedaRealizada, setBusquedaRealizada] = useState(false);
  const [sedeFiltro, setSedeFiltro] = useState("");

  const rolNormalizado = String(session.rolNombre || "").trim().toUpperCase();
  const puedeEliminar = rolNormalizado === "ADMIN";
  const esAdministrador = rolNormalizado === "ADMIN" || rolNormalizado === "AUDITOR";
  const coverageLabel = esAdministrador ? "Todas las sedes" : session.sedeNombre;

  const navigationItems = useMemo<NavigationItem[]>(() => {
    const base: NavigationItem[] = [
      { href: "/dashboard", icon: "home", label: "Inicio" },
      { href: "/ventas", icon: "sales", label: "Ventas" },
      { href: "/inventario", icon: "inventory", label: "Inventario" },
      { href: "/prestamos", icon: "loans", label: "Préstamos" },
      { href: "/caja", icon: "cash", label: "Caja" },
      { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
      { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
    ];

    if (esAdministrador) {
      base.push({ href: "/dashboard/sedes", icon: "settings", label: "Configuración" });
    }

    return base;
  }, [esAdministrador]);

  const buscarRegistros = async () => {
    const criterio = busqueda.trim();
    const digits = criterio.replace(/\D/g, "");

    if (!digits) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar un IMEI o una cédula para consultar.");
      return;
    }

    try {
      setBuscando(true);
      setBusquedaRealizada(true);
      setMensaje("");

      const res = await fetch(
        `/api/vendedor/registros?buscar=${encodeURIComponent(digits)}`,
        { cache: "no-store" }
      );
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo consultar el registro.");
        setResultados([]);
        return;
      }

      const nextResultados = Array.isArray(data.resultados) ? data.resultados : [];
      setResultados(nextResultados);

      if (nextResultados.length === 0) {
        setMensajeTipo("error");
        setMensaje("No se encontraron registros con ese IMEI o cédula.");
        return;
      }

      setMensajeTipo("success");
      setMensaje(
        nextResultados.length === 1
          ? "Registro encontrado correctamente."
          : `Se encontraron ${nextResultados.length} registros.`
      );
    } catch {
      setMensajeTipo("error");
      setMensaje("Error consultando el registro.");
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const limpiarBusqueda = () => {
    setBusqueda("");
    setResultados([]);
    setMensaje("");
    setBusquedaRealizada(false);
    setSedeFiltro("");
  };

  const eliminarRegistro = async (id: number) => {
    const confirmar = window.confirm(
      "Vas a eliminar este registro del panel del vendedor. ¿Deseas continuar?"
    );

    if (!confirmar) return;

    try {
      setEliminandoId(id);
      setMensaje("");

      const res = await fetch("/api/vendedor/registros", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, modo: "ELIMINAR" }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo eliminar el registro.");
        return;
      }

      setResultados((current) => current.filter((item) => item.id !== id));
      setMensajeTipo("success");
      setMensaje(data.mensaje || "Registro eliminado correctamente.");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error eliminando el registro.");
    } finally {
      setEliminandoId(null);
    }
  };


  const sedesDisponibles = useMemo(() => Array.from(new Set(resultados.map(registro => registro.puntoVenta || registro.sedeNombre).filter((sede): sede is string => Boolean(sede)))).sort((a, b) => a.localeCompare(b, "es")), [resultados]);
  const resultadosVisibles = useMemo(() => sedeFiltro ? resultados.filter(registro => (registro.puntoVenta || registro.sedeNombre) === sedeFiltro) : resultados, [resultados, sedeFiltro]);

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS · Inicio"><Image src="/branding/conectamos-logo.png" width={44} height={44} alt="" priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">
        {navigationItems.map(item => <Link key={item.href} href={item.href} aria-current={item.href === "/ventas" ? "page" : undefined} className={styles.navItem + " " + (item.href === "/ventas" ? styles.navActive : "")}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </nav>
      <SalesProfile name={session.perfilNombre || session.nombre} role={session.perfilTipoLabel} />
    </header>

    <main className={styles.main}>
      <header className={styles.heading}>
        <h1>Buscar registro</h1>
        <div className={styles.headingActions}>
          <Link href="/vendedor/registros/inconsistencias" className={styles.button + " " + styles.warningButton}><DashboardIcon name="warning" />Inconsistencias</Link>
          <Link href="/vendedor/registros" className={styles.button + " " + styles.primary}><DashboardIcon name="document-add" />Registrar venta</Link>
        </div>
      </header>

      <section className={styles.searchSection} aria-label="Consulta de registros">
        <div className={styles.searchField}>
          <DashboardIcon name="search" />
          <label><span>IMEI o cédula</span><input value={busqueda} onChange={event => setBusqueda(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void buscarRegistros(); } }} inputMode="numeric" autoComplete="off" aria-label="IMEI o cédula" placeholder="Escribe el IMEI o número de documento" /></label>
          {busqueda && <button type="button" onClick={limpiarBusqueda} aria-label="Limpiar búsqueda"><DashboardIcon name="close" /></button>}
        </div>
        <button type="button" onClick={() => void buscarRegistros()} disabled={buscando} className={styles.button + " " + styles.searchButton}><DashboardIcon name="search" />{buscando ? "Buscando…" : "Buscar"}</button>
        <label className={styles.coverage}><DashboardIcon name="store" /><select aria-label="Filtrar por sede" value={sedeFiltro} onChange={event => setSedeFiltro(event.target.value)}><option value="">{coverageLabel}</option>{sedesDisponibles.map(sede => <option key={sede} value={sede}>{sede}</option>)}{sedeFiltro && !sedesDisponibles.includes(sedeFiltro) && <option value={sedeFiltro}>{sedeFiltro}</option>}</select><DashboardIcon name="chevron" /></label>
      </section>

      {mensaje && <div role={mensajeTipo === "error" ? "alert" : "status"} className={styles.message + " " + (mensajeTipo === "error" ? styles.errorMessage : styles.successMessage)}>{mensajeTipo === "success" ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : <DashboardIcon name="warning" />}{mensaje}</div>}

      <section className={styles.results} aria-label="Resultados de la consulta" aria-busy={buscando}>
        {buscando ? <div className={styles.loading} role="status"><span className={styles.spinner} /><p>Buscando registro…</p><div className={styles.skeleton} aria-hidden="true" /></div>
          : !busquedaRealizada ? <div className={styles.emptyState}><DashboardIcon name="document-search" /><h2>Consulta un registro comercial</h2><p>Ingresa el IMEI del equipo o la cédula del cliente.</p></div>
          : resultados.length === 0 ? <div className={styles.emptyState}><DashboardIcon name="search" /><h2>Sin resultados para esta consulta</h2><p>Verifica el número ingresado e intenta nuevamente.</p><button type="button" onClick={limpiarBusqueda} className={styles.button}>Nueva búsqueda</button></div>
          : resultadosVisibles.length === 0 ? <div className={styles.emptyState}><DashboardIcon name="store" /><h2>No hay coincidencias en esta sede</h2><button type="button" onClick={() => setSedeFiltro("")} className={styles.button}>Ver toda la cobertura</button></div>
          : resultadosVisibles.map(registro => {
            const financieras = resolveFinancieras(registro);
            const estadoVenta = String(registro.estadoVentaRegistro || "PENDIENTE").replace(/_/g, " ").trim();
            const financierasResumen = financieras.map(item => item.plataformaCredito).filter(Boolean).join(" · ") || registro.plataformaCredito;
            return <article key={registro.id} className={styles.record} aria-label={"Registro #" + registro.id}>
              <header className={styles.recordHeader}>
                <div className={styles.recordIdentity}>
                  <p className={styles.recordNumber}>Registro #{registro.id}</p>
                  <div className={styles.recordTitle}><h2>{registro.clienteNombre}</h2><StatusPill label={estadoVenta.toUpperCase().startsWith("VENTA ") ? estadoVenta : "Venta " + estadoVenta} /></div>
                  <p className={styles.recordDates}>Creado {formatDate(registro.createdAt)}{registro.updatedAt !== registro.createdAt ? " · Actualizado " + formatDate(registro.updatedAt) : ""}</p>
                </div>
                <div className={styles.recordActions}>
                  <Link href={"/vendedor/registros?editar=" + registro.id} className={styles.modifyButton}><EditIcon />Modificar</Link>
                  {puedeEliminar && <button type="button" onClick={() => void eliminarRegistro(registro.id)} disabled={eliminandoId === registro.id} className={styles.deleteButton}><TrashIcon />{eliminandoId === registro.id ? "Eliminando…" : "Eliminar"}</button>}
                </div>
              </header>

              <dl className={styles.summary}>
                <SummaryCell icon="document" label="Cédula" value={documentoVisible(registro.documentoNumero)} />
                <SummaryCell icon="barcode" label="IMEI" value={registro.serialImei} />
                <SummaryCell icon="cash" label="Financiera" value={financierasResumen} />
                <SummaryCell icon="pin" label="Punto / sede" value={[registro.puntoVenta || registro.sedeNombre, registro.asesorNombre].filter(Boolean).join(" · ")} />
              </dl>

              <div className={styles.primarySections}>
                <section className={styles.customerSection}>
                  <SectionHeading icon="user" title="Datos del cliente" />
                  <dl className={styles.fields}>
                    <Field label="Nombre completo" value={registro.clienteNombre} />
                    <Field label="Cédula" value={documentoVisible(registro.documentoNumero)} />
                    <Field label="Correo" value={registro.correo} />
                    <Field label="WhatsApp" value={registro.whatsapp} />
                    <Field label="Teléfono" value={registro.telefono} />
                    <Field label="Ciudad" value={registro.ciudad} />
                    <Field label="Fecha de nacimiento" value={formatDateOnly(registro.fechaNacimiento)} />
                    <Field label="Fecha de expedición" value={formatDateOnly(registro.fechaExpedicion)} />
                    <Field label="Dirección" value={registro.direccion} />
                    <Field label="Barrio" value={registro.barrio} />
                    <Field label="Tipo de documento" value={registro.tipoDocumento} />
                  </dl>
                </section>

                <section className={styles.deviceSection}>
                  <SectionHeading icon="inventory" title="Equipo y trámite" />
                  <div className={styles.devicePresentation}>
                    <RecordDeviceVisual reference={registro.referenciaEquipo} productType={registro.tipoProducto} imageSrc={registro.catalogoEquipo?.imagenUrl} operatingSystem={registro.catalogoEquipo?.sistemaOperativo} catalogReference={registro.catalogoEquipo?.referencia} />
                    <div><h4>{registro.referenciaEquipo || "Referencia sin registrar"}</h4><p>{[registro.almacenamiento, registro.color, registro.tipoEquipo].filter(Boolean).join(" · ") || "Sin características registradas"}</p></div>
                  </div>
                  <dl className={styles.fields}>
                    <Field label="IMEI" value={registro.serialImei} />
                    <Field label="Tipo de producto" value={registro.tipoProducto} />
                    <Field label="Punto / sede" value={registro.puntoVenta ?? registro.sedeNombre} />
                    <Field label="Modalidad" value={registro.plataformaCredito} />
                    <Field label="Asesor" value={registro.asesorNombre} />
                    <Field label="Jalador" value={registro.jaladorNombre} />
                    <Field label="Cerrador" value={registro.cerradorNombre} />
                    <Field label="Registro SIM 1" value={registro.simCardRegistro1} />
                    <Field label="Registro SIM 2" value={registro.simCardRegistro2} />
                    <Field label="Observación" value={registro.observacion} />
                  </dl>
                </section>
              </div>

              <section className={styles.additionalSection}>
                <SectionHeading icon="cash" title="Información financiera" />
                <dl className={styles.financialSummary}>
                  <Field label="Ingreso 1" value={registro.medioPago1Tipo} /><Field label="Valor ingreso 1" value={formatMoney(registro.medioPago1Valor)} />
                  <Field label="Ingreso 2" value={registro.medioPago2Tipo} /><Field label="Valor ingreso 2" value={formatMoney(registro.medioPago2Valor)} />
                </dl>
                {financieras.length > 0 ? financieras.map((financiera, index) => <section key={registro.id + "-financiera-" + index} className={styles.financialDetail}>
                  <h4>{financiera.plataformaCredito || "Financiera " + (index + 1)}<span>{index + 1} de {financieras.length}</span></h4>
                  <dl className={styles.financialFields}>
                    <Field label="Crédito autorizado" value={formatMoney(financiera.creditoAutorizado)} /><Field label="Inicial" value={formatMoney(financiera.cuotaInicial)} />
                    <Field label="Pago inicial" value={financiera.tipoPagoInicial} /><Field label="Valor cuota" value={formatMoney(financiera.valorCuota)} />
                    <Field label="Plazo" value={financiera.numeroCuotas ? financiera.numeroCuotas + " cuotas" : "Sin dato"} /><Field label="Frecuencia" value={financiera.frecuenciaCuota} />
                  </dl>
                </section>) : <p className={styles.muted}>Este registro no tiene financieras asociadas.</p>}
                <dl className={styles.metadataFields}><Field label="Doble crédito" value={registro.dobleCredito ? "Sí" : "No"} /><Field label="Número de factura" value={registro.numeroFactura} /><Field label="Estado de facturación" value={registro.estadoFacturacion} /><Field label="Venta relacionada" value={registro.ventaIdRelacionada == null ? null : String(registro.ventaIdRelacionada)} /></dl>
              </section>

              <div className={styles.lowerSections}>
                <section className={styles.additionalSection}>
                  <SectionHeading icon="approvals" title="Referencias y validaciones" />
                  <dl className={styles.fields}>
                    <Field label="Referencia familiar 1" value={registro.referenciaFamiliar1Nombre} /><Field label="Teléfono referencia 1" value={registro.referenciaFamiliar1Telefono} />
                    <Field label="Referencia familiar 2" value={registro.referenciaFamiliar2Nombre} /><Field label="Teléfono referencia 2" value={registro.referenciaFamiliar2Telefono} />
                    <Field label="Acepta intermediación" value={registro.aceptaDeclaracionIntermediacion ? "Sí" : "No"} /><Field label="Acepta política de garantía" value={registro.aceptaPoliticaGarantia ? "Sí" : "No"} />
                    <Field label="Acepta condiciones de crédito" value={registro.aceptaCondicionesCredito ? "Sí" : "No"} /><Field label="Confirmación del cliente" value={registro.confirmacionCliente ? "Sí" : "No"} />
                    <Field label="Perfil vendedor" value={registro.perfilVendedorNombre} /><Field label="Tipo de perfil" value={registro.perfilVendedorTipo} />
                  </dl>
                </section>
                <section className={styles.additionalSection}>
                  <SectionHeading icon="document" title="Documentos adjuntos" />
                  <div className={styles.attachments}>
                    <AttachmentCard title="Firma del cliente" src={registro.firmaClienteDataUrl} alt="Firma del cliente" />
                    <AttachmentCard title="Foto de entrega" src={registro.fotoEntregaDataUrl} alt="Foto de entrega" />
                    {esServicioContado(registro.plataformaCredito) ? <AttachmentCard title="Soporte de la venta" src={registro.facturaFotoDataUrl} alt="Soporte de la venta" /> : <>
                      <AttachmentCard title="Cédula frente" src={registro.clienteSinCedulaFisica ? null : registro.cedulaFrenteDataUrl} alt="Cédula frente">{registro.clienteSinCedulaFisica ? "Cliente reportado sin cédula física." : "Sin foto frontal cargada."}</AttachmentCard>
                      <AttachmentCard title="Cédula reverso" src={registro.clienteSinCedulaFisica ? null : registro.cedulaReversoDataUrl} alt="Cédula reverso">{registro.clienteSinCedulaFisica ? "Cliente reportado sin cédula física." : "Sin foto posterior cargada."}</AttachmentCard>
                    </>}
                  </div>
                </section>
              </div>
            </article>;
          })}
        {!buscando && resultados.length > 0 && <p className={styles.resultCount} aria-live="polite">{resultadosVisibles.length} de {resultados.length} {resultados.length === 1 ? "registro encontrado" : "registros encontrados"}{sedeFiltro ? " · " + sedeFiltro : ""}</p>}
      </section>
    </main>
  </div>;
}
