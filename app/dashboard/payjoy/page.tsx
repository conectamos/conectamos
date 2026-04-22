import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import PayJoyCarteraWorkspace from "./_components/payjoy-cartera-workspace";

export default async function PayJoyPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (String(user.rolNombre || "").toUpperCase() !== "ADMIN") {
    redirect("/dashboard");
  }

  return <PayJoyCarteraWorkspace />;
}
