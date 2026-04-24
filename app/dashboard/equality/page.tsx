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
      return "border-amber-200 bg-amber-50/90 text-amber-800";
    case "indigo":
      return "border-indigo-200 bg-indigo-50/90 text-indigo-800";
    case "red":
      return "border-red-200 bg-red-50/90 text-red-800";
    case "emerald":
      return "border-emerald-200 bg-emerald-50/90 text-emerald-800";
    case "violet":
      return "border-violet-200 bg-violet-50/90 text-violet-800";
    default:
      return "border-slate-200 bg-slate-50/90 text-slate-800";
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
        "rounded-[24px] border px-5 py-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        toneClass(action.tone),
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-black tracking-tight">{action.label}</p>
          <p className="mt-2 text-sm leading-6 opacity-90">{action.detail}</p>
        </div>

        <span className="rounded-full border border-current/20 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
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
      detail: "Revisa el equipo y consulta su estado actual.",
      tone: "slate",
    },
    {
      id: "enroll",
      label: "Inscribir",
      detail: "Registra el equipo dentro del flujo de Equality.",
      tone: "amber",
    },
    {
      id: "validate",
      label: "Validar estado",
      detail: "Confirma si el equipo se puede entregar.",
      tone: "indigo",
    },
    {
      id: "lock",
      label: "Bloquear",
      detail: "Aplica bloqueo remoto sobre el equipo.",
      tone: "red",
    },
    {
      id: "unlock",
      label: "Desbloquear",
      detail: "Retira el bloqueo cuando corresponda.",
      tone: "emerald",
    },
    ...(esAdmin
      ? ([
          {
            id: "release",
            label: "Liberar",
            detail: "Libera el equipo de forma definitiva.",
            tone: "violet",
            adminOnly: true,
          },
        ] as EqualityAction[])
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#f5f6fa] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[32px] border border-[#20242d] bg-[linear-gradient(135deg,#13161c_0%,#1a1f28_100%)] px-6 py-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#b98746]/40 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f3d7a8]">
                  Equality Zero Touch
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                  {esAdmin ? "Administrador" : "Supervisor"}
                </span>
              </div>

              <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-[3.35rem]">
                HBM Equality
              </h1>

              <div className="mt-4 h-[3px] w-16 rounded-full bg-[#c79a57]" />

              <p className="mt-5 text-sm leading-7 text-slate-300 sm:text-base">
                Panel de gestion para consultar, inscribir, validar estado,
                bloquear, desbloquear y, solo en administrador, liberar.
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

        <section className="mt-6 rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Acciones
              </div>

              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                Operaciones disponibles
              </h2>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {esAdmin
                ? "Administrador: acceso completo, incluida liberacion."
                : "Supervisor: consulta, inscripcion, validacion, bloqueo y desbloqueo."}
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {actions.map((action) => (
              <EqualityActionCard
                key={action.id}
                action={action}
                esAdmin={esAdmin}
              />
            ))}
          </div>

          <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            La integracion visual ya esta lista. El siguiente paso es conectar
            estas acciones con las APIs de HBM Equality Zero Touch.
          </div>
        </section>
      </div>
    </div>
  );
}
