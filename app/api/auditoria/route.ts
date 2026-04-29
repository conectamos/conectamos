import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type AuditSeverity = "CRITICO" | "ALERTA" | "INFO";
type AuditRow = Record<string, unknown>;

type AuditDefinition = {
  categoria: string;
  descripcion: string;
  id: string;
  recomendacion: string;
  rowsSql: string;
  severity: AuditSeverity;
  titulo: string;
};

const LIMIT = 25;

const auditDefinitions: AuditDefinition[] = [
  {
    id: "inventario_en_sede_ventas",
    categoria: "Inventario",
    titulo: "Equipos registrados en VENTAS",
    severity: "CRITICO",
    descripcion: "La sede VENTAS es informativa y no debe manejar inventario.",
    recomendacion: "Revisar el origen del registro y moverlo o eliminarlo segun corresponda.",
    rowsSql: `
      SELECT i.id, i.imei, i.referencia, i."estadoActual", i."estadoFinanciero", s.nombre AS sede
      FROM "InventarioSede" i
      JOIN "Sede" s ON s.id = i."sedeId"
      WHERE UPPER(TRIM(s.nombre)) = 'VENTAS'
      ORDER BY i.id DESC
    `,
  },
  {
    id: "prestamos_con_sede_ventas",
    categoria: "Prestamos",
    titulo: "Prestamos relacionados con VENTAS",
    severity: "CRITICO",
    descripcion: "VENTAS no debe enviar ni recibir equipos por prestamos.",
    recomendacion: "Cerrar el prestamo si fue prueba o corregir sede origen/destino.",
    rowsSql: `
      SELECT p.id, p.imei, p.estado, p."sedeOrigenId", so.nombre AS sede_origen, p."sedeDestinoId", sd.nombre AS sede_destino
      FROM "PrestamoSede" p
      LEFT JOIN "Sede" so ON so.id = p."sedeOrigenId"
      LEFT JOIN "Sede" sd ON sd.id = p."sedeDestinoId"
      WHERE UPPER(TRIM(COALESCE(so.nombre, ''))) = 'VENTAS'
         OR UPPER(TRIM(COALESCE(sd.nombre, ''))) = 'VENTAS'
      ORDER BY p.id DESC
    `,
  },
  {
    id: "imei_duplicado_misma_sede",
    categoria: "Inventario",
    titulo: "IMEI duplicado en la misma sede",
    severity: "CRITICO",
    descripcion: "Un mismo IMEI no debe existir mas de una vez dentro de la misma sede.",
    recomendacion: "Conservar el registro real y depurar duplicados antes de registrar nuevas ventas.",
    rowsSql: `
      SELECT imei, "sedeId", COUNT(*)::int AS cantidad, ARRAY_AGG(id ORDER BY id) AS ids
      FROM "InventarioSede"
      GROUP BY imei, "sedeId"
      HAVING COUNT(*) > 1
      ORDER BY cantidad DESC, imei
    `,
  },
  {
    id: "imei_en_multiples_sedes_no_prestamo",
    categoria: "Inventario",
    titulo: "IMEI activo en varias sedes",
    severity: "CRITICO",
    descripcion: "Un IMEI no debe quedar disponible en varias sedes al mismo tiempo.",
    recomendacion: "Revisar traslados o prestamos y dejar un unico registro operativo.",
    rowsSql: `
      SELECT imei,
             COUNT(*)::int AS cantidad,
             ARRAY_AGG(DISTINCT "sedeId" ORDER BY "sedeId") AS sedes,
             ARRAY_AGG(id ORDER BY id) AS ids
      FROM "InventarioSede"
      WHERE UPPER(COALESCE("estadoActual", '')) <> 'PRESTAMO'
      GROUP BY imei
      HAVING COUNT(*) > 1
      ORDER BY cantidad DESC, imei
    `,
  },
  {
    id: "deuda_sin_acreedor",
    categoria: "Financiero",
    titulo: "Equipos en DEUDA sin acreedor",
    severity: "ALERTA",
    descripcion: "Todo equipo en deuda debe indicar a quien se le debe.",
    recomendacion: "Asignar el acreedor correcto o cambiar el estado financiero a PAGO.",
    rowsSql: `
      SELECT id, imei, referencia, "sedeId", "estadoActual", "estadoFinanciero", "deboA"
      FROM "InventarioSede"
      WHERE UPPER(COALESCE("estadoFinanciero", '')) = 'DEUDA'
        AND COALESCE(TRIM("deboA"), '') = ''
      ORDER BY id DESC
    `,
  },
  {
    id: "pago_con_acreedor",
    categoria: "Financiero",
    titulo: "Equipos en PAGO con acreedor activo",
    severity: "ALERTA",
    descripcion: "Un equipo pagado no deberia conservar un valor en Debe a.",
    recomendacion: "Limpiar el acreedor si el pago ya fue aprobado.",
    rowsSql: `
      SELECT id, imei, referencia, "sedeId", "estadoActual", "estadoFinanciero", "deboA"
      FROM "InventarioSede"
      WHERE UPPER(COALESCE("estadoFinanciero", '')) = 'PAGO'
        AND COALESCE(TRIM("deboA"), '') <> ''
      ORDER BY id DESC
    `,
  },
  {
    id: "vendidos_sin_venta_relacionada",
    categoria: "Ventas",
    titulo: "Inventario vendido sin venta",
    severity: "CRITICO",
    descripcion: "Un equipo en estado VENDIDO debe tener una venta asociada.",
    recomendacion: "Revisar si la venta fue eliminada o si el equipo debe volver a BODEGA.",
    rowsSql: `
      SELECT i.id, i.imei, i.referencia, i."sedeId", i."estadoActual", i."estadoFinanciero"
      FROM "InventarioSede" i
      WHERE UPPER(COALESCE(i."estadoActual", '')) = 'VENDIDO'
        AND NOT EXISTS (
          SELECT 1 FROM "Venta" v
          WHERE v."inventarioSedeId" = i.id OR v.serial = i.imei
        )
      ORDER BY i.id DESC
    `,
  },
  {
    id: "ventas_sin_inventario_relacionado",
    categoria: "Ventas",
    titulo: "Ventas sin inventario relacionado",
    severity: "CRITICO",
    descripcion: "Toda venta debe quedar ligada al equipo vendido.",
    recomendacion: "Relacionar la venta con su inventario o revisar si fue cargada manualmente.",
    rowsSql: `
      SELECT v.id, v."idVenta", v.serial, v."sedeId", v."inventarioSedeId", v.fecha
      FROM "Venta" v
      LEFT JOIN "InventarioSede" i ON i.id = v."inventarioSedeId"
      WHERE v."inventarioSedeId" IS NULL OR i.id IS NULL
      ORDER BY v.id DESC
    `,
  },
  {
    id: "ventas_inventario_no_vendido",
    categoria: "Ventas",
    titulo: "Venta con inventario no vendido",
    severity: "CRITICO",
    descripcion: "Si existe una venta, el inventario relacionado debe estar VENDIDO y en la misma sede.",
    recomendacion: "Revisar venta e inventario antes de editar o eliminar registros.",
    rowsSql: `
      SELECT v.id, v."idVenta", v.serial, v."sedeId" AS venta_sede, i.id AS inventario_id, i."sedeId" AS inventario_sede, i."estadoActual"
      FROM "Venta" v
      JOIN "InventarioSede" i ON i.id = v."inventarioSedeId"
      WHERE UPPER(COALESCE(i."estadoActual", '')) <> 'VENDIDO'
         OR v."sedeId" <> i."sedeId"
      ORDER BY v.id DESC
    `,
  },
  {
    id: "prestamos_aprobados_sin_equipo_destino",
    categoria: "Prestamos",
    titulo: "Prestamos activos sin equipo en destino",
    severity: "CRITICO",
    descripcion: "Un prestamo aprobado debe tener el equipo visible en la sede destino.",
    recomendacion: "Cerrar el prestamo si fue prueba o reconstruir el registro de inventario si el equipo existe.",
    rowsSql: `
      SELECT p.id, p.imei, p.estado, p."sedeOrigenId", p."sedeDestinoId"
      FROM "PrestamoSede" p
      WHERE p.estado IN ('APROBADO','PAGO_PENDIENTE_APROBACION','DEVOLUCION_PENDIENTE')
        AND NOT EXISTS (
          SELECT 1 FROM "InventarioSede" i
          WHERE i.imei = p.imei AND i."sedeId" = p."sedeDestinoId"
        )
      ORDER BY p.id DESC
    `,
  },
  {
    id: "prestamos_pendientes_pago_sin_movimiento",
    categoria: "Prestamos",
    titulo: "Pagos pendientes sin movimiento de caja sede",
    severity: "ALERTA",
    descripcion: "Un pago pendiente de aprobacion debe tener su movimiento pendiente.",
    recomendacion: "Recrear el movimiento pendiente o devolver el prestamo a APROBADO.",
    rowsSql: `
      SELECT p.id, p.imei, p."sedeOrigenId", p."sedeDestinoId", p."montoPago"
      FROM "PrestamoSede" p
      WHERE p.estado = 'PAGO_PENDIENTE_APROBACION'
        AND NOT EXISTS (
          SELECT 1 FROM "MovimientoCajaSede" m
          WHERE m."prestamoId" = p.id AND m.tipo = 'PENDIENTE_APROBACION'
        )
      ORDER BY p.id DESC
    `,
  },
  {
    id: "movimientos_pendientes_sin_prestamo",
    categoria: "Caja",
    titulo: "Movimientos pendientes sin prestamo pendiente",
    severity: "ALERTA",
    descripcion: "Un movimiento pendiente no debe quedar abierto si el prestamo ya cambio de estado.",
    recomendacion: "Anular el movimiento o corregir el estado del prestamo.",
    rowsSql: `
      SELECT m.id, m."prestamoId", m."sedeId", m.tipo, m.valor, p.estado AS prestamo_estado
      FROM "MovimientoCajaSede" m
      LEFT JOIN "PrestamoSede" p ON p.id = m."prestamoId"
      WHERE m.tipo = 'PENDIENTE_APROBACION'
        AND (p.id IS NULL OR p.estado <> 'PAGO_PENDIENTE_APROBACION')
      ORDER BY m.id DESC
    `,
  },
  {
    id: "prestamos_pagados_destino_aun_deuda",
    categoria: "Prestamos",
    titulo: "Prestamos pagados con destino aun en deuda",
    severity: "CRITICO",
    descripcion: "Si el prestamo esta pagado, el equipo destino no debe seguir con deuda de ese flujo.",
    recomendacion: "Revisar el pago y limpiar estado financiero si corresponde.",
    rowsSql: `
      SELECT p.id, p.imei, p.estado, p."sedeDestinoId", i.id AS inventario_id, i."estadoFinanciero", i."deboA"
      FROM "PrestamoSede" p
      JOIN "InventarioSede" i ON i.imei = p.imei AND i."sedeId" = p."sedeDestinoId"
      WHERE p.estado = 'PAGADO'
        AND (UPPER(COALESCE(i."estadoFinanciero", '')) <> 'PAGO' OR COALESCE(TRIM(i."deboA"), '') <> '')
      ORDER BY p.id DESC
    `,
  },
  {
    id: "principal_bodega_con_registro_sede",
    categoria: "Bodega principal",
    titulo: "Equipo disponible en principal con registro en sede",
    severity: "CRITICO",
    descripcion: "Un equipo en BODEGA principal no deberia estar simultaneamente en inventario de sede.",
    recomendacion: "Revisar el envio a sede y dejar un solo estado operativo.",
    rowsSql: `
      SELECT p.id, p.imei, p.referencia, p.estado, p."estadoCobro", p."sedeDestinoId", i.id AS inventario_sede_id, i."sedeId", i."estadoActual", i."estadoFinanciero"
      FROM "InventarioPrincipal" p
      JOIN "InventarioSede" i ON i."inventarioPrincipalId" = p.id
      WHERE UPPER(COALESCE(p.estado, 'BODEGA')) = 'BODEGA'
      ORDER BY p.id DESC
    `,
  },
  {
    id: "principal_prestamo_sin_registro_sede",
    categoria: "Bodega principal",
    titulo: "Principal en PRESTAMO sin registro en sede",
    severity: "CRITICO",
    descripcion: "Si Bodega Principal marca PRESTAMO, debe existir el equipo en la sede destino.",
    recomendacion: "Reconstruir inventario destino o devolver principal a BODEGA si fue prueba.",
    rowsSql: `
      SELECT p.id, p.imei, p.referencia, p.estado, p."estadoCobro", p."sedeDestinoId"
      FROM "InventarioPrincipal" p
      WHERE UPPER(COALESCE(p.estado, '')) = 'PRESTAMO'
        AND NOT EXISTS (
          SELECT 1 FROM "InventarioSede" i WHERE i."inventarioPrincipalId" = p.id
        )
      ORDER BY p.id DESC
    `,
  },
  {
    id: "principal_pago_destino_aun_deuda",
    categoria: "Bodega principal",
    titulo: "Principal pagado con sede aun en deuda",
    severity: "ALERTA",
    descripcion: "Si principal esta PAGADO, el inventario de sede relacionado debe quedar PAGO.",
    recomendacion: "Revisar aprobacion de pago y estado financiero del equipo en sede.",
    rowsSql: `
      SELECT p.id, p.imei, p.referencia, p.estado, p."estadoCobro", i.id AS inventario_sede_id, i."sedeId", i."estadoFinanciero", i."deboA"
      FROM "InventarioPrincipal" p
      JOIN "InventarioSede" i ON i."inventarioPrincipalId" = p.id
      WHERE UPPER(COALESCE(p.estado, '')) = 'PAGO'
        AND (UPPER(COALESCE(i."estadoFinanciero", '')) <> 'PAGO' OR COALESCE(TRIM(i."deboA"), '') <> '')
      ORDER BY p.id DESC
    `,
  },
  {
    id: "principal_estado_cobro_incoherente",
    categoria: "Bodega principal",
    titulo: "Estado de cobro incoherente en principal",
    severity: "ALERTA",
    descripcion: "El estado de cobro debe coincidir con el estado operativo de Bodega Principal.",
    recomendacion: "Ajustar estado o cobro segun el historial real del equipo.",
    rowsSql: `
      SELECT id, imei, referencia, estado, "estadoCobro", "sedeDestinoId"
      FROM "InventarioPrincipal"
      WHERE (UPPER(COALESCE("estadoCobro", '')) = 'PENDIENTE' AND UPPER(COALESCE(estado, '')) <> 'PRESTAMO')
         OR (UPPER(COALESCE("estadoCobro", '')) = 'PAGADO' AND UPPER(COALESCE(estado, '')) <> 'PAGO')
      ORDER BY id DESC
    `,
  },
  {
    id: "caja_movimientos_valor_no_positivo",
    categoria: "Caja",
    titulo: "Movimientos de caja con valor no positivo",
    severity: "ALERTA",
    descripcion: "Los movimientos de caja no deberian guardarse con valor cero o negativo.",
    recomendacion: "Revisar si fue error de digitacion o registro de prueba.",
    rowsSql: `
      SELECT id, tipo, concepto, valor, "sedeId", "createdAt"
      FROM "CajaMovimiento"
      WHERE valor <= 0
      ORDER BY id DESC
    `,
  },
  {
    id: "perfiles_activos_sin_sede_no_admin",
    categoria: "Perfiles",
    titulo: "Perfiles activos sin sede asignada",
    severity: "INFO",
    descripcion: "Perfiles no administradores activos necesitan al menos una sede para operar.",
    recomendacion: "Asignar sede o desactivar el perfil si ya no se usa.",
    rowsSql: `
      SELECT p.id, p.nombre, p.tipo, p.activo
      FROM "PerfilVendedor" p
      WHERE p.activo = true
        AND p.tipo <> 'ADMINISTRADOR'
        AND NOT EXISTS (
          SELECT 1 FROM "PerfilVendedorSede" ps WHERE ps."perfilVendedorId" = p.id
        )
      ORDER BY p.id DESC
    `,
  },
  {
    id: "sedes_sin_clave_financiera",
    categoria: "Configuracion",
    titulo: "Sedes sin clave financiera",
    severity: "INFO",
    descripcion: "Estas sedes no pueden entrar al panel financiero hasta que admin asigne clave.",
    recomendacion: "Asignar clave desde Panel financiero > Clave por sede cuando aplique.",
    rowsSql: `
      SELECT id, nombre, codigo
      FROM "Sede"
      WHERE "clavePanelFinancieroHash" IS NULL
      ORDER BY id
    `,
  },
];

