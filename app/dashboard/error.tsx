"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8] p-5">
      <section className="w-full max-w-lg rounded-2xl border border-red-100 bg-white p-7 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl font-black text-[#e30613]">!</div>
        <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-950">No pudimos cargar el dashboard</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Los datos no fueron modificados. Reintenta la consulta o vuelve a ingresar más tarde.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-xl bg-[#e30613] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#c9000c]"
        >
          Reintentar
        </button>
      </section>
    </main>
  );
}
