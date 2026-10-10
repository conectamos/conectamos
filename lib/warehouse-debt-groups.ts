type EquipoDeudaPrincipal = {
  sedeDestinoId?: number | null;
  sedeDestinoNombre?: string | null;
  estadoCobro?: string | null;
  costo?: number | string | null;
};

type SedeDeudora = { id: number; nombre: string };

export type GrupoDeudaSede = {
  key: string;
  sedeId: number | null;
  nombre: string;
  equipos: number;
  totalPendiente: number;
};

function sedeIdDeudora(item: EquipoDeudaPrincipal): number | null {
  return Number.isInteger(item.sedeDestinoId) && Number(item.sedeDestinoId) > 0
    ? Number(item.sedeDestinoId)
    : null;
}

export function claveSedeDeudora(item: EquipoDeudaPrincipal): string {
  const sedeId = sedeIdDeudora(item);
  return sedeId === null ? "sin-sede" : `sede:${sedeId}`;
}

// Recibe la consulta completa ya autorizada y filtrada, antes de paginar.
export function agruparDeudasPorSede(
  items: readonly EquipoDeudaPrincipal[],
  sedes: readonly SedeDeudora[],
): GrupoDeudaSede[] {
  const nombresSedes = new Map(sedes.map((sede) => [sede.id, sede.nombre.trim()]));
  const grupos = new Map<string, GrupoDeudaSede & { centavos: number; nombreActual: boolean }>();

  for (const item of items) {
    if (item.estadoCobro?.trim().toUpperCase() !== "PENDIENTE") continue;

    const sedeId = sedeIdDeudora(item);
    const key = claveSedeDeudora(item);
    const nombreActual = sedeId === null ? "" : item.sedeDestinoNombre?.trim() || "";
    const nombre = sedeId === null
      ? "Deudor no identificado"
      : nombreActual || nombresSedes.get(sedeId) || `Sede #${sedeId}`;
    const grupo = grupos.get(key) || {
      key, sedeId, nombre, equipos: 0, totalPendiente: 0, centavos: 0,
      nombreActual: Boolean(nombreActual),
    };

    if (nombreActual && !grupo.nombreActual) {
      grupo.nombre = nombreActual;
      grupo.nombreActual = true;
    }
    const costo = Number(item.costo ?? 0);
    // La deuda vigente del principal es su costo mientras el cobro esté pendiente.
    // Sumar centavos evita arrastrar el error binario de sumas como 0,1 + 0,2.
    grupo.centavos += Number.isFinite(costo)
      ? Math.round((costo + Number.EPSILON * Math.max(1, Math.abs(costo))) * 100)
      : 0;
    grupo.equipos += 1;
    grupos.set(key, grupo);
  }

  return [...grupos.values()]
    .map(({ key, sedeId, nombre, equipos, centavos }) => ({
      key, sedeId, nombre, equipos, totalPendiente: centavos / 100,
    }))
    .sort((a, b) => b.totalPendiente - a.totalPendiente
      || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base", numeric: true })
      || a.key.localeCompare(b.key, "es", { numeric: true }));
}
