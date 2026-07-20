"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TIPOS_PRODUCTO } from "@/lib/product-types";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";

const OPCIONES_PROVEEDOR_SEDE = [
  "Proveedor FINSER",
  "Proveedor BUNQUER",
  "Proveedor TECNOSUPER",
  "Proveedor IPHONE ANGIE",
  "Proveedor Felipe",
  "Proveedor SEDE 1",
  "Proveedor SEDE 2",
  "Proveedor SEDE 3",
  "Proveedor SEDE 4",
  "Proveedor SEDE 5",
  "Proveedor SEDE 6",
  "Proveedor SEDE 7",
  "Proveedor EMOVIL",
  "Proveedor POLLO",
  "Proveedor ANDRES",
  "Proveedor EMMATECH",
];

const OPCIONES_PROVEEDOR_BODEGA = [
  "COMUNICARIBE",
  "HOLA PLAZA",
  "CONMOVIL",
  "CORBETA",
  "OPORTUNIDADES",
  "Proveedor Felipe",
];

type SessionUser = {
  id: number;
  nombre: string;
  usuario: string;
  sedeId: number;
  sedeNombre: string;
  rolId: number;
  rolNombre: string;
};

type ReferenciaCatalogo = {
  id: number;
  nombre: string;
  activo: boolean;
};

