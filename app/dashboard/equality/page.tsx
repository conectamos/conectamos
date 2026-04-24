import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

type Tone = "slate" | "amber" | "indigo" | "red" | "emerald" | "violet";

type EqualityAction = {
  id: string;
  label: string;
  detail: string;
  tone: Tone;
  adminOnly?: boolean;
};

function toneClass(tone: Tone) {
  switch (tone) {
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "indigo":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "red":
      return "border-red-200 bg-red-50 text-red-700";
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "violet":
      return "border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function EqualityActionCard({
  action,
  esAdmin,
}: {
  action: EqualityAction;
  esAdmin: boolean;
}) {
  return (
    <div
      className={[
        "rounded-[24px] border px-4 py-4 shadow-sm",
        toneClass(action.tone),
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black tracking-tight">{action.label}</p>
          <p className="mt-2 text-xs leading-5 opacity-90">{action.detail}</p>
        </div>

        <span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
          {action.adminOnly && esAdmin ? "Admin" : "Listo"}
        </span>
      </div>
    </div>
  );
}

export default async function EqualityZeroTouchPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";
  const esSupervisor =
    String(user.perfilTipo || "").toUpperCase() === "SUPERVISOR_TIENDA" ||
    String(user.rolNombre || "").toUpperCase() === "SUPERVISOR";

  if (!esAdmin && !esSupervisor) {
    redirect("/dashboard");
  }

  const actions: EqualityAction[] = [
    {
      id: "consult",
      label: "Consultar",
      detail: "Busca el equipo y abre su detalle operativo dentro del panel Zero Touch.",
      tone: "slate",
    },
    {
      id: "enroll",
      label: "Inscribir",
      detail: "Prepara el flujo de enrolamiento del equipo dentro de Equality HBM.",
      tone: "amber",
    },
    {
      id: "validate",
      label: "Validar estado",
      detail: "Confirma si el equipo esta listo para entrega o si requiere revision.",
      tone: "indigo",
    },
    {
      id: "lock",
      label: "Bloquear",
      detail: "Aplica bloqueo remoto cuando la politica del negocio lo requiera.",
      tone: "red",
    },
    {
      id: "unlock",
      label: "Desbloquear",
      detail: "Libera el equipo cuando el estado del credito lo permita.",
      tone: "emerald",
    },
    ...(esAdmin
      ? ([
          {
            id: "release",
            label: "Liberar",
            detail: "Operacion exclusiva de administrador para liberar el equipo de forma definitiva.",
            tone: "violet",
            adminOnly: true,
          },
        ] as EqualityAction[])
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#f5f6fa] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[34px] border border-[#2a2d33] bg-[linear-gradient(135deg,#111318_0%,#181c24_58%,#222a35_100%)] px-6 py-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)] sm:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#b98746]/40 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f3d7a8]">
                  Equality Zero Touch
                </span>
                <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200">
                  Modulo independiente
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                  {esAdmin ? "Administrador" : "Supervisor"}
                </span>
              </div>

              <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                HBM Equality
              </h1>

              <div className="mt-4 h-[3px] w-16 rounded-full bg-[#c79a57]" />

              <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Este modulo es distinto a Nuovo Pay. Aqui quedaran las
                operaciones de Zero Touch para consultar, inscribir, validar
                estado, bloquear, desbloquear y, solo en admin, liberar.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/15 bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                Volver al dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[30px] border border-[#eadfce] bg-[linear-gradient(180deg,#fffdf9_0%,#fbf6ee_100%)] p-6 shadow-sm">
            <div className="inline-flex rounded-full border border-[#eadbc2] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b26b19]">
              Operaciones del panel
            </div>

            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
              Acciones visibles en Equality
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              El supervisor trabaja con consulta, inscripcion, validacion de
              estado, bloqueo y desbloqueo. El administrador conserva esas
              mismas acciones y suma la opcion de liberar.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {actions.map((action) => (
                <EqualityActionCard
                  key={action.id}
                  action={action}
                  esAdmin={esAdmin}
                />
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Estado del modulo
              </div>

              <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                Panel base separado de Nuovo
              </h2>

              <p className="mt-3 text-sm leading-7 text-slate-600">
                Ya queda creado como modulo propio de dashboard para que no se
                mezcle con Nuovo. El siguiente paso es cablear la integracion
                real contra las APIs de HBM Equality.
              </p>

              <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Proximo desarrollo
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Aqui conectaremos los flujos de consulta, enrolamiento,
                  activacion, lock, unlock y release con el adaptador de
                  Equality Zero Touch.
                </p>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Alcance por rol
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
                  <p className="text-sm font-black tracking-tight text-sky-900">
                    Supervisor
                  </p>
                  <p className="mt-2 text-sm leading-7 text-sky-800">
                    Consultar, inscribir, validar estado, bloquear y
                    desbloquear.
                  </p>
                </div>

                <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                  <p className="text-sm font-black tracking-tight text-violet-900">
                    Administrador
                  </p>
                  <p className="mt-2 text-sm leading-7 text-violet-800">
                    Mantiene todas las acciones del supervisor y agrega
                    liberar.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
