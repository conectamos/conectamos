import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  listPayJoyFortySixtyWeeks,
  parsePayJoyFortySixtyWorkbook,
} from "@/lib/payjoy-40-60-import";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (String(user.rolNombre || "").toUpperCase() !== "ADMIN") {
      return NextResponse.json(
        { error: "No autorizado para usar este modulo." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const files = [
      ...formData.getAll("file"),
      ...formData.getAll("files"),
    ].filter((item): item is File => item instanceof File);

    if (!files.length) {
      return NextResponse.json(
        { error: "Debes subir un archivo Excel del 40/60." },
        { status: 400 }
      );
    }

    const file = files[0];
    const imported = parsePayJoyFortySixtyWorkbook(
      Buffer.from(await file.arrayBuffer()),
      file.name || "40-60.xlsx"
    );

    return NextResponse.json({
      ok: true,
      fileName: imported.fileName,
      sheetName: imported.sheetName,
      weeks: listPayJoyFortySixtyWeeks(imported.rows),
    });
  } catch (error) {
    console.error("ERROR LEYENDO WEEKS 40/60 PAYJOY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible leer las weeks del archivo 40/60.",
      },
      { status: 500 }
    );
  }
}
