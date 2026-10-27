# Extensiones PayJoy

Implementación revisada el 27 de octubre de 2026. Pantalla: `/vendedor/payjoy/extensiones`. API interna: `/api/payjoy/extensiones`.

## Integración existente y búsqueda de dispositivos

`lib/payjoy-retail.ts` ya usa la Retail Partner API, con clave exclusivamente en servidor (`PAYJOY_RETAIL_API_KEY`, con los alias existentes `PAYJOY_PARTNER_API_KEY` / `PAYJOY_API_KEY`). `lookup-customer.php` acepta `customerLocator`: teléfono, device tag, IMEI de 15/16 dígitos o ID interno PayJoy. Su contrato público no incluye cédula ni devuelve una colección de dispositivos. `customer.id` no equivale a la cédula. Fuente: [Lookup Customer](https://www.payjoy.com/apidocs/endpoints.html#lookup-customer).

La cédula se busca en `RegistroVendedorVenta` de CONECTAMOS, con el ámbito del perfil y sede, registros activos y financiación PayJoy. Se deduplican IMEI y se informa cuando se alcanza el límite local de 100 registros. El resultado no certifica todos los equipos del cliente en PayJoy. No se consultan los cortes globales de cartera, que carecen de una relación fiable de sede.

Al seleccionar un equipo se reutiliza el cliente Retail para resolver su IMEI a `deviceTag`, sin la restricción de crédito creado hoy/ayer del registro de ventas. Si no devuelve tag se pide el código manual, sin deducirlo de la cédula o del ID interno. La entrada manual acepta el tag del dispositivo (no una URL arbitraria). Cuando Retail está configurado se verifica también el IMEI y su ámbito local; los perfiles comerciales requieren esa configuración. Una identidad administrativa puede consultar un tag manual sin Retail, sin adjudicarlo a una cédula no comprobada.

`lib/payjoy.ts` consulta saldo y vencimiento por tag; sus importes de cuotas y `paymentOptions` no se usan como opciones de extensión.

## Servicio de extensiones verificado

La ruta proporcionada por el usuario, [PayJoy Pay](https://pay.payjoy.com/extensions/device/), carga una aplicación web. El segmento `device` corresponde a `deviceTag`, según su enrutador. Se inspeccionaron sus archivos públicos [config.js](https://pay.payjoy.com/config.js) y [main.cc406e9a.js](https://pay.payjoy.com/js/main.cc406e9a.js); no se ejecutó una extensión real durante el desarrollo.

El contrato observado, separado de la API Retail, usa `https://extensions.payjoy.io/api/v1/extensions/`:

1. `POST app-www-token/`: `deviceTag`, `sub` con formato `<deviceTag>@app.www` y `channel: APP-WWW`; devuelve `token`.
2. `POST` a la base: `deviceTag`, `channel`, `idempotencyKey`, `requesterEmail` con el mismo formato técnico; devuelve `id` y `currentValidThrough`.
3. `GET <id>/options/`: devuelve opciones con `extensionType`, `minTime` en horas, `status`, `reasonsKey`, `uiReasonKeys`, `uiReasons` y `extensionData`.
4. `POST <id>/select/`: envía `idempotencyKey`, `extension_type`, `extension_time`, `extension_reason`. El portal confirma éxito únicamente con `success: true` y `status: GRANTED`; muestra `newValidThrough`.

Todas estas llamadas y tokens permanecen en servidor. El token existe solo durante la llamada y no se guarda en la base, historial ni navegador. Las URLs externas son fijas, sin redirecciones; no se aceptan destinos del cliente. Los motivos y opciones proceden de la respuesta real. Se conserva la regla observada de elegibilidad: estado no vacío distinto de `denied`, excluyendo país no disponible; no se inventa un enum positivo. Los motivos emparejan `uiReasonKeys` con `uiReasons` separado por `#`, con el filtro del portal para `not connected to the internet`.

Este contrato se obtuvo de la aplicación oficial, no de una especificación pública versionada para integradores. PayJoy puede cambiarlo; se validan las respuestas y se detiene la gestión si dejan de coincidir. No se implementa una API de búsqueda por cédula que no se haya verificado. La validación con una cuenta/dispositivo real y la habilitación contractual del canal deben verificarse en el entorno operativo antes de usarlo con clientes.

## Confirmación, permisos e idempotencia

Consulta: vendedor, apoyo operativo, supervisor, administrador y auditor con sesión válida. Gestión: los mismos salvo auditor. Bodega y facturador se deniegan aunque el login base tenga otro rol. Los perfiles comerciales no heredan acceso global de un login administrador. Página, API y servicio validan permisos. Los POST requieren JSON y un origen público configurado; se rechazan solicitudes marcadas como `cross-site`.

`PayJoyExtensionOperation` registra usuario, perfil, nombre del asesor, sede, referencia del registro local, últimos cuatro dígitos de documento, ID PayJoy cuando existe, dispositivo, opciones obtenidas, selección/motivo, fechas, respuesta mínima y estado. No duplica documentos completos, teléfono, domicilio ni respuestas sin filtrar. El historial muestra las últimas 30 gestiones de la misma identidad y sede.

La consulta crea una intención persistente antes de llamar al proveedor. Una clave única impide repetir esa intención, y `activeDeviceKey` evita operaciones simultáneas sobre el mismo equipo incluso con diferentes asesores o claves. La confirmación reclama atómicamente la operación, vuelve a consultar opciones y comprueba que la selección y el motivo siguen vigentes. Solo entonces ejecuta el POST externo. No hay reintentos automáticos de ejecución.

Estados: `PREPARANDO`, `LISTA`, `SIN_OPCIONES`, `EJECUTANDO`, `EXITOSA`, `RECHAZADA`, `INDETERMINADA`, `ERROR`, `EXPIRADA`. Las ofertas caducan localmente a los 15 minutos, como política de CONECTAMOS. Un éxito conserva el bloqueo durante 15 minutos para evitar confirmaciones repetidas desde otra consulta. Una ejecución sin respuesta verificable, o un fallo al guardar su respuesta, queda `INDETERMINADA` y mantiene el bloqueo sin caducidad. Un proceso interrumpido durante ejecución también pasa a ese estado tras dos minutos. Actualizar la página solo lee el historial.

No se libera automáticamente una gestión indeterminada. El administrador debe verificarla en PayJoy antes de cualquier reconciliación operativa; no se inventa un endpoint remoto de consulta de resultado ni se marca como fallida por timeout. No hay botón de desbloqueo que permita saltarse esta comprobación.

## Preparación del entorno

La tabla nueva es aditiva, sin modificar ventas ni cartera existentes. Antes de abrir el módulo en un entorno con base configurada:

```sh
npm run db:apply-payjoy-extensiones
npm run prisma:generate
npm run build
```

La instalación SQL es idempotente: `scripts/apply-payjoy-extensions-schema.sql`, dentro de una transacción con límites de espera de bloqueos y ejecución. El comando verifica después las 26 columnas y los seis índices requeridos mediante `scripts/verify-payjoy-extensions-schema.mjs`, sin leer registros de clientes. No hay creación de tablas durante las peticiones. Si falta la tabla, la API informa que el módulo requiere actualización y no ejecuta operaciones de PayJoy.

En Railway, el servicio `conectamos` ejecuta `npm run db:apply-cierre` y luego `npm run db:apply-payjoy-extensiones` como paso previo al despliegue. Un fallo de migración o de verificación impide activar esa versión. Conservar ambos comandos en futuros despliegues. La validación con un dispositivo real se realiza por separado después de publicar, con confirmación explícita en pantalla.

No se agregan credenciales nuevas para el servicio público de extensiones. La clave Retail existente debe estar disponible para resolver los registros y validar el alcance de los asesores. No usar variables `NEXT_PUBLIC_*` para credenciales. El entorno debe permitir HTTPS hacia `partner.payjoy.com` y `extensions.payjoy.io`.

La protección de origen acepta únicamente `APP_URL` y el dominio HTTPS indicado por `RAILWAY_PUBLIC_DOMAIN`. Esto permite funcionar detrás del proxy de Railway aunque Next.js reciba una URL interna. `Host` y `X-Forwarded-*` no amplían los orígenes permitidos. Sin configuración, producción rechaza los POST; solo en desarrollo se permite el origen exacto de una URL local (`localhost`, `127.0.0.1` o `::1`).

## Verificación

`npm run test:payjoy-extensiones` ejecuta el código real con infraestructura y respuestas sustituidas únicamente dentro de las pruebas: autenticación, identificadores, opciones, motivos, rechazos, respuestas ambiguas, permisos, ámbito, idempotencia, concurrencia y protección de la API. Ninguna prueba otorga extensiones reales. El módulo de producción no contiene datos simulados.

Resultado de la implementación: 61 pruebas específicas aprobadas, incluyendo orígenes públicos detrás del proxy, rechazo de encabezados falsificados y cierre de acceso sin configuración en producción; ESLint de los archivos modificados, TypeScript y `npm run build` aprobados. Se revisó la pantalla real en un servidor de pruebas aislado, incluyendo el flujo de confirmación e historial, escritorio y anchos de 390/768 píxeles. La captura de escritorio está en `output/payjoy-extensiones/vista-escritorio.png`. Las pruebas de regresión de CIERRE, cartera y dashboard operativo pasaron. Tres comprobaciones antiguas de marcado en `dashboard-payjoy-advisors-access-contract.test.mjs` fallan también al ejecutarse contra los archivos de `HEAD` previos a estos cambios; se conservaron sin alterar el ranking.
