import { registrarPagoDeudaBodega } from "@/lib/bodega-supplier-debt";
import { conAccesoDeudaBodega, jsonDeudaBodega, leerSolicitudDeudaBodega } from "@/app/api/bodega/deudas/access";

export async function POST(request: Request) {
  return conAccesoDeudaBodega(async (actor) => {
    const body = await leerSolicitudDeudaBodega(request);
    const item = await registrarPagoDeudaBodega(body, actor);
    return jsonDeudaBodega({ item }, 201);
  });
}
