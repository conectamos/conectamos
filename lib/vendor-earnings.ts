import prisma from "@/lib/prisma";
import {
  normalizarClaveReferenciaListaPrecio,
  obtenerListaPrecios,
} from "@/lib/price-list";

export type VendorEarningsItem = {
  id: number;
  referencia: string;
  clienteNombre: string;
  valorComision: number;
  createdAt: Date;
};

export type VendorEarningsSummary = {
  totalGanado: number;
  totalVentasConComision: number;
  totalReferenciasConComision: number;
  recientes: VendorEarningsItem[];
};

export async function getVendorEarningsSummary(
  perfilVendedorId: number
): Promise<VendorEarningsSummary> {
  if (!Number.isInteger(perfilVendedorId) || perfilVendedorId <= 0) {
    return {
      totalGanado: 0,
      totalVentasConComision: 0,
      totalReferenciasConComision: 0,
      recientes: [],
    };
  }

  const [registros, precios] = await Promise.all([
    prisma.registroVendedorVenta.findMany({
      where: {
        perfilVendedorId,
        eliminadoEn: null,
        NOT: {
          estadoVentaRegistro: "CANCELADO",
        },
      },
      select: {
        id: true,
        referenciaEquipo: true,
        clienteNombre: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    obtenerListaPrecios(),
  ]);

  const comisionPorReferencia = new Map<string, number>();
  const referenciasConComision = new Set<string>();

  for (const item of [...precios].sort(
    (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()
  )) {
    const clave = normalizarClaveReferenciaListaPrecio(item.referencia);

    if (!clave) {
      continue;
    }

    comisionPorReferencia.set(clave, Number(item.comisionVendedor || 0));
  }

  const recientes: VendorEarningsItem[] = [];
  let totalGanado = 0;
  let totalVentasConComision = 0;

  for (const registro of registros) {
    const clave = normalizarClaveReferenciaListaPrecio(registro.referenciaEquipo);
    const valorComision = clave ? Number(comisionPorReferencia.get(clave) || 0) : 0;

    if (valorComision <= 0) {
      continue;
    }

    totalGanado += valorComision;
    totalVentasConComision += 1;
    referenciasConComision.add(clave);

    if (recientes.length < 5) {
      recientes.push({
        id: registro.id,
        referencia: String(registro.referenciaEquipo || "Sin referencia"),
        clienteNombre: registro.clienteNombre,
        valorComision,
        createdAt: registro.createdAt,
      });
    }
  }

  return {
    totalGanado,
    totalVentasConComision,
    totalReferenciasConComision: referenciasConComision.size,
    recientes,
  };
}
