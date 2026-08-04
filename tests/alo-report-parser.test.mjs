import test from "node:test";
import assert from "node:assert/strict";
import {
  dateKeysFromAloValue,
  diagnoseAloReportRow,
  extractAloHtmlHeaderCandidates,
  findAloAuthorizedAmount,
  findRecentAloDate,
  matchesAloReportImei,
  parseAloInstallmentTerms,
  parseAloReportCredits,
  selectAloInstallmentTerms,
  selectAloCreditByImei,
  selectAloCreditForSale,
  selectCompatibleAloHeader,
} from "../lib/alo-report-parser.ts";

const TODAY = "2026-07-26";

test("lee un objeto DataTables con monto simple y fecha DD/MM/YY", () => {
  const response = {
    draw: 1,
    recordsTotal: 1,
    recordsFiltered: 1,
    data: [
      {
        cedula: "123456789",
        fecha: "25/07/26",
        monto: "$ 1.140.000",
        imei: "359999999999991",
      },
    ],
  };

  const credits = parseAloReportCredits(response, {
    documento: "123456789",
    todayKey: TODAY,
  });

  assert.equal(credits.length, 1);
  assert.equal(credits[0].fechaCreacionCredito, "2026-07-25");
  assert.equal(credits[0].creditoAutorizado, 1_140_000);
  assert.equal(credits[0].imei, "359999999999991");
});

test("infiere un monto monetario seguro en una fila DataTables sin encabezado", () => {
  const response = {
    draw: 1,
    recordsTotal: 1,
    recordsFiltered: 1,
    data: [
      [
        "25/07/2026",
        "123456789",
        "CLIENTE DE PRUEBA",
        "$ 1.140.000",
        "359999999999991",
      ],
    ],
  };

  const credits = parseAloReportCredits(response, {
    documento: "123456789",
    todayKey: TODAY,
  });

  assert.equal(credits.length, 1);
  assert.equal(credits[0].creditoAutorizado, 1_140_000);
  assert.equal(credits[0].imei, "359999999999991");
});

test("revisa todas las fechas y acepta MM/DD/YY aunque la primera sea vieja", () => {
  const header = [
    "Fecha de nacimiento",
    "Fecha de venta",
    "Cedula",
    "Total financiado",
    "IMEI",
  ];
  const row = [
    "01/15/90",
    "07/25/26",
    "123456789",
    "COP 1,140,000.00",
    "359999999999991",
  ];

  assert.equal(findRecentAloDate(row, header, TODAY), "2026-07-25");
  assert.equal(
    findRecentAloDate(["25/07/26"], ["Fecha de pago"], TODAY),
    null
  );
  assert.equal(findAloAuthorizedAmount(row, header), 1_140_000);
});

test("convierte timestamps a la fecha de Bogota y conserva seriales civiles de Excel", () => {
  const unixSeconds = Math.floor(
    Date.parse("2026-07-26T03:30:00.000Z") / 1000
  );
  const excelSerial = String(
    Math.floor(
      (Date.UTC(2026, 6, 25) - Date.UTC(1899, 11, 30)) / 86_400_000
    )
  );

  assert.deepEqual(dateKeysFromAloValue(unixSeconds), ["2026-07-25"]);
  assert.deepEqual(dateKeysFromAloValue(excelSerial), ["2026-07-25"]);
});

test("evalua todos los encabezados de monto y excluye cuotas, saldos y accesorios", () => {
  const header = [
    "Cuota inicial",
    "Saldo",
    "Total accesorios",
    "Monto",
  ];
  const row = [
    "$ 200.000",
    "$ 900.000",
    "$ 80.000",
    "$ 1.140.000",
  ];

  assert.equal(findAloAuthorizedAmount(row, header), 1_140_000);
  assert.equal(
    findAloAuthorizedAmount(["$ 1.140.000"], ["Valor"]),
    1_140_000
  );
});

test("usa el encabezado HTML compatible con la longitud de una fila DataTables", () => {
  const html = `
    <table>
      <tr><th>Fecha</th><th>Cedula</th></tr>
    </table>
    <table>
      <tr>
        <th>Fecha venta</th><th>Cedula</th><th>Cliente</th>
        <th>Total</th><th>IMEI</th>
      </tr>
    </table>
  `;
  const headers = extractAloHtmlHeaderCandidates(html);
  const selected = selectCompatibleAloHeader(headers, 5);

  assert.deepEqual(selected, [
    "Fecha venta",
    "Cedula",
    "Cliente",
    "Total",
    "IMEI",
  ]);

  const response = {
    draw: 1,
    data: [
      [
        "25/07/2026",
        "123456789",
        "CLIENTE DE PRUEBA",
        "$ 1.140.000",
        "359999999999991",
      ],
    ],
  };
  const credits = parseAloReportCredits(response, {
    documento: "123456789",
    todayKey: TODAY,
    html,
  });

  assert.equal(credits.length, 1);
  assert.equal(credits[0].creditoAutorizado, 1_140_000);
});

