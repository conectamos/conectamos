# CIERRE: listado de cuenta PAYJOY y resultados de sincronización

Revisión de documentación primaria y código realizada el 13 de octubre de 2026. Esta ampliación incorpora el listado de cuenta PAYJOY, además de la consulta por IMEI descrita en `CIERRE_INTEGRACIONES.md`. No se hicieron llamadas a proveedores reales durante el desarrollo ni se verificó la retención de una cuenta de producción.

## Evidencia primaria

PAYJOY documenta `GET /v1/list-transactions.php` con `key`, `starttime` y `endtime`, sin exigir IMEI. El endpoint ya existía en el cliente local; se añade el uso documentado sin filtro para descubrir créditos que no tengan una venta local. [Endpoints: List Transactions](https://www.payjoy.com/apidocs/endpoints.html#list-transactions).

Los filtros por IMEI o comercio restringen el listado y son opcionales. La sincronización de cuenta los omite; no agrega parámetros de paginación ni rutas supuestas. [Filters](https://www.payjoy.com/apidocs/filters.html).

Una transacción `finance` incluye `financeOrder.id`, `financeOrder.financeAmount`, fecha `time`, moneda y comercio. El importe financiado es distinto de la inicial, el precio y las cuotas. Los ejemplos separan financiación de pagos, comisiones y ajustes. `customer.id` es un identificador del cliente del proveedor y no se usa como cédula. [Transaction Data Types](https://www.payjoy.com/apidocs/transaction%20data%20types.html).

## Contrato implementado

- `readPayJoyCierrePeriod(inicio: Date, finExclusivo: Date)` hace una sola lectura de hasta 24 horas. Usa segundos Unix, con fin inclusivo un segundo antes del límite solicitado, acotado al momento actual. El tiempo máximo es 20 segundos, también durante la lectura del cuerpo.
- `consultarPeriodoPayJoyCierre({fechaDesde, fechaHasta})` exige un mismo día calendario y construye sus límites en `America/Bogota`. No recibe cédulas ni IMEI y comprueba configuración antes de consultar.
- Las observaciones conservan ID estable, principal, fecha, estado y, cuando existen, `providerMerchantId` y `providerMerchantName`. El adaptador no convierte esos valores en una sede. La asignación requiere una vinculación inequívoca en el trabajador; un comercio desconocido permanece pendiente.
- El listado de cuenta exige moneda explícita `COP`; otra moneda o moneda ausente dejan el valor pendiente. No hay conversión implícita.
- Un pago reembolsado o un ajuste contable no prueban la anulación de todo el crédito. Sólo un estado negativo explícito de la orden permite clasificarlo como anulado/reversado/rechazado. Los eventos posteriores se aplican por ID, conservando la fecha original de financiación.

Los identificadores y fechas permiten reprocesar días sin duplicar créditos. La planificación, la persistencia del progreso y la vinculación local pertenecen al trabajador; el adaptador no lanza reintentos, elegibilidad, pagos ni creación de créditos.

## Límites y cobertura

### Fuente del total y conciliación local

El cierre distingue la existencia de un crédito efectivo en PAYJOY de su vínculo con una venta de CONECTAMOS. Una observación de `finance` con ID estable, moneda COP, capital y fecha efectivos no deja de ser un crédito porque falte la venta local. Tampoco se suma como otro crédito cuando ya está vinculada.

El total de PAYJOY, su detalle y la exportación utilizan una única selección de observaciones efectivas guardadas de la API, deduplicadas por financiera y número del crédito. Se excluyen anulaciones, reversos, rechazos, estados sin confirmar y anulaciones locales conservadas. Los registros locales sin confirmar se muestran por separado para conciliación y no se suman otra vez. Mientras haya días pendientes, el reporte indica que la lectura de PAYJOY es parcial; nunca sustituye el total de la financiera por las ventas locales. Sin créditos API confirmados, el importe queda sin confirmar en lugar de declarar cero.

El detalle compara créditos e importes de ambas fuentes y distingue los créditos API sin venta vinculada de las ventas locales sin confirmación API. Una diferencia neta de cuatro créditos no demuestra que existan sólo cuatro registros por revisar: puede haber discrepancias en ambos sentidos. El Excel incluye la misma comparación y una hoja de ventas locales pendientes, sin agregarlas al total API.

Las observaciones sin sede comprobada sólo se incluyen en el consolidado global del administrador, con sede sin vincular. Los filtros y usuarios de sede no reciben esos registros ni los datos de otras sedes. No se asigna una sede por semejanza del nombre del comercio ni se vinculan préstamos por cédula o IMEI únicamente.

Esta selección se realiza sobre la base local y no añade consultas a proveedores al abrir, filtrar o exportar. Los datos originales y la trazabilidad se conservan; el reporte no reescribe ni fuerza sus importes para igualar una cifra externa.

La documentación pública revisada no ofrece un máximo numérico de rango, filas, solicitudes por minuto, retención histórica ni un contrato de paginación verificable. Tampoco demuestra cómo se representan todas las anulaciones. Dividir el trabajo por día y espaciar las lecturas es una política conservadora de CONECTAMOS, no una cuota contractual declarada por PAYJOY.

Por ello, todos los resultados conservan `complete: false`, incluso una lista vacía válida. Un día leído no certifica cobertura íntegra del periodo ni presencia de todos los reversos. El histórico disponible es el que la cuenta efectivamente devuelva y que se haya guardado; no se promete una fecha inicial. La sincronización del día actual requiere revisiones posteriores porque aún pueden aparecer eventos.

## Resultados y errores sin datos sensibles

| Resultado | Significado |
| --- | --- |
| `OBSERVED` | Hay observaciones identificables; `pendingCredits` indica cuántas no se pueden considerar efectivas. No acredita completitud. |
| `EMPTY` | El contrato reconocido devuelve una lista vacía, o PAYJOY sólo devuelve tipos documentados que no originan créditos: pagos, comisiones, entradas o salidas. No acredita cero global. |
| `UNSUPPORTED_RESPONSE` | La respuesta no permite reconocer créditos ni confirmar una lista vacía; requiere revisión. |
| `NOT_CONFIGURED` | No hay configuración disponible; no se hizo la lectura. |
| `MISSING_REFERENCE` | Falta documento/IMEI para un lector individual; no significa ausencia de crédito. |
| `LOCAL_ONLY` | La financiera usa registros confirmados de CONECTAMOS. |

`classifyCierreProviderError` devuelve códigos `RATE_LIMIT`, `AUTH`, `UNAVAILABLE`, `INVALID_RESPONSE`, `CONFIG` o `UNKNOWN`, sin copiar mensajes remotos, URLs, tokens ni cédulas. Un HTTP 429 conserva `Retry-After` en segundos o fecha HTTP como `retryAfterMs`, con espera mínima de un minuto. El trabajador debe respetar esa espera persistentemente entre réplicas. Los errores HTTP se distinguen de JSON inválido incluso si la respuesta 429 es HTML. Los lectores no reintentan internamente.

## Otras integraciones

SUMASPAY conserva exclusivamente el historial por documento y el detalle por ID previamente implementados; no se encontró un listado global documentado que autorice eliminar el documento. ADDI conserva sus dos lectores de transacciones por documento/rango y no supone paginación ni consulta global sin documento.

La documentación pública ADDI describe un callback final del flujo de comercio electrónico, con estado `approved`. Ese contrato no documenta la semántica de `APPROVED` ni `createdAt` en los endpoints del portal que usa este repositorio. No se traslada esa interpretación a una respuesta distinta ni se crean transacciones para obtenerla. [Integración Custom de ADDI](https://support.addi.com/custom-integrations).

SISTECREDITO, ALO CREDIT y FINSERPAY mantienen las limitaciones y la fuente local detalladas en `CIERRE_INTEGRACIONES.md`. Esta ampliación no instala un webhook ni afirma que exista sincronización por webhook activa.

## Pruebas

`tests/cierre-providers.test.mjs` verifica el listado diario sin filtros individuales, límites Bogotá, ID y comercio, moneda, inicial excluida, interpretación de ajustes, resultados vacíos/desconocidos y errores HTTP. Los tests del lector real usan `fetch` simulado; ninguna prueba llama APIs reales.