function severityWeight(severity: AuditSeverity) {
  if (severity === "CRITICO") return 3;
  if (severity === "ALERTA") return 2;
  return 1;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  return value;
}

function serializeRow(row: AuditRow) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, serializeValue(value)])
  );
}

async function fetchCheck(definition: AuditDefinition) {
  const baseSql = definition.rowsSql.trim().replace(/;+\s*$/, "");
  const countRows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM (${baseSql}) audit_rows`
  );
  const rows = await prisma.$queryRawUnsafe<AuditRow[]>(
    `SELECT * FROM (${baseSql}) audit_rows LIMIT ${LIMIT}`
  );
  const count = Number(countRows[0]?.count || 0);

  return {
    categoria: definition.categoria,
    count,
    descripcion: definition.descripcion,
    id: definition.id,
    recomendacion: definition.recomendacion,
    rows: rows.map(serializeRow),
    severity: definition.severity,
    titulo: definition.titulo,
  };
}

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (String(user.rolNombre || "").toUpperCase() !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo el administrador puede consultar la auditoria" },
        { status: 403 }
      );
    }

    const tablas = await prisma.$queryRaw<
      Array<{ registros: number; tabla: string }>
    >`
      SELECT * FROM (VALUES
        ('CajaMovimiento', (SELECT COUNT(*)::int FROM "CajaMovimiento")),
        ('InventarioPrincipal', (SELECT COUNT(*)::int FROM "InventarioPrincipal")),
        ('InventarioSede', (SELECT COUNT(*)::int FROM "InventarioSede")),
        ('MovimientoCajaSede', (SELECT COUNT(*)::int FROM "MovimientoCajaSede")),
        ('MovimientoInventario', (SELECT COUNT(*)::int FROM "MovimientoInventario")),
        ('PerfilVendedor', (SELECT COUNT(*)::int FROM "PerfilVendedor")),
        ('PrestamoSede', (SELECT COUNT(*)::int FROM "PrestamoSede")),
        ('RegistroVendedorVenta', (SELECT COUNT(*)::int FROM "RegistroVendedorVenta")),
        ('Sede', (SELECT COUNT(*)::int FROM "Sede")),
        ('Usuario', (SELECT COUNT(*)::int FROM "Usuario")),
        ('Venta', (SELECT COUNT(*)::int FROM "Venta"))
      ) AS t(tabla, registros)
      ORDER BY tabla
    `;

    const checks = (await Promise.all(auditDefinitions.map(fetchCheck))).sort(
      (a, b) => {
        if (a.count === 0 && b.count > 0) return 1;
        if (a.count > 0 && b.count === 0) return -1;
        return severityWeight(b.severity) - severityWeight(a.severity);
      }
    );

    const resumen = checks.reduce(
      (acc, check) => {
        acc.totalHallazgos += check.count;
        if (check.count > 0) {
          acc.revisionesConHallazgos += 1;
        } else {
          acc.revisionesOk += 1;
        }

        if (check.severity === "CRITICO") {
          acc.criticos += check.count;
        } else if (check.severity === "ALERTA") {
          acc.alertas += check.count;
        } else {
          acc.informativos += check.count;
        }

        return acc;
      },
      {
        alertas: 0,
        criticos: 0,
        informativos: 0,
        revisionesConHallazgos: 0,
        revisionesOk: 0,
        totalHallazgos: 0,
        totalRevisiones: checks.length,
      }
    );

    return NextResponse.json({
      checks,
      generatedAt: new Date().toISOString(),
      ok: true,
      resumen,
      tablas,
    });
  } catch (error) {
    console.error("ERROR AUDITORIA:", error);
    return NextResponse.json(
      { error: "Error cargando auditoria de datos" },
      { status: 500 }
    );
  }
}
