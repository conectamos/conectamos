import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { puedePrepararBorradoresPayJoyDapta } from "@/lib/payjoy-dapta-access";
import PayJoyCarteraWorkspace from "./_components/payjoy-cartera-workspace";

export default async function PayJoyPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (!["ADMIN", "AUDITOR"].includes(String(user.rolNombre || "").toUpperCase())) {
    redirect("/dashboard");
  }

  return (
    <PayJoyCarteraWorkspace
      puedeEliminar={String(user.rolNombre || "").toUpperCase() === "ADMIN"}
      puedePrepararDapta={puedePrepararBorradoresPayJoyDapta(user)}
      user={{
        nombre: user.nombre,
        usuario: user.usuario,
        rolNombre: user.rolNombre,
        sedeNombre: user.sedeNombre,
      }}
    />
  );
}
