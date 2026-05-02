import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  esRolAdmin,
  puedeAccederModulosOperativos,
  puedeAccederPanelFacturador,
  puedeAccederPanelVendedor,
} from "@/lib/access-control";

export async function requireSessionPage() {
  const session = await getSessionUser();

  if (!session) {
    redirect("/");
  }

  return session;
}

export async function requireNonVendorPage() {
  const session = await requireSessionPage();

  if (!puedeAccederModulosOperativos(session.perfilTipo)) {
    redirect("/dashboard");
  }

  return session;
}

export async function requireVendorPage() {
  const session = await requireSessionPage();

  if (
    !puedeAccederPanelVendedor(session.perfilTipo, session.rolNombre) ||
    (!session.perfilId && !esRolAdmin(session.rolNombre))
  ) {
    redirect("/dashboard");
  }

  return session;
}

export async function requireFacturadorPage() {
  const session = await requireSessionPage();

  if (!puedeAccederPanelFacturador(session.perfilTipo, session.rolNombre)) {
    redirect("/dashboard");
  }

  return session;
}
