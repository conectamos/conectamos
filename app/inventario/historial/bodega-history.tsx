import Link from "next/link";
import { getBodegaNavigation } from "@/lib/bodega-navigation";
import Image from "next/image";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { obtenerHistorialBodega } from "@/lib/bodega-inventory-history";

function fecha(value: Date) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(value);
}

export default async function BodegaHistory({ imei, nombre }: { imei: string; nombre: string }) {
  const history = await obtenerHistorialBodega(imei);
  const sede = (id?: number | null) => history?.sedes.find(item => item.id === id)?.nombre || "—";
  return <div className="min-h-screen bg-[#f5f6f8] text-slate-950">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 md:px-8">
      <Link href="/dashboard" className="flex items-center gap-3 font-black"><Image src="/branding/conectamos-logo.png" alt="CONECTAMOS" width={44} height={44} className="h-11 w-11 object-contain" /><span>CONECTAMOS</span></Link>
      <nav aria-label="Navegación de bodega" className="flex flex-wrap gap-5 text-sm font-bold">
        {getBodegaNavigation().map(item => <Link key={item.href} href={item.href} className={`flex items-center gap-2 ${item.href === "/inventario-principal" ? "text-[#e30613]" : ""}`}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </nav>
      <SalesProfile name={nombre} role="BODEGA" />
    </header>
    <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-7 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-black">Historial del equipo</h1><p className="mt-2 text-slate-600">Trazabilidad de bodega principal · IMEI {imei || "sin seleccionar"}</p></div>
        <Link href="/inventario-principal" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold">Volver a bodega</Link>
      </div>
      {!history ? <section className="rounded-2xl border border-slate-200 bg-white p-6"><p>No se encontró un equipo de bodega principal con ese IMEI.</p></section> : <>
        <section className="grid gap-4 rounded-2xl bg-[#262e37] p-6 text-white sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-sm text-slate-300">Referencia</p><strong>{history.principal.referencia}</strong></div>
          <div><p className="text-sm text-slate-300">IMEI</p><strong className="break-all">{history.principal.imei}</strong></div>
          <div><p className="text-sm text-slate-300">Estado</p><strong>{history.principal.estado}</strong></div>
          <div><p className="text-sm text-slate-300">Sede destino</p><strong>{sede(history.principal.sedeDestinoId)}</strong></div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <h2 className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-lg font-black"><DashboardIcon name="inventory" className="h-6 w-6" />Datos del equipo</h2>
          <dl className="grid sm:grid-cols-2 lg:grid-cols-4">
            {[ ["Color", history.principal.color || "—"], ["Costo", `$ ${history.principal.costo.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`], ["Factura", history.principal.numeroFactura || "—"], ["Distribuidor", history.principal.distribuidor || "—"] ].map(([label, value]) => <div key={label} className="border-b border-r border-slate-200 p-5"><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 break-words font-bold">{value}</dd></div>)}
          </dl>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 bg-slate-50 px-5 py-4 text-lg font-black">Movimientos de bodega</h2>
          {history.movimientos.length === 0 ? <p className="p-5 text-slate-600">No hay movimientos adicionales registrados.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-slate-50"><tr>{["Fecha", "Movimiento", "Sede", "Detalle"].map(label => <th key={label} className="border-b border-r border-slate-200 px-5 py-3">{label}</th>)}</tr></thead>
            <tbody>{history.movimientos.map(item => <tr key={item.id}><td className="border-b border-r border-slate-200 px-5 py-4">{fecha(item.createdAt)}</td><td className="border-b border-r border-slate-200 px-5 py-4 font-bold">{item.tipoMovimiento.replaceAll("_", " ")}</td><td className="border-b border-r border-slate-200 px-5 py-4">{sede(item.sedeId)}</td><td className="whitespace-pre-wrap border-b border-slate-200 px-5 py-4">{item.observacion || "—"}</td></tr>)}</tbody>
          </table></div>}
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 bg-slate-50 px-5 py-4 text-lg font-black">Préstamos de bodega principal</h2>
          {history.prestamos.length === 0 ? <p className="p-5 text-slate-600">Sin préstamos registrados.</p> : history.prestamos.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 text-sm"><div><strong>#{item.id} · {sede(item.sedeOrigenId)} → {sede(item.sedeDestinoId)}</strong><p className="mt-1 text-slate-500">{fecha(item.createdAt)}</p></div><span className="rounded-full bg-slate-100 px-3 py-2 font-bold">{item.estado.replaceAll("_", " ")}</span></div>)}
        </section>
      </>}
    </main>
  </div>;
}