function formatearPesos(valor: string) {
  const limpio = valor.replace(/\D/g, "");
  if (!limpio) return "";
  return `$ ${Number(limpio).toLocaleString("es-CO")}`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 block text-sm font-bold text-slate-700">
      {children}
    </label>
  );
}

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function NuevoInventarioPage() {
  const [user, setUser] = useState<SessionUser | null>(null);

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
  const [referenciasCatalogo, setReferenciasCatalogo] = useState<ReferenciaCatalogo[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cantidadImeisMasivos = useMemo(
    () =>
      imeisMasivos
        .split("\n")
        .map((valor) => valor.replace(/\D/g, "").trim())
        .filter(Boolean).length,
    [imeisMasivos]
  );
  const esAdmin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre?.toUpperCase() || "");
  const esCargaMasiva = cantidadImeisMasivos > 0;
  const opcionesDistribuidor = esAdmin
    ? OPCIONES_PROVEEDOR_BODEGA
    : OPCIONES_PROVEEDOR_SEDE;
  const referenciasActivas = useMemo(
    () => referenciasCatalogo.filter((item) => item.activo),
    [referenciasCatalogo]
  );

  const mensajeEsOk = useMemo(() => mensaje.startsWith("OK:"), [mensaje]);

  const cargarUsuario = async () => {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
      }
    } catch (error) {
      console.error("Error cargando usuario:", error);
    }
  };

  const cargarReferenciasCatalogo = async () => {
    try {
      const res = await fetch("/api/inventario-principal/referencias", {
        cache: "no-store",
      });
      const data = await res.json();

      if (res.ok && Array.isArray(data.referencias)) {
        setReferenciasCatalogo(data.referencias);
      }
    } catch (error) {
      console.error("Error cargando referencias:", error);
    }
  };

  useEffect(() => {
    void cargarUsuario();
    void cargarReferenciasCatalogo();
  }, []);

  const buscarIMEI = async (imeiValor: string) => {
    try {
      const res = await fetch("/api/inventario-principal/buscar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imei: imeiValor }),
      });

      if (!res.ok) {
        return;
      }

      const data = await res.json();

      setReferencia(data.referencia || "");
      setTipoProducto(data.tipoProducto || "TELEFONIA");
      setColor(data.color || "");
      setCosto(data.costo ? String(data.costo) : "");

      if (esAdmin) {
        setNumeroFactura(data.numeroFactura || "");
        setDistribuidor(data.distribuidor || "");
      }
    } catch (error) {
      console.error("Error buscando IMEI:", error);
    }
  };

  const limpiarFormulario = () => {
    setImei("");
    setImeisMasivos("");
    setReferencia("");
    setTipoProducto("TELEFONIA");
    setColor("");
    setCosto("");
    setNumeroFactura("");
    setDistribuidor("");
    setEstadoFinanciero("PAGO");
    setDeboA("");
  };

  const obtenerImeisAdmin = () => {
    const listaMasiva = imeisMasivos
      .split("\n")
      .map((valor) => valor.replace(/\D/g, "").trim())
      .filter((valor) => valor.length > 0);

    const imeiUnico = imei.replace(/\D/g, "").trim();

    if (listaMasiva.length > 0) return listaMasiva;
    if (imeiUnico) return [imeiUnico];
    return [];
  };

  const guardar = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      if (!user) {
        setMensaje("Error: no se pudo identificar el usuario.");
        return;
      }

      if (!referencia) {
        setMensaje("Error: la referencia es obligatoria.");
        return;
      }

      if (
        esAdmin &&
        !referenciasActivas.some((item) => item.nombre === referencia)
      ) {
        setMensaje("Error: selecciona una referencia activa del catalogo.");
        return;
      }

      if (!costo) {
        setMensaje("Error: el costo es obligatorio.");
        return;
      }

      if (!distribuidor) {
        setMensaje("Error: debes seleccionar un distribuidor.");
        return;
      }

      if (esAdmin) {
        const imeis = obtenerImeisAdmin();

        if (imeis.length === 0) {
          setMensaje("Error: debes ingresar al menos un IMEI.");
          return;
        }

        const imeiInvalido = imeis.find((valor) => valor.length !== 15);
        if (imeiInvalido) {
          setMensaje("Error: todos los IMEIs deben tener exactamente 15 digitos.");
          return;
        }

        if (!numeroFactura) {
          setMensaje("Error: el numero de factura es obligatorio.");
          return;
        }

        const res = await fetch("/api/inventario-principal", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imeis,
            referencia,
            tipoProducto,
            color,
            costo: Number(costo),
            numeroFactura,
            distribuidor,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setMensaje(`Error: ${data.error || "No se pudo guardar en bodega principal."}`);
          return;
        }

        setMensaje(
          `OK: ${data.insertados ?? imeis.length} equipo(s) guardado(s) correctamente en bodega principal.`
        );
        limpiarFormulario();
        return;
      }

      const imeis = obtenerImeisAdmin();

      if (imeis.length === 0) {
        setMensaje("Error: debes ingresar al menos un IMEI.");
        return;
      }

      const imeiInvalido = imeis.find((valor) => valor.length !== 15);
      if (imeiInvalido) {
        setMensaje("Error: todos los IMEIs deben tener exactamente 15 digitos.");
        return;
      }

      if (!estadoFinanciero) {
        setMensaje("Error: debes seleccionar el estado financiero.");
        return;
      }

      if (estadoFinanciero === "DEUDA" && !deboA) {
        setMensaje("Error: debes seleccionar a quien se debe.");
        return;
      }

      const res = await fetch("/api/inventario", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imeis,
          imei: imeis[0],
          referencia,
          tipoProducto,
          color,
          costo: Number(costo),
          distribuidor,
          estadoFinanciero,
          deboA: estadoFinanciero === "DEUDA" ? deboA : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "No se pudo guardar el equipo."}`);
        return;
      }

      const insertados = Number(data.insertados ?? imeis.length);
      const omitidos = Number(data.omitidos ?? 0);
      const mensajeBase =
        insertados === 1
          ? "OK: 1 equipo guardado correctamente."
          : `OK: ${insertados} equipos guardados correctamente.`;

      setMensaje(
        omitidos > 0
          ? `${mensajeBase} ${omitidos} IMEI(s) se omitieron por existir ya en esta sede o repetirse en la carga.`
          : mensajeBase
      );
      limpiarFormulario();
    } catch (error) {
      console.error(error);
      setMensaje("Error: ocurrio un problema guardando el equipo.");
    } finally {
      setGuardando(false);
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
  const destinoActual = esAdmin
    ? "Bodega principal"
    : user?.sedeNombre || "Tu sede";
  const rutaCancelar = esAdmin ? "/inventario-principal" : "/inventario";

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/inventario"
        coverageLabel={destinoActual}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                Nuevo inventario
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Registra uno o varios equipos sin perder trazabilidad
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Destino: {destinoActual}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Modo: {esCargaMasiva ? "Carga masiva" : "Carga individual"}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  {esCargaMasiva
                    ? `${cantidadImeisMasivos} IMEI listos`
                    : imei.length === 15
                      ? "1 IMEI listo"
                      : "IMEI pendiente"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={rutaCancelar}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-[#e30613]"
              >
                Volver al inventario
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
            role="status"
            className={[
              "mt-6 rounded-2xl border px-5 py-4 text-sm font-semibold shadow-sm",
              mensajeEsOk
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800",
            ].join(" ")}
          >
            {mensaje.replace(/^OK:\s*/, "")}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <SectionCard
              eyebrow="Captura principal"
              title={esAdmin ? "Identificacion de equipos" : "Identificacion del equipo"}
              description={
                esAdmin
                  ? "Puedes registrar un solo IMEI o cargar varios en lote cuando comparten referencia, costo, factura y distribuidor."
                  : "Ingresa el IMEI y completa la informacion base del equipo para registrarlo correctamente en tu sede."
              }
            >
              <div className="grid gap-5">
                <div>
                  <FieldLabel>{esAdmin ? "IMEI individual (opcional)" : "IMEI"}</FieldLabel>
                  <input
                    placeholder="IMEI (15 digitos)"
                    value={imei}
                    onChange={(event) => {
                      const value = event.target.value.replace(/\D/g, "").slice(0, 15);
                      setImei(value);
                      if (!esAdmin && value.length === 15) {
                        void buscarIMEI(value);
                      }
                    }}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-lg font-semibold text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Solo numeros, exactamente 15 digitos.
                  </p>
                </div>

                <div>
                  <FieldLabel>IMEIs masivos (uno por linea)</FieldLabel>
                  <textarea
                    placeholder={`352041714273552\n352041714273553\n352041714273554`}
                    value={imeisMasivos}
                    onChange={(event) => setImeisMasivos(event.target.value)}
                    rows={7}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-base leading-8 text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    {esAdmin
                      ? "Usa esta carga solo cuando referencia, costo, factura y distribuidor sean los mismos."
                      : "Usa esta carga solo cuando referencia, costo, distribuidor y estado financiero sean los mismos."}
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="Ficha comercial"
              title="Datos del equipo"
              description="Completa la referencia, color, costo y datos de soporte para guardar el inventario con mejor trazabilidad."
            >
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel>Referencia</FieldLabel>
                  {esAdmin ? (
                    <>
                      <select
                        value={referencia}
                        onChange={(event) => setReferencia(event.target.value)}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                      >
                        <option value="">Seleccionar referencia</option>
                        {referenciasActivas.map((item) => (
                          <option key={item.id} value={item.nombre}>
                            {item.nombre}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-slate-500">
                        El catalogo se actualiza desde Bodega Principal.
                      </p>
                    </>
                  ) : (
                    <input
                      placeholder="Ej: iPhone 13"
                      value={referencia}
                      onChange={(event) => setReferencia(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                    />
                  )}
                </div>

                <div>
                  <FieldLabel>Tipo de producto</FieldLabel>
                  <select
                    value={tipoProducto}
                    onChange={(event) => setTipoProducto(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                  >
                    {TIPOS_PRODUCTO.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo === "TELEFONIA" ? "TELEFONIA" : "ELECTRODOMESTICO"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <FieldLabel>Color</FieldLabel>
                  <input
                    placeholder="Ej: Negro"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <FieldLabel>Costo</FieldLabel>
                  <input
                    placeholder="$ 0"
                    value={costo ? formatearPesos(costo) : ""}
                    onChange={(event) => {
                      const value = event.target.value.replace(/\D/g, "");
                      setCosto(value);
                    }}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                {esAdmin && (
                  <div>
                    <FieldLabel>Numero de factura</FieldLabel>
                    <input
                      placeholder="Ej: FAC-001245"
                      value={numeroFactura}
                      onChange={(event) => setNumeroFactura(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                )}

                <div className={esAdmin ? "md:col-span-2" : ""}>
                  <FieldLabel>Distribuidor</FieldLabel>
                  <select
                    value={distribuidor}
                    onChange={(event) => setDistribuidor(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="">Seleccionar distribuidor</option>
                    {opcionesDistribuidor.map((opcion) => (
                      <option key={opcion} value={opcion}>
                        {opcion}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </SectionCard>

            {!esAdmin && (
              <SectionCard
                eyebrow="Cobertura financiera"
                title="Estado financiero de la sede"
                description="Define si el equipo entra pagado, en deuda o cancelado, y a quien se le debe cuando aplica."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <FieldLabel>Estado financiero</FieldLabel>
                    <select
                      value={estadoFinanciero}
                      onChange={(event) => {
                        const valor = event.target.value;
                        setEstadoFinanciero(valor);
                        if (valor !== "DEUDA") {
                          setDeboA("");
                        }
                      }}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                    >
                      <option value="PAGO">PAGO</option>
                      <option value="DEUDA">DEUDA</option>
                      <option value="CANCELADO">CANCELADO</option>
                    </select>
                  </div>

                  {estadoFinanciero === "DEUDA" && (
                    <div>
                      <FieldLabel>Debe a</FieldLabel>
                      <select
                        value={deboA}
                        onChange={(event) => setDeboA(event.target.value)}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                      >
                        <option value="">Seleccionar proveedor</option>
                        {OPCIONES_PROVEEDOR_SEDE.map((opcion) => (
                          <option key={opcion} value={opcion}>
                            {opcion}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}
          </div>

          <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <SectionCard
              eyebrow="Control de carga"
              title="Revision final"
              description="Haz una ultima verificacion antes de guardar el inventario."
            >
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                      Modo de carga
                    </p>
                    <p className="mt-2 text-xl font-black text-slate-950">
                      {esCargaMasiva ? "Masiva" : "Individual"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {esCargaMasiva
                        ? `${cantidadImeisMasivos} IMEI para registrar`
                        : "Registro de un equipo"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                      Costo capturado
                    </p>
                    <p className="mt-2 text-xl font-black text-slate-950">
                      {costo ? formatearPesos(costo) : "$ 0"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Valor base del registro actual.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Referencia actual
                  </p>
                  <p className="mt-2 text-xl font-black text-slate-950">
                    {referencia || "Sin referencia"}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Distribuidor
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-950">
                    {distribuidor || "Pendiente"}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {esAdmin ? "Factura" : "Estado financiero"}
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-950">
                    {esAdmin
                      ? numeroFactura || "Pendiente"
                      : estadoFinanciero || "Pendiente"}
                  </p>
                  {!esAdmin && estadoFinanciero === "DEUDA" && (
                    <p className="mt-1 text-xs text-slate-500">
                      Acreedor: {deboA || "Pendiente"}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Estado de captura
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-950">
                    {guardando
                      ? "Guardando..."
                      : esCargaMasiva
                      ? `${cantidadImeisMasivos} equipo(s) listos`
                      : imei
                      ? esAdmin
                        ? "1 equipo listo"
                        : "Formulario listo para validar"
                      : "Pendiente por completar"}
                  </p>
                </div>
              </div>
            </SectionCard>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
              <div className="flex flex-col gap-3">
                <button
                  onClick={guardar}
                  disabled={guardando}
                  className="inline-flex min-h-[54px] items-center justify-center rounded-xl bg-[#e30613] px-6 py-4 text-center text-[15px] font-black text-white transition hover:bg-[#bd0711] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {guardando
                    ? "Guardando..."
                    : esAdmin
                    ? "Guardar en bodega principal"
                    : esCargaMasiva
                    ? "Guardar inventario masivo"
                    : "Guardar inventario"}
                </button>

                <Link
                  href={rutaCancelar}
                  className="inline-flex min-h-[54px] items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-4 text-center text-[15px] font-bold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
                >
                  Cancelar
                </Link>
              </div>
            </div>
          </div>
        </div>
        </main>
      </div>
    </div>
  );
}
