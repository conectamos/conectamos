"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LogoutButtonProps = {
  className?: string;
  variant?: "dark" | "light";
};

export default function LogoutButton({
  className = "",
  variant = "dark",
}: LogoutButtonProps) {
  const router = useRouter();
  const [cerrando, setCerrando] = useState(false);

  const cerrarSesion = async () => {
    try {
      setCerrando(true);

      const res = await fetch("/api/logout", {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("No se pudo cerrar la sesion");
      }

      router.replace("/");
      router.refresh();
    } catch {
      setCerrando(false);
      window.alert("No se pudo cerrar la sesion. Intenta de nuevo.");
    }
  };

  return (
    <button
      type="button"
      onClick={cerrarSesion}
      disabled={cerrando}
      className={[
        "inline-flex items-center justify-center rounded-2xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70",
        variant === "light"
          ? "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
          : "border-white/15 bg-white/10 text-white backdrop-blur hover:border-white/25 hover:bg-white/16",
        className,
      ].join(" ")}
    >
      {cerrando ? "Cerrando..." : "Cerrar sesion"}
    </button>
  );
}
