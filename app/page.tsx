"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  const login = async () => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ usuario, clave }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`❌ ${data.error || "Error al conectar con el servidor"}`);
        setCargando(false);
        return;
      }

      setMensaje(`✅ Bienvenido ${data.usuario.nombre}`);

      setTimeout(() => {
        router.push("/dashboard");
      }, 700);
    } catch {
      setMensaje("❌ Error al conectar con el servidor");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="mb-8 text-center text-4xl font-bold text-slate-800">
          Login CONECTAMOS
        </h1>

        <input
          type="text"
          placeholder="Usuario"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className="mb-4 w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-xl text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
        />

        <input
          type="password"
          placeholder="Clave"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          className="mb-5 w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-xl text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
        />

        <button
          onClick={login}
          disabled={cargando}
          className="w-full rounded-2xl bg-red-600 py-4 text-2xl font-semibold text-white transition hover:bg-red-700 disabled:opacity-70"
        >
          {cargando ? "Ingresando..." : "Ingresar"}
        </button>

        {mensaje && (
          <p className="mt-6 text-center text-lg text-slate-700">{mensaje}</p>
        )}
      </div>
    </div>
  );
}