test("mantiene dos ventas de la misma cedula y permite elegir por IMEI", () => {
  const response = {
    data: [
      {
        documento: "987654321",
        fecha_venta: "25/07/2026",
        valor_credito: "$ 680.000",
        imei: "359999999999992",
      },
      {
        documento: "987654321",
        fecha_venta: "25/07/2026",
        valor_credito: "$ 920.000",
        imei: "359999999999993",
      },
    ],
  };
  const credits = parseAloReportCredits(response, {
    documento: "987654321",
    todayKey: TODAY,
  });

  assert.equal(credits.length, 2);
  assert.deepEqual(
    credits.map((credit) => credit.creditoAutorizado),
    [680_000, 920_000]
  );
  assert.equal(
    selectAloCreditByImei(credits, "359999999999993")?.creditoAutorizado,
    920_000
  );
});

test("rechaza una coincidencia que solo aparece en el documento del asesor", () => {
  const response = {
    data: [
      {
        documento_cliente: "111222333",
        documento_asesor: "987654321",
        fecha_venta: "25/07/2026",
        monto: "$ 1.140.000",
        imei: "359999999999994",
      },
    ],
  };

  const wrongDocument = parseAloReportCredits(response, {
    documento: "987654321",
    todayKey: TODAY,
  });
  const clientDocument = parseAloReportCredits(response, {
    documento: "111222333",
    todayKey: TODAY,
  });

  assert.equal(wrongDocument.length, 0);
  assert.equal(clientDocument.length, 1);
  assert.equal(clientDocument[0].documento, "111222333");
});

test("normaliza documentos enteros exportados por Excel", () => {
  const baseRow = {
    fecha_venta: "25/07/2026",
    monto: "$ 1.140.000",
    imei: "359999999999994",
  };

  for (const documentoExcel of ["111222333.0", "1.11222333e+8"]) {
    const credits = parseAloReportCredits(
      { data: [{ ...baseRow, documento_cliente: documentoExcel }] },
      {
        documento: "111222333",
        todayKey: TODAY,
      }
    );

    assert.equal(credits.length, 1);
    assert.equal(credits[0].documento, "111222333");
  }
});

test("no elige arbitrariamente entre dos creditos cuando falta un IMEI valido", () => {
  const credits = [
    { imei: "359999999999992", creditoAutorizado: 680_000 },
    { imei: "359999999999993", creditoAutorizado: 920_000 },
  ];

  assert.deepEqual(selectAloCreditForSale(credits, ""), {
    status: "AMBIGUOUS",
  });
  assert.deepEqual(selectAloCreditForSale(credits, "123"), {
    status: "AMBIGUOUS",
  });
  assert.deepEqual(
    selectAloCreditForSale(credits, "359999999999993"),
    {
      status: "MATCHED",
      credit: credits[1],
    }
  );
  assert.equal(
    selectAloCreditByImei(credits, "3599999999999937"),
    null
  );
  assert.deepEqual(
    selectAloCreditForSale(
      [
        { imei: null, creditoAutorizado: 680_000 },
        { imei: null, creditoAutorizado: 680_000 },
      ],
      ""
    ),
    { status: "AMBIGUOUS" }
  );
});

test("reserva la columna 10 como fallback para reportes sin encabezado", () => {
  const row = [
    "25/07/2026",
    "123456789",
    "359999999999991",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "$ 1.140.000",
  ];

  assert.equal(findAloAuthorizedAmount(row, null), 1_140_000);

  const legacyExcelRow = Array(11).fill("");
  legacyExcelRow[10] = 1_140_000;

  assert.equal(findAloAuthorizedAmount(legacyExcelRow, null), null);
  assert.equal(
    findAloAuthorizedAmount(legacyExcelRow, null, {
      allowLegacyColumn10: true,
    }),
    1_140_000
  );
  assert.equal(
    findAloAuthorizedAmount(
      legacyExcelRow,
      Array(11).fill("Dato legacy"),
      { allowLegacyColumn10: true }
    ),
    1_140_000
  );
  const excludedAmountHeader = Array(11).fill("Dato legacy");
  excludedAmountHeader[10] = "Cuota inicial";
  assert.equal(
    findAloAuthorizedAmount(legacyExcelRow, excludedAmountHeader, {
      allowLegacyColumn10: true,
    }),
    null
  );
  assert.equal(
    findRecentAloDate(
      row,
      ["Fec. registro", "Documento", "IMEI"],
      TODAY
    ),
    null
  );
  assert.equal(
    findRecentAloDate(
      row,
      ["Fec. registro", "Documento", "IMEI"],
      TODAY,
      { allowLegacyColumn0: true }
    ),
    "2026-07-25"
  );
  assert.equal(
    findRecentAloDate(
      row,
      ["Fecha de pago", "Documento", "IMEI"],
      TODAY,
      { allowLegacyColumn0: true }
    ),
    null
  );
  assert.equal(
    findRecentAloDate(
      row,
      ["Fec. pago", "Documento", "IMEI"],
      TODAY,
      { allowLegacyColumn0: true }
    ),
    null
  );
});

