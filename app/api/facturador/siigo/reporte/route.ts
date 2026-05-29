import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeConsultarReporteSiigo } from "@/lib/access-control";
import {
  getSiigoErrorMessage,
  getSiigoErrorStatus,
  getSiigoMonthlyReport,
} from "@/lib/siigo";

function parseMonth(value: string | null) {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
  const month = String(value || fallback).trim();

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }

  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return null;
  }

  const dateStart = `${yearText}-${monthText}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const dateEnd = `${yearText}-${monthText}-${String(lastDay).padStart(2, "0")}`;

  return {
    month,
    dateStart,
    dateEnd,
  };
}

export async function GET(req: Request) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (
      !puedeConsultarReporteSiigo(
        session.rolNombre,
        session.perfilTipo,
        session.perfilNombre
      )
    ) {
      return NextResponse.json(
        { error: "No tienes permiso para consultar el reporte Siigo" },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const parsedMonth = parseMonth(url.searchParams.get("month"));

    if (!parsedMonth) {
      return NextResponse.json({ error: "Mes invalido" }, { status: 400 });
    }

    const reporte = await getSiigoMonthlyReport(
      parsedMonth.dateStart,
      parsedMonth.dateEnd
    );

    return NextResponse.json({
      ok: true,
      month: parsedMonth.month,
      reporte,
    });
  } catch (error) {
    console.error("ERROR REPORTE SIIGO:", error);

    return NextResponse.json(
      { error: getSiigoErrorMessage(error) },
      { status: getSiigoErrorStatus(error) }
    );
  }
}
