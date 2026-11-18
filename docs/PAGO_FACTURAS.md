# Pago de facturas

Ruta: `/pago-facturas`. El administrador central accede desde el menú principal o desde «Caja y finanzas» en Inicio.

## Registro y meses

Cada factura conserva número, proveedor, fecha y valor en pesos colombianos. Las pendientes se muestran de todos los meses; el selector «Mes de pagadas y eliminadas» limita únicamente esos dos grupos por fecha de factura, no por fecha del abono. Permite consultar meses anteriores. Una nueva factura inicia con la fecha de hoy en Colombia, independientemente del mes que se esté consultando; puede cambiarse a la fecha real. El número se identifica junto con el proveedor para impedir un registro duplicado.

## Proveedores

El formulario selecciona el proveedor desde un catálogo desplegable. «Gestionar proveedores» permite crear, editar el nombre y retirar un proveedor de la lista. Al retirarlo, sus facturas y pagos existentes se conservan. El nombre registrado en la factura es histórico; cambiar el catálogo no reescribe esas facturas.

El proveedor tiene una identidad estable, de modo que cambiar su nombre no permite registrar dos veces el mismo número de factura para ese proveedor. Los registros antiguos se vinculan al catálogo conservando su información.

La vista muestra «FACTURAS PENDIENTES» y «FACTURAS PAGAS» como filas compactas, con paginación independiente y diez facturas por página. Cada fila permite identificar proveedor, número, vencimiento, estado y saldo o valor pagado. «Ver detalle» abre la información completa, el historial de abonos y sus comprobantes PDF; desde allí se puede abonar, pagar, editar o eliminar la factura.

El desplegable «Proveedor» ofrece «Todos los proveedores» y el catálogo, incluidos proveedores inactivos para consultar sus facturas históricas. La selección se aplica al pulsar «Consultar», junto con mes y búsqueda, y reinicia las páginas de pendientes, pagadas y eliminadas. El servidor filtra por la identidad estable del proveedor antes de calcular totales y paginar; un cambio de nombre no separa sus facturas históricas. El filtro no modifica las alertas generales de vencimiento.

Ambas columnas se ordenan por fecha de vencimiento ascendente antes de paginar; las facturas sin vencimiento van al final. Los empates se resuelven por fecha de factura e identificador. La búsqueda y el proveedor se aplican a ambos grupos y a las facturas eliminadas. El resumen reúne todas las pendientes y las pagadas del mes consultado que coincidan con los filtros, incluidas las que no están en la página visible. El saldo considera todas las pendientes de esos filtros. Una factura pagada en un mes posterior se consulta en pagadas por el mes de su fecha original; el mensaje de confirmación indica ese mes.

La fecha de vencimiento es opcional y no se deduce para facturas antiguas. El estado se calcula usando el día de Colombia: vencida si es anterior a hoy, vence hoy si coincide, próxima a vencer en los siete días siguientes. Una factura pagada no genera alerta de vencimiento. Los contadores consideran todas las pendientes de los filtros aplicados, sin limitarse al mes ni a la página visible.

## Avisos en la aplicación y por WhatsApp

El administrador central ve avisos de vencimiento en Inicio y Pago de facturas. Incluyen todas las pendientes vencidas, las que vencen hoy y las de los siete días siguientes, aunque sean de meses anteriores. La campana permite volver a abrirlos. Al registrar pagos, editar, eliminar o restaurar una factura, las operaciones confirmadas actualizan los avisos.

El recordatorio externo por WhatsApp se programa para el día del vencimiento a las 10:00 a. m. en `America/Bogota`. Lo procesa el servidor, por lo que no depende de mantener la aplicación abierta. No incluye correo electrónico. La tarjeta «Recordatorios por WhatsApp» consulta `GET /api/pago-facturas/reminders` cada 60 segundos y después de cambios confirmados; esa consulta solo lee el estado y nunca envía mensajes.

El estado solo se presenta como activo cuando el servidor confirma que está habilitado y configurado. Si falta configuración, muestra «WhatsApp pendiente de activar». El destino se obtiene del servidor, sin fijar teléfonos ni credenciales en el código del navegador. Se muestran los registros pendientes, fallidos y por confirmar; una respuesta fallida no se convierte en ceros. «Último envío aceptado por el proveedor» indica aceptación de la solicitud, no entrega al teléfono ni lectura por el destinatario.

Configuración privada del servicio de producción:

- `INVOICE_REMINDERS_ENABLED=1`: habilita el trabajador de recordatorios cuando la conexión está lista.
- `INVOICE_REMINDER_TEMPLATE_APPROVED=1`: confirma que la plantilla de WhatsApp ya está aprobada por Meta. Mantener deshabilitado hasta verificar la aprobación; guardar un borrador no permite activar envíos.
- `INVOICE_REMINDER_WHATSAPP_TO`: único destino autorizado en formato aceptado por el adaptador de WhatsApp.
- `INVOICE_REMINDER_DAPTA_URL`: URL del flujo de Dapta configurado para los recordatorios. Puede contener una clave en la consulta; debe guardarse como secreto del servidor y no exponerse en registros, respuestas de API ni variables `NEXT_PUBLIC_*`.
- `INVOICE_REMINDER_START_DATE`: fecha inicial opcional `YYYY-MM-DD`, para comenzar desde las 10:00 de ese día y evitar un envío inicial nocturno. Una fecha inválida bloquea la configuración.

