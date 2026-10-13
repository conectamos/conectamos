import { resolveCierrePeriod } from "@/lib/cierre-domain";

export function getCierrePriority() {
  const from = process.env.CIERRE_PRIORITY_FROM;
  const to = process.env.CIERRE_PRIORITY_TO;
  if (!from || !to) return null;
  try {
    const period = resolveCierrePeriod({ periodo: "rango", desde: from, hasta: to });
    return { from, to, start: period.start, end: period.end };
  } catch { return null; }
}
