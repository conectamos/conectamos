# Pago de facturas

Ruta: `/pago-facturas`. El administrador central accede desde el menú principal o desde «Caja y finanzas» en Inicio.

## Registro y meses

Cada factura conserva número, proveedor, fecha y valor en pesos colombianos. El mes se determina por la fecha de la factura, no por la fecha de un abono. El selector permite consultar meses anteriores. El número se identifica junto con el proveedor para impedir un registro duplicado.

La vista muestra «FACTURAS PENDIENTES» y «FACTURAS PAGAS», con paginación independiente. El resumen considera todas las facturas del mes y búsqueda elegidos, incluidas las que no están en la página visible. Una factura pagada en un mes posterior permanece en el mes de su fecha original.

## Abonos y saldo

Cada abono conserva fecha, importe, referencia opcional y usuario que lo registró. Los importes se validan y calculan en centavos. El saldo es valor de la factura menos sus abonos. No se admite un abono superior al saldo.

«Registrar pago total» calcula en el servidor el saldo restante y registra ese importe. Al llegar a cero, la factura aparece automáticamente en «FACTURAS PAGAS». El historial conserva los abonos previos.

Las solicitudes llevan una clave de idempotencia y la versión de la factura para impedir pagos duplicados por reintentos o dos cambios simultáneos. Este módulo registra pagos realizados; no ejecuta transferencias bancarias ni modifica la caja de una sede.

## Acceso y almacenamiento

La página y todas las API requieren `esAdministradorCentral(session)`. Un rol administrativo con perfil de auditor, supervisor, vendedor o facturador no obtiene acceso. Los datos se guardan en tablas propias, independientes del módulo de proveedores y de los créditos de CIERRE.

El SQL aditivo de `scripts/apply-cierre-schema.sql` se ejecuta en el paso previo de publicación ya configurado. El despliegue debe completar esa migración antes de activar las nuevas rutas.

## Verificación

`npm run test:invoice-payments` valida el dominio, las rutas y el formulario con datos simulados. Incluye saldo exacto, pago parcial/total, historial, periodos históricos, paginación independiente y totales, permisos centrales, reintentos y pagos simultáneos. `npm run test:operations-dashboard` verifica que el acceso aparezca únicamente para el administrador central.