test("exige la columna semantica IMEI salvo en el Excel legacy", () => {
  const row = [
    "359999999999995",
    "359999999999994",
  ];
  const header = ["Referencia externa", "IMEI"];

  assert.equal(
    matchesAloReportImei(row, "359999999999995", header),
    false
  );
  assert.equal(
    matchesAloReportImei(row, "359999999999994", header),
    true
  );
  assert.equal(
    matchesAloReportImei(row, "359999999999995", null),
    false
  );
  assert.equal(
    matchesAloReportImei(row, "359999999999995", null, {
      allowLegacyAnyCell: true,
    }),
    true
  );
});

test("no inventa el monto cuando una fila sin encabezado trae dos valores monetarios", () => {
  const row = [
    "25/07/2026",
    "123456789",
    "$ 1.140.000",
    "$ 1.350.000",
    "359999999999991",
  ];

  assert.equal(findAloAuthorizedAmount(row, null), null);
});

test("el diagnostico seguro solo expone codigo y encabezados normalizados", () => {
  const diagnostic = diagnoseAloReportRow(
    ["01/01/2020", "123456789", "$ 1.140.000"],
    ["Fecha venta", "Cedula", "Monto"],
    TODAY
  );

  assert.deepEqual(diagnostic, {
    code: "DATE_INVALID",
    headerKeys: ["FECHAVENTA", "CEDULA", "MONTO"],
  });
  assert.deepEqual(Object.keys(diagnostic), ["code", "headerKeys"]);
});

test("prioriza valor cuota y nunca confunde valor pago con la cuota ALO", () => {
  const terms = parseAloInstallmentTerms(
    ["1020304050", "$ 180.000", "$ 74.500", "20"],
    ["Cedula", "Valor pago", "Valor cuota", "Numero cuotas"]
  );

  assert.deepEqual(terms, {
    valorCuota: 74_500,
    numeroCuotas: 20,
  });
});

test("no inventa la cuota dividiendo el credito autorizado por el plazo", () => {
  const terms = parseAloInstallmentTerms(
    ["1020304050", "$ 1.490.000", "10 meses"],
    ["Cedula", "Credito autorizado", "Plazo"]
  );

  assert.deepEqual(terms, {
    valorCuota: null,
    numeroCuotas: 20,
  });
});

test("interpreta el plazo expresado en cuotas sin volver a duplicarlo", () => {
  assert.deepEqual(
    parseAloInstallmentTerms(
      ["1020304050", "$ 74.500", "20 cuotas"],
      ["Cedula", "Valor de la cuota", "Plazo"]
    ),
    {
      valorCuota: 74_500,
      numeroCuotas: 20,
    }
  );
});

test("no presenta una cuota mensual de ALO como si fuera catorcenal", () => {
  assert.deepEqual(
    parseAloInstallmentTerms(
      ["1020304050", "$ 148.000", "20"],
      ["Cedula", "Cuota mensual", "Numero cuotas"]
    ),
    {
      valorCuota: null,
      numeroCuotas: 20,
    }
  );
});

test("selecciona la cuota de cartera por cedula e IMEI exactos", () => {
  const header = ["Cedula", "IMEI", "Valor cuota", "Numero cuotas"];
  const terms = selectAloInstallmentTerms(
    [
      {
        header,
        row: ["1020304050", "359999999999991", "$ 74.500", "20"],
      },
      {
        header,
        row: ["1020304050", "359999999999992", "$ 91.000", "24"],
      },
    ],
    {
      documento: "1020304050",
      imei: "359999999999992",
    }
  );

  assert.deepEqual(terms, {
    valorCuota: 91_000,
    numeroCuotas: 24,
  });
});

test("rechaza cuotas contradictorias cuando la cartera no identifica el IMEI", () => {
  const header = ["Cedula", "Valor cuota", "Numero cuotas"];
  const terms = selectAloInstallmentTerms(
    [
      { header, row: ["1020304050", "$ 74.500", "20"] },
      { header, row: ["1020304050", "$ 91.000", "24"] },
    ],
    {
      documento: "1020304050",
      imei: "359999999999992",
    }
  );

  assert.equal(terms, null);
});

test("no usa la cuota de otro IMEI aunque sea la unica fila de la cedula", () => {
  const header = ["Cedula", "IMEI", "Valor cuota", "Numero cuotas"];
  const terms = selectAloInstallmentTerms(
    [
      {
        header,
        row: ["1020304050", "359999999999991", "$ 74.500", "20"],
      },
    ],
    {
      documento: "1020304050",
      imei: "359999999999992",
    }
  );

  assert.equal(terms, null);
});

test("exige la cedula exacta para leer la cuota de cartera", () => {
  const header = ["Cedula", "Valor cuota", "Numero cuotas"];
  const terms = selectAloInstallmentTerms(
    [
      { header, row: ["10203040501", "$ 74.500", "20"] },
      { header, row: ["9991020304050", "$ 91.000", "24"] },
    ],
    {
      documento: "1020304050",
      imei: "359999999999992",
    }
  );

  assert.equal(terms, null);
});