La hora es fija: 10:00 a. m. de Colombia. La activación requiere una conexión válida al flujo de WhatsApp, el destino autorizado y la plantilla aprobada por Meta. Si falta esa aprobación, el estado permanece pendiente de activar. No basta con que aparezca la tarjeta, se guarde un borrador de plantilla o se consulten facturas para que se realicen envíos.

## Corregir y eliminar

«Editar» permite corregir el proveedor, número, fecha, vencimiento y valor. Si cambia la fecha de factura, cambia su mes. Los abonos ya guardados se conservan; el nuevo valor no puede ser menor que el total abonado. El estado pagada/pendiente se recalcula con el valor corregido.

«Eliminar» requiere confirmar la factura concreta. Se retira de las columnas, alertas y totales sin borrar sus pagos ni el historial. «Facturas eliminadas» permite restaurarla. La combinación proveedor/número se reserva también mientras esté eliminada para evitar registrar dos veces la misma obligación; se puede restaurar y editar.

Las correcciones, eliminaciones y restauraciones conservan quién realizó el cambio, cuándo y los valores anteriores/posteriores. Usan versión e idempotencia para evitar sobrescribir un pago simultáneo o repetir una operación incierta.

## Abonos y saldo

Cada abono conserva fecha, importe, referencia opcional y usuario que lo registró. Los importes se validan y calculan en centavos. El saldo es valor de la factura menos sus abonos. No se admite un abono superior al saldo.

«Registrar pago total» calcula en el servidor el saldo restante y registra ese importe. Al llegar a cero, la factura aparece automáticamente en «FACTURAS PAGAS». El historial conserva los abonos previos.

Las solicitudes llevan una clave de idempotencia y la versión de la factura para impedir pagos duplicados por reintentos o dos cambios simultáneos. Este módulo registra pagos realizados; no ejecuta transferencias bancarias ni modifica la caja de una sede.

## Comprobantes PDF de pagos

Al registrar un abono o pago completo se puede seleccionar un comprobante PDF de hasta 5 MiB. El nombre y tamaño se muestran antes de guardar; puede cambiarse o quitarse en ese momento. Si ocurre un error, los datos del pago y el archivo seleccionado se conservan. Cuando el resultado es incierto se bloquean los cambios y el reintento utiliza la misma clave, los mismos datos y el mismo archivo, evitando registrar otro pago.

Con archivo, el pago y el comprobante se guardan juntos en una sola solicitud `multipart/form-data` a `POST /api/pago-facturas/[invoiceId]/payments`, con `payload` como JSON y `receipt` como archivo. Sin archivo permanece disponible el contrato JSON anterior. El servidor valida tipo y contenido PDF, tamaño y permisos; una carga rechazada no deja el pago guardado sin su comprobante.

En el detalle de la factura, los pagos anteriores sin documento muestran «Adjuntar PDF». Esta acción usa `POST /api/pago-facturas/[invoiceId]/payments/[paymentId]/receipt` con `payload: {requestId}` y `receipt`; agrega el documento sin cambiar importes, saldo ni historial de pagos. La confirmación solo aparece después de recibir del servidor la factura actualizada con los metadatos del comprobante.

«Descargar PDF» utiliza `GET` en esa misma ruta, con autorización de administrador central. El documento se conserva en la base de datos privada y permanece disponible después de publicar una nueva versión. Las consultas de facturas e historial incluyen únicamente `id`, `filename` y `size` del comprobante; no incluyen su contenido binario. Después de guardado, no se ofrecen acciones para borrar o reemplazar el comprobante.

## Acceso y almacenamiento

La página y las API de administración requieren `esAdministradorCentral(session)`. Un rol administrativo con perfil de auditor, supervisor, vendedor o facturador no obtiene acceso. La única excepción es `POST /api/pago-facturas/reminders/dispatch`, llamada por el flujo del servidor: exige un token aleatorio de entrega, de un solo uso y con vencimiento. No permite elegir otra factura, destinatario ni plantilla. Los datos se guardan en tablas propias, independientes del módulo de proveedores y de los créditos de CIERRE.

El flujo reproducible está en `docs/dapta-invoice-reminders-flow.json`. Su creación requiere revisar y aprobar el cambio de Dapta. Usa una plantilla propia de recordatorio de facturas; guardar el flujo o su borrador no acredita aprobación de Meta. El trabajador conserva las entregas en `InvoiceReminderDelivery`, valida factura, saldo y día antes de autorizar el envío y no repite resultados inciertos. Los procesos con navegador cerrado requieren que el servicio Node permanezca activo.

El SQL aditivo de `scripts/apply-cierre-schema.sql` se ejecuta en el paso previo de publicación ya configurado. El despliegue debe completar esa migración antes de activar las nuevas rutas.

## Verificación

`npm run test:invoice-payments` valida el dominio, las rutas y el formulario con datos simulados. Incluye saldo exacto, pago parcial/total, historial, pendientes de todos los meses, consulta histórica de pagadas y eliminadas, paginación independiente y totales, permisos centrales, reintentos, cambios simultáneos, edición, eliminación recuperable, restauración y límites de vencimiento. También cubre comprobantes PDF opcionales, envío conjunto con el pago, adjuntos a pagos anteriores, descarga protegida y conservación del archivo durante errores y reintentos. `node --test tests/invoice-reminder-status-ui.test.mjs` verifica los estados de la tarjeta de WhatsApp sin enviar mensajes. `npm run test:operations-dashboard` verifica que el acceso aparezca únicamente para el administrador central.
