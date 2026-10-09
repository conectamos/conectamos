# Registro de equipos: contratos y protección de cargas

Las rutas `POST /api/inventario-principal` y `POST /api/inventario` conservan sus destinos, permisos, campos comerciales y movimientos de trazabilidad. La segunda continúa rechazando equipos que ya existen en bodega principal o en otra sede: recibir o trasladar esos equipos corresponde a los flujos existentes de despacho y préstamo.

## Revisión y guardado

`POST /api/inventario/revisar` recibe `{ imeis: string[], destino: "PRINCIPAL" | "SEDE", sedeId?: number }`. Devuelve cada entrada con posición y estado `VALIDO`, `INCORRECTO`, `REPETIDO` o `EXISTENTE`, la lista `imeisValidos` y sus contadores. Comprueba colisiones en ambos inventarios sin devolver información de otras sedes. No escribe equipos ni movimientos.

Los IMEI se conservan como texto de exactamente 15 dígitos, incluidos sus ceros iniciales. No se convierten desde números ni se reparan eliminando caracteres. Los separadores admitidos en el formulario organizan la carga por líneas; los caracteres internos incorrectos siguen visibles para revisión.

El formulario envía únicamente los identificadores válidos revisados. El servidor comprueba de nuevo todos los IMEI dentro de la transacción. Si un identificador ya existe, rechaza todo el intento con `409 INVENTARIO_MODIFICADO`: no realiza cargas parciales ni anuncia como guardados equipos omitidos. La vista conserva los datos para volver a revisar.

## Reintentos

Cada guardado necesita `Idempotency-Key` en el encabezado o `idempotencyKey` en el cuerpo. Si se incluyen ambos, deben coincidir. La clave tiene entre 8 y 160 caracteres alfanuméricos, guion o guion bajo. Un reintento usa la misma clave y el mismo contenido.

La tabla auxiliar `InventarioCargaSolicitud` se crea de forma aditiva con `CREATE TABLE IF NOT EXISTS`, siguiendo el patrón del registro de gastos de cartera. No cambia los modelos contables ni requiere regenerar el esquema de inventario. Guarda la solicitud y su respuesta en la misma transacción que el inventario y su trazabilidad. Una respuesta perdida puede recuperarse incluso después de reiniciar el proceso. Reutilizar la clave con otro contenido devuelve `409 IDEMPOTENCIA_CONFLICTO`.

Ambos destinos de ingreso manual adquieren bloqueos transaccionales PostgreSQL por IMEI con el mismo prefijo `inventario-imei:`, en orden estable, antes de comprobar colisiones. Dos solicitudes con claves diferentes o destinos diferentes no pueden ingresar simultáneamente el mismo equipo. Un fallo en cualquier paso revierte equipos, movimientos y reserva del intento.

## Verificación local

`node --experimental-strip-types --test tests/inventory-imei-input.test.mjs tests/warehouse-intake-api.test.mjs` ejecuta los manejadores reales con una base de datos instrumentada: entradas incorrectas, ceros iniciales, revisión de duplicados, permisos y sede, validaciones comerciales, reintentos concurrentes y tras reinicio, colisiones entre destinos, orden de bloqueos y reversión completa ante fallos. No escribe datos operativos.
