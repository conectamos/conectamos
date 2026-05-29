import prisma from "@/lib/prisma";

type RegistroConIntentoSiigo = {
  id: number;
  siigoInvoiceAttempt?: unknown;
};

export async function avanzarIntentoFacturaSiigo<
  T extends RegistroConIntentoSiigo
>(registro: T): Promise<T> {
  const actualizado = await prisma.registroVendedorVenta.update({
    where: { id: registro.id },
    data: {
      siigoInvoiceAttempt: {
        increment: 1,
      },
    },
    select: {
      siigoInvoiceAttempt: true,
    },
  });

  return {
    ...registro,
    siigoInvoiceAttempt: actualizado.siigoInvoiceAttempt,
  };
}
