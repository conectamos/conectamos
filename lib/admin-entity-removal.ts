import prisma from "@/lib/prisma";
import { esSedeBodegaPrincipal } from "@/lib/access-control";
import { puedeEliminarEntidadesCentrales, puedeEliminarPerfilComercial } from "@/lib/admin-entity-removal-access";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";

type Actor = { id: number; sedeId: number; usuario?: string; nombre?: string; perfilId?: number | null; rolNombre?: unknown; perfilTipo?: unknown };

export class AdminEntityRemovalError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "AdminEntityRemovalError"; }
}

export function validarIdEntidad(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new AdminEntityRemovalError("El registro seleccionado no es válido.");
  }
  return value;
}

function authorize(actor: Actor) {
  if (!puedeEliminarEntidadesCentrales(actor)) throw new AdminEntityRemovalError("Solo el administrador central puede eliminar sedes y vendedores.", 403);
}

function actorLabel(actor: Actor) {
  return `${actor.usuario || actor.nombre || "Administrador"} (#${actor.id})${actor.perfilId ? ` · perfil #${actor.perfilId}` : ""}`;
}

function sedeProtegida(sede: { nombre: string; codigo: string | null }) {
  const codigo = String(sede.codigo || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return esSedeBodegaPrincipal(sede.nombre) || ["BODEGAPRINCIPAL", "PRINCIPAL"].includes(codigo);
}

export async function eliminarSedeAdministrativa(actor: Actor, value: unknown) {
  authorize(actor);
  const id = validarIdEntidad(value);
  await ensureVendorProfilesSchema();
  return prisma.$transaction(async tx => {
    // Both removal operations serialize so retries cannot overwrite audit data.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('admin-entity-removal', 0))::text`;
    await tx.$queryRaw`SELECT "id" FROM "Sede" WHERE "id" = ${id} FOR UPDATE`;
    const sede = await tx.sede.findUnique({ where: { id }, select: { id: true, nombre: true, codigo: true, eliminadoEn: true } });
    if (!sede) throw new AdminEntityRemovalError("La sede no existe.", 404);
    if (sedeProtegida(sede)) throw new AdminEntityRemovalError("BODEGA PRINCIPAL está protegida y no se puede eliminar.", 409);
    if (id === actor.sedeId) throw new AdminEntityRemovalError("No puedes eliminar la sede desde la que estás operando.", 409);
    if (sede.eliminadoEn) return { id, nombre: sede.nombre };
    const administradores = await tx.usuario.count({ where: { sedeId: id, activo: true, rol: { nombre: "ADMIN" } } });
    if (administradores) throw new AdminEntityRemovalError("La sede tiene un acceso de administrador activo. Reasígnalo antes de eliminarla.", 409);

    const [equiposSede, equiposLegados, deudasSede, cobrosPrincipal, prestamos, ventasPendientes, facturasEnProceso] = await Promise.all([
      tx.inventarioSede.count({ where: { sedeId: id, estadoActual: { notIn: ["VENDIDO", "CANCELADO", "TRASLADO", "PRESTAMO_PAGO"] } } }),
      tx.inventario.count({ where: { sedeActualId: id, estadoActual: { notIn: ["VENDIDO", "CANCELADO", "TRASLADO", "PRESTAMO_PAGO"] } } }),
      tx.inventarioSede.count({ where: { sedeId: id, estadoFinanciero: "DEUDA" } }),
      tx.inventarioPrincipal.count({ where: { sedeDestinoId: id, estadoCobro: "PENDIENTE" } }),
      tx.prestamoSede.count({ where: { OR: [{ sedeOrigenId: id }, { sedeDestinoId: id }], estado: { in: ["PENDIENTE", "APROBADO", "PAGO_PENDIENTE_APROBACION", "DEVOLUCION_PENDIENTE"] } } }),
      tx.registroVendedorVenta.count({ where: { sedeId: id, eliminadoEn: null, ventaIdRelacionada: null, estadoVentaRegistro: { notIn: ["CONVERTIDO_EN_VENTA", "CANCELADO"] } } }),
      tx.facturaInventarioStand.count({ where: { sedeId: id, estado: "PROCESANDO" } }),
    ]);
    const blockers = [
      equiposSede + equiposLegados ? "equipos por gestionar" : "",
      deudasSede + cobrosPrincipal ? "deudas o cobros pendientes" : "",
      prestamos ? "préstamos abiertos" : "",
      ventasPendientes ? "ventas por aprobar" : "",
      facturasEnProceso ? "facturas en proceso" : "",
    ].filter(Boolean);
    if (blockers.length) throw new AdminEntityRemovalError(`No se puede eliminar la sede: tiene ${blockers.join(", ")}. Resuelve estos pendientes antes de continuar.`, 409);

    await tx.sede.update({ where: { id }, data: { activa: false, eliminadoEn: new Date(), eliminadoPor: actorLabel(actor) } });
    await tx.usuario.updateMany({ where: { sedeId: id }, data: { activo: false, activeSessionKey: null, activeSessionLastSeenAt: null } });
    return { id, nombre: sede.nombre };
  }, { maxWait: 15_000, timeout: 30_000 });
}

export async function eliminarPerfilComercial(actor: Actor, value: unknown) {
  authorize(actor);
  const id = validarIdEntidad(value);
  await ensureVendorProfilesSchema();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('admin-entity-removal', 0))::text`;
    await tx.$queryRaw`SELECT "id" FROM "PerfilVendedor" WHERE "id" = ${id} FOR UPDATE`;
    const perfil = await tx.perfilVendedor.findUnique({ where: { id }, select: { id: true, nombre: true, tipo: true, eliminadoEn: true } });
    if (!perfil) throw new AdminEntityRemovalError("El vendedor no existe.", 404);
    if (actor.perfilId === id) throw new AdminEntityRemovalError("No puedes eliminar el perfil con el que estás operando.", 409);
    if (!puedeEliminarPerfilComercial(perfil.tipo)) throw new AdminEntityRemovalError("Este perfil está protegido. Solo se pueden eliminar vendedores, apoyo operativo y supervisores de tienda.", 409);
    if (perfil.eliminadoEn) return { id, nombre: perfil.nombre };
    await tx.perfilVendedor.update({ where: { id }, data: { activo: false, eliminadoEn: new Date(), eliminadoPor: actorLabel(actor), activeSessionKey: null, activeSessionLastSeenAt: null } });
    return { id, nombre: perfil.nombre };
  }, { maxWait: 15_000, timeout: 30_000 });
}
