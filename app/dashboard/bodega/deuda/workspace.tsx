"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import bodegaStyles from "@/app/dashboard/_components/bodega-dashboard.module.css";
import LoanDialog from "@/app/prestamos/_components/loan-dialog";
import {
  centavosADecimalProveedor,
  decimalProveedorACentavos,
  formatPaymentAmountInput,
  normalizePaymentAmountInput,
  paymentAmountToCents,
} from "@/lib/proveedores-pagos";
import styles from "./deuda.module.css";

type Equipo = { imei: string; referencia: string };
type Proveedor = { id: number; nombre: string };
type Pago = { id: number; valor: string; fecha: string; registradoPor: string };
type Deuda = {
  id: number;
  fecha: string;
  numeroFactura: string;
  proveedor: string;
  valor: string;
  abonado: string;
  saldo: string;
  diasDeuda: number;
  equipos: Equipo[];
  pagos: Pago[];
};
type Consulta = { hoy: string; items: Deuda[] };

const API = "/api/bodega/deudas";
const DISTRIBUIDORES_API = "/api/inventario-principal/distribuidores";
const formatMoney = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 2, minimumFractionDigits: 0,
});

function mostrarFecha(fecha: string) {
  const [ano, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${ano}`;
}

function mensajeError(error: unknown, fallback: string) {
  return error instanceof Error && !(error instanceof TypeError) ? error.message : fallback;
}

async function leerRespuesta<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== "object") {
    throw new Error(typeof data?.error === "string" ? data.error : fallback);
  }
  return data as T;
}

function guardar(path: string, body: object) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function CampoValor({ id, label, value, onChange, disabled }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <input
      id={id}
      required
      inputMode="decimal"
      autoComplete="off"
      placeholder="0"
      value={formatPaymentAmountInput(value)}
      disabled={disabled}
      onChange={event => {
        const { inputType } = event.nativeEvent as InputEvent;
        onChange(normalizePaymentAmountInput(event.target.value, value, inputType === "insertFromPaste" || inputType === "insertFromDrop"));
      }}
    />
  </div>;
}

export default function BodegaDeudaWorkspace() {
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [aviso, setAviso] = useState("");
  const [registroAbierto, setRegistroAbierto] = useState(false);
  const [factura, setFactura] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [valor, setValor] = useState("");
  const [imei, setImei] = useState("");
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [errorRegistro, setErrorRegistro] = useState("");
  const [deudaId, setDeudaId] = useState<number | null>(null);
  const [valorPago, setValorPago] = useState("");
  const [errorPago, setErrorPago] = useState("");
  const [guardando, setGuardando] = useState(false);
  const bloqueo = useRef(false);
  const clavesPago = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    const cargar = async () => {
      const options = { cache: "no-store" as const, signal: controller.signal };
      const [deudas, catalogo] = await Promise.allSettled([
        fetch(API, options).then(res => leerRespuesta<Consulta>(res, "No se pudieron cargar las deudas.")),
        fetch(DISTRIBUIDORES_API, options).then(res => leerRespuesta<{ distribuidores: Proveedor[] }>(res, "No se pudo cargar el catálogo de proveedores.")),
      ]);
      if (controller.signal.aborted) return;
      const errores: string[] = [];
      if (deudas.status === "fulfilled" && Array.isArray(deudas.value.items) && /^\d{4}-\d{2}-\d{2}$/.test(deudas.value.hoy)) {
        setConsulta(deudas.value);
      } else {
        errores.push(deudas.status === "rejected" ? mensajeError(deudas.reason, "No se pudieron cargar las deudas.") : "La consulta de deudas no está disponible.");
      }
      if (catalogo.status === "fulfilled" && Array.isArray(catalogo.value.distribuidores)) {
        setProveedores(catalogo.value.distribuidores);
      } else {
        setProveedores([]);
        errores.push(catalogo.status === "rejected" ? mensajeError(catalogo.reason, "No se pudo cargar el catálogo de proveedores.") : "El catálogo de proveedores no está disponible.");
      }
      setErrorCarga(errores.join(" "));
      setCargando(false);
    };
    void cargar();
    return () => controller.abort();
  }, [version]);

  const items = consulta?.items ?? [];
  const deuda = items.find(item => item.id === deudaId);
  const saldoCentavos = deuda ? decimalProveedorACentavos(deuda.saldo) ?? 0 : 0;
  const pagoCentavos = paymentAmountToCents(valorPago) ?? 0;
  const listoParaRegistrar = Boolean(consulta && proveedores.length && !cargando && !guardando);
  const totalPendiente = items.reduce((total, item) => total + (decimalProveedorACentavos(item.saldo) ?? 0), 0);

  function actualizarItem(item: Deuda) {
    setConsulta(actual => actual ? {
      ...actual,
      items: actual.items.some(deuda => deuda.id === item.id)
        ? actual.items.map(deuda => deuda.id === item.id ? item : deuda)
        : [item, ...actual.items],
    } : actual);
  }

  async function buscarEquipo() {
    if (bloqueo.current) return;
    const buscado = imei.trim();
    setErrorRegistro("");
    if (!/^\d{15}$/.test(buscado)) {
      setErrorRegistro("Escribe un IMEI de 15 dígitos.");
      return;
    }
    if (equipos.some(equipo => equipo.imei === buscado)) {
      setErrorRegistro("Ese equipo ya está en la factura.");
      return;
    }
    bloqueo.current = true;
    setBuscando(true);
    try {
      const res = await fetch(`${API}?imei=${encodeURIComponent(buscado)}`, { cache: "no-store" });
      const { equipo } = await leerRespuesta<{ equipo: Equipo }>(res, "No se encontró el equipo en Inventario Principal.");
      if (!equipo || equipo.imei !== buscado || !equipo.referencia) throw new Error("No se pudo confirmar la referencia del equipo.");
      setEquipos(actuales => [...actuales, equipo]);
      setImei("");
    } catch (error) {
      setErrorRegistro(mensajeError(error, "No se pudo buscar el equipo."));
    } finally {
      bloqueo.current = false;
      setBuscando(false);
    }
  }

  async function registrarFactura(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listoParaRegistrar || bloqueo.current) return;
    setErrorRegistro("");
    const centavos = paymentAmountToCents(valor);
    if (!factura.trim() || !proveedorId || !equipos.length || !centavos) {
      setErrorRegistro("Completa la factura y el proveedor, agrega al menos un equipo e indica un valor mayor a cero.");
      return;
    }
    bloqueo.current = true;
    setGuardando(true);
    try {
      const response = await guardar(API, {
        numeroFactura: factura.trim(),
        proveedorId: Number(proveedorId),
        imeis: equipos.map(equipo => equipo.imei),
        valor: centavosADecimalProveedor(centavos),
      });
      const { item } = await leerRespuesta<{ item: Deuda }>(response, "No se pudo registrar la factura.");
      if (!item?.id) throw new Error("No se pudo confirmar el registro. Actualiza el listado antes de reintentar.");
      actualizarItem(item);
      setRegistroAbierto(false);
      setFactura("");
      setProveedorId("");
      setValor("");
      setEquipos([]);
      setImei("");
      setAviso(`Factura ${item.numeroFactura} registrada.`);
    } catch (error) {
      setErrorRegistro(mensajeError(error, "No se pudo registrar la factura."));
    } finally {
      bloqueo.current = false;
      setGuardando(false);
    }
  }

  async function registrarPago(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deuda || bloqueo.current) return;
    setErrorPago("");
    setAviso("");
    if (!pagoCentavos || pagoCentavos > saldoCentavos) {
      setErrorPago("El pago debe ser mayor a cero y no puede superar el saldo pendiente.");
      return;
    }
    const solicitud = `${deuda.id}:${pagoCentavos}`;
    const clave = clavesPago.current.get(solicitud) ?? crypto.randomUUID();
    clavesPago.current.set(solicitud, clave);
    bloqueo.current = true;
    setGuardando(true);
    try {
      const response = await guardar(`${API}/pagos`, {
        deudaId: deuda.id,
        valor: centavosADecimalProveedor(pagoCentavos),
        claveIdempotencia: clave,
      });
      const { item } = await leerRespuesta<{ item: Deuda }>(response, "No se pudo registrar el pago.");
      if (item?.id !== deuda.id) throw new Error("No se pudo confirmar el pago. Intenta nuevamente.");
      actualizarItem(item);
      clavesPago.current.delete(solicitud);
      setValorPago("");
      setAviso(`Pago registrado para la factura ${item.numeroFactura}.`);
    } catch (error) {
      setErrorPago(mensajeError(error, "No se pudo registrar el pago."));
    } finally {
      bloqueo.current = false;
      setGuardando(false);
    }
  }

  return <>
    <div className={bodegaStyles.heading}>
      <div>
        <p className={bodegaStyles.eyebrow}><span />BODEGA PRINCIPAL</p>
        <h1>Deuda</h1>
        <p>Facturas por pagar a proveedores y registro de abonos.</p>
      </div>
      <div className={bodegaStyles.actions}>
        <button type="button" className={`${bodegaStyles.button} ${styles.primary}`} disabled={!listoParaRegistrar} onClick={() => {
          setAviso("");
          setErrorRegistro("");
          setRegistroAbierto(true);
        }}>
          <DashboardIcon name="document-add" />Registrar factura
        </button>
      </div>
    </div>
    {errorCarga && <p className={styles.error} role="alert">{errorCarga}</p>}
    {aviso && deudaId === null && <p className={styles.success} role="status">{aviso}</p>}
    {consulta && !proveedores.length && !cargando && !errorCarga &&
      <p className={styles.note}>Agrega un distribuidor en Inventario Principal para registrar una factura.</p>}
    <section className={bodegaStyles.panel} aria-labelledby="facturas-bodega-title" aria-busy={cargando}>
      <div className={bodegaStyles.panelHeading}>
        <div>
          <h2 id="facturas-bodega-title">Facturas de bodega</h2>
          <p>{consulta
            ? `${items.length.toLocaleString("es-CO")} ${items.length === 1 ? "factura registrada" : "facturas registradas"}`
            : "Consulta de facturas y pagos"}</p>
        </div>
        <button type="button" className={bodegaStyles.button} disabled={cargando || guardando} onClick={() => {
          setCargando(true);
          setErrorCarga("");
          setVersion(actual => actual + 1);
        }}>
          <DashboardIcon name="refresh" />{cargando ? "Actualizando…" : "Actualizar"}
        </button>
      </div>
      <div className={bodegaStyles.debtTools}>
        <div>
          <span>Saldo pendiente</span>
          <strong>{consulta ? formatMoney.format(totalPendiente / 100) : "—"}</strong>
        </div>
      </div>
      <div className={bodegaStyles.tableScroll} role="region" aria-label="Facturas de bodega" tabIndex={0}>
        <table className={`${bodegaStyles.table} ${styles.table}`}>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">N.° factura</th>
              <th scope="col">Proveedor</th>
              <th scope="col">Referencia / IMEI</th>
              <th scope="col" className={bodegaStyles.numeric}>Valor</th>
              <th scope="col" className={bodegaStyles.numeric}>Abonado</th>
              <th scope="col" className={bodegaStyles.numeric}>Saldo</th>
              <th scope="col" className={bodegaStyles.numeric}>Días de deuda</th>
              <th scope="col">Pagos</th>
            </tr>
          </thead>
          <tbody>
            {!items.length && <tr><td colSpan={9} className={bodegaStyles.empty}>
              {cargando ? "Cargando facturas…" : consulta ? "Todavía no hay facturas registradas." : "No se pudo cargar el listado."}
            </td></tr>}
            {items.map(item => <tr key={item.id}>
              <td className={styles.date}><time dateTime={item.fecha}>{mostrarFecha(item.fecha)}</time></td>
              <td><strong>{item.numeroFactura}</strong></td>
              <td>{item.proveedor}</td>
              <td>{item.equipos.length === 1 ? <>
                <strong>{item.equipos[0].referencia}</strong><span className={styles.imei}>{item.equipos[0].imei}</span>
              </> : <details className={styles.equipmentDetails}>
                <summary>{item.equipos.length.toLocaleString("es-CO")} equipos</summary>
                <ul className={styles.tableDevices}>{item.equipos.map(equipo => <li key={equipo.imei}>
                  <strong>{equipo.referencia}</strong><span className={styles.imei}>{equipo.imei}</span>
                </li>)}</ul>
              </details>}</td>
              <td className={`${bodegaStyles.numeric} ${styles.money}`}>{formatMoney.format(Number(item.valor))}</td>
              <td className={`${bodegaStyles.numeric} ${styles.money}`}>{formatMoney.format(Number(item.abonado))}</td>
              <td className={`${bodegaStyles.numeric} ${styles.money}`}>
                <strong>{formatMoney.format(Number(item.saldo))}</strong>
                {Number(item.saldo) <= 0 && <span className={styles.paid}>Pagada</span>}
              </td>
              <td className={bodegaStyles.numeric}>{item.diasDeuda.toLocaleString("es-CO")}</td>
              <td><button type="button" className={bodegaStyles.button} disabled={cargando} aria-label={`Pagos de la factura ${item.numeroFactura}`} onClick={() => {
                setAviso("");
                setDeudaId(item.id);
                setValorPago("");
                setErrorPago("");
              }}>Pagos</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {registroAbierto && <LoanDialog title="Registrar factura" open busy={guardando || buscando} onClose={() => setRegistroAbierto(false)} footer={
      <>
        <button type="button" className={bodegaStyles.button} disabled={guardando || buscando} onClick={() => setRegistroAbierto(false)}>Cancelar</button>
        <button type="submit" form="registro-factura-bodega" className={styles.primary} disabled={!listoParaRegistrar || buscando}>{guardando ? "Registrando…" : "Registrar factura"}</button>
      </>
    }>
      <form id="registro-factura-bodega" onSubmit={registrarFactura} className={styles.form}>
        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="fecha-deuda">Fecha</label>
            <input id="fecha-deuda" readOnly value={consulta ? mostrarFecha(consulta.hoy) : "—"} />
          </div>
          <div className={styles.field}>
            <label htmlFor="numero-factura-deuda">N.° factura</label>
            <input id="numero-factura-deuda" required maxLength={120} value={factura} disabled={guardando} onChange={event => setFactura(event.target.value)} />
          </div>
          <div className={styles.field}>
            <label htmlFor="proveedor-deuda">Proveedor</label>
            <select id="proveedor-deuda" required value={proveedorId} disabled={guardando} onChange={event => setProveedorId(event.target.value)}>
              <option value="">Seleccionar proveedor</option>
              {proveedores.map(proveedor => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
            </select>
          </div>
          <CampoValor id="valor-deuda" label="Valor total (COP)" value={valor} onChange={setValor} disabled={guardando} />
        </div>
        <div className={styles.field}>
          <label htmlFor="imei-deuda">IMEI</label>
          <div className={styles.inline}>
            <input id="imei-deuda" inputMode="numeric" autoComplete="off" maxLength={15} value={imei} disabled={guardando || buscando}
              onChange={event => setImei(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void buscarEquipo();
                }
              }}
            />
            <button type="button" className={bodegaStyles.button} disabled={guardando || buscando} onClick={() => void buscarEquipo()}>
              <DashboardIcon name="search" />{buscando ? "Buscando…" : "Agregar equipo"}
            </button>
          </div>
          <p className={styles.note}>La referencia se completa desde Inventario Principal.</p>
        </div>
        {equipos.length > 0 && <ul className={styles.selectedDevices} aria-label="Equipos de la factura">
          {equipos.map(equipo => <li key={equipo.imei}>
            <div><strong>{equipo.referencia}</strong><span className={styles.imei}>{equipo.imei}</span></div>
            <button type="button" className={bodegaStyles.button} disabled={guardando || buscando} aria-label={`Quitar ${equipo.imei}`}
              onClick={() => setEquipos(actuales => actuales.filter(item => item.imei !== equipo.imei))}>Quitar</button>
          </li>)}
        </ul>}
        {errorRegistro && <p className={styles.error} role="alert">{errorRegistro}</p>}
      </form>
    </LoanDialog>}

    {deuda && <LoanDialog title="Pagos de la factura" open busy={guardando} onClose={() => setDeudaId(null)} footer={
      <>
        <button type="button" className={bodegaStyles.button} disabled={guardando} onClick={() => setDeudaId(null)}>Cerrar</button>
        {saldoCentavos > 0 && <button type="submit" form="pago-factura-bodega" className={styles.primary} disabled={guardando || !pagoCentavos || pagoCentavos > saldoCentavos}>
          {guardando ? "Registrando…" : "Registrar pago"}
        </button>}
      </>
    }>
      <div className={styles.form}>
        <p className={styles.invoiceProvider}>{deuda.proveedor}<span>Factura {deuda.numeroFactura}</span></p>
        <div className={styles.balance}>
          <div><span>Valor de la factura</span><strong>{formatMoney.format(Number(deuda.valor))}</strong></div>
          <div><span>Abonado</span><strong>{formatMoney.format(Number(deuda.abonado))}</strong></div>
          <div><span>Saldo pendiente</span><strong>{formatMoney.format(Number(deuda.saldo))}</strong></div>
        </div>
        {saldoCentavos > 0 && <form id="pago-factura-bodega" onSubmit={registrarPago}>
          <div className={styles.inline}>
            <CampoValor id="valor-pago-deuda" label="Valor del pago (COP)" value={valorPago} onChange={setValorPago} disabled={guardando} />
            <button type="button" className={bodegaStyles.button} disabled={guardando} onClick={() => setValorPago(centavosADecimalProveedor(saldoCentavos) ?? "")}>
              Usar saldo completo
            </button>
          </div>
        </form>}
        {(errorPago || pagoCentavos > saldoCentavos) && <p className={styles.error} role="alert">
          {errorPago || "El valor supera el saldo pendiente."}
        </p>}
        {aviso && <p className={styles.success} role="status">{aviso}</p>}
        <div className={styles.paymentHistory}>
          <h3>Historial de pagos</h3>
          {!deuda.pagos.length ? <p className={styles.note}>Esta factura aún no tiene pagos registrados.</p> : <ul>
            {deuda.pagos.map(pago => <li key={pago.id}>
              <div><time dateTime={pago.fecha}>{mostrarFecha(pago.fecha)}</time><span>{pago.registradoPor}</span></div>
              <strong>{formatMoney.format(Number(pago.valor))}</strong>
            </li>)}
          </ul>}
        </div>
      </div>
    </LoanDialog>}
  </>;
}
