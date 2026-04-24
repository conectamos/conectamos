import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { esPerfilFacturador, esPerfilVendedor } from "@/lib/access-control";

export async function requireSessionPage() {
  const session = await getSessionUser();

  if (!session) {
    redirect("/");
  }

  return session;
}

export async function requireNonVendorPage() {
  const session = await requireSessionPage();

  if (esPerfilVendedor(session.perfilTipo) || esPerfilFacturador(session.perfilTipo)) {
    redirect("/dashboard");
  }

  return session;
}

export async function requireVendorPage() {
  const session = await requireSessionPage();

  if (!esPerfilVendedor(session.perfilTipo)) {
    redirect("/dashboard");
  }

  return session;
}

export async function requireFacturadorPage() {
  const session = await requireSessionPage();

  if (!esPerfilFacturador(session.perfilTipo)) {
    redirect("/dashboard");
  }

  return session;
}
