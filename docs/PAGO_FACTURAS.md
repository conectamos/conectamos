# Pago de facturas

Ruta: `/pago-facturas`. El administrador central accede desde el menú principal o desde «Caja y finanzas» en Inicio.

## Registro y meses

Cada factura conserva número, proveedor, fecha y valor en pesos colombianos. El mes se determina por la fecha de la factura, no por la fecha de un abono. El selector permite consultar meses anteriores. El número se identifica junto con el proveedor para impedir un registro duplicado.

## Proveedores

El formulario selecciona el proveedor desde un catálogo desplegable. «Gestionar proveedores» permite crear, editar el nombre y retirar un proveedor de la lista. Al retirarlo, sus facturas y pagos existentes se conservan. El nombre registrado en la factura es histórico; cambiar el catálogo no reescribe esas facturas.

El proveedor tiene una identidad estable, de modo que cambiar su nombre no permite registrar dos veces el mismo número de factura para ese proveedor. Los registros antiguos se vinculan al catálogo conservando su información.

La vista muestra «FACTURAS PENDIENTES» y «FACTURAS PAGAS», con paginación independiente. Ambas columnas se ordenan por fecha de vencimiento ascendente antes de paginar; las facturas sin vencimiento van al final. Los empates se resuelven por fecha de factura e identificador. El resumen considera todas las facturas del mes y búsqueda elegidos, incluidas las que no están en la página visible. Una factura pagada en un mes posterior permanece en el mes de su fecha original.

La fecha de vencimiento es opcional y no se deduce para facturas antiguas. El estado se calcula usando el día de Colombia: vencida si es anterior a hoy, vence hoy si coincide, próxima a vencer en los siete días siguientes. Una factura pagada no genera alerta de vencimiento. Los contadores del mes consideran todas las facturas activas del filtro.

## Corregir y eliminar

«Editar» permite corregir el proveedor, número, fecha, vencimiento y valor. Si cambia la fecha de factura, cambia su mes. Los abonos ya guardados se conservan; el nuevo valor no puede ser menor que el total abonado. El estado pagada/pendiente se recalcula con el valor corregido.

«Eliminar» requiere confirmar la factura concreta. Se retira de las columnas, alertas y totales sin borrar sus pagos ni el historial. «Facturas eliminadas» permite restaurarla. La combinación proveedor/número se reserva también mientras esté eliminada para evitar registrar dos veces la misma obligación; se puede restaurar y editar.

Las correcciones, eliminaciones y restauraciones conservan quién realizó el cambio, cuándo y los valores anteriores/posteriores. Usan versión e idempotencia para evitar sobrescribir un pago simultáneo o repetir una operación incierta.

## Abonos y saldo

Cada abono conserva fecha, importe, referencia opcional y usuario que lo registró. Los importes se validan y calculan en centavos. El saldo es valor de la factura menos sus abonos. No se admite un abono superior al saldo.

«Registrar pago total» calcula en el servidor el saldo restante y registra ese importe. Al llegar a cero, la factura aparece automáticamente en «FACTURAS PAGAS». El historial conserva los abonos previos.

Las solicitudes llevan una clave de idempotencia y la versión de la factura para impedir pagos duplicados por reintentos o dos cambios simultáneos. Este módulo registra pagos realizados; no ejecuta transferencias bancarias ni modifica la caja de una sede.

## Acceso y almacenamiento

La página y todas las API requieren `esAdministradorCentral(session)`. Un rol administrativo con perfil de auditor, supervisor, vendedor o facturador no obtiene acceso. Los datos se guardan en tablas propias, independientes del módulo de proveedores y de los créditos de CIERRE.

El SQL aditivo de `scripts/apply-cierre-schema.sql` se ejecuta en el paso previo de publicación ya configurado. El despliegue debe completar esa migración antes de activar las nuevas rutas.

## Verificación

`npm run test:invoice-payments` valida el dominio, las rutas y el formulario con datos simulados. Incluye saldo exacto, pago parcial/total, historial, periodos históricos, paginación independiente y totales, permisos centrales, reintentos, cambios simultáneos, edición, eliminación recuperable, restauración y límites de vencimiento. `npm run test:operations-dashboard` verifica que el acceso aparezca únicamente para el administrador central.
