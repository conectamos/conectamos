import {
  buscarEquipoDeudaBodega,
  listarDeudasBodega,
  registrarDeudaBodega,
} from "@/lib/bodega-supplier-debt";
import { conAccesoDeudaBodega, jsonDeudaBodega, leerSolicitudDeudaBodega } from "@/app/api/bodega/deudas/access";

export async function GET(request: Request) {
  return conAccesoDeudaBodega(async () => {
    const imei = new URL(request.url).searchParams.get("imei");
    if (imei !== null) {
      return jsonDeudaBodega({ equipo: await buscarEquipoDeudaBodega(imei) });
    }
    return jsonDeudaBodega(await listarDeudasBodega());
  });
}

export async function POST(request: Request) {
  return conAccesoDeudaBodega(async (actor) => {
    const body = await leerSolicitudDeudaBodega(request);
    const item = await registrarDeudaBodega(body, actor);
    return jsonDeudaBodega({ item }, 201);
  });
}
