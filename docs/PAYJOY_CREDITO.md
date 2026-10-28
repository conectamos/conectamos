# Ficha de crédito y seguimiento PayJoy

Implementación del 28 de octubre de 2026. Pantalla: `/vendedor/payjoy/credito`. API interna: `/api/payjoy/credito`. Este documento describe el código y la preparación del entorno; no acredita por sí mismo un despliegue ni una consulta real exitosa.

## Alcance y fuentes

La ficha consulta un código PayJoy o un IMEI de 15/16 dígitos y guarda la observación. No acepta cédulas, teléfonos ni URLs. El seguimiento presenta el estado posterior de las extensiones propias. No implementa cobranza, conciliación, registro de abonos, bloqueo/desbloqueo ni ejecución de extensiones. Los enlaces al módulo de extensiones solo precargan el código: la gestión mantiene su flujo de selección y confirmación separado.

`lib/payjoy-credit-provider.ts` reutiliza dos lectores existentes, con llamadas y credenciales exclusivamente en servidor:

- Retail: `lookup-customer.php` mediante `customerLocator`, para identidad del equipo, crédito y pagos cuando PayJoy los entrega. No se aplica la restricción hoy/ayer usada al registrar ventas.
- Consulta de saldo: `https://www.payjoy.com/payments/pay-cc.php`, con el selector existente `pay-payment-api-html`. Su POST consulta información; no registra un pago. Complementa saldo, vigencia y cuotas por código.

Si Retail no está configurado o responde vacío, un código puede consultarse directamente. Para resolver un IMEI se admite una asociación importada única de los últimos 120 cortes, con comprobación inversa; no se retorna ni guarda el documento de esa asociación. Una identidad contradictoria, asociación ambigua o fallo de autenticación/transporte de Retail no se sustituye por una asociación supuesta. Si existe una ficha Retail válida y falla la consulta complementaria de saldo, se conserva la información Retail con una advertencia; una respuesta contradictoria se rechaza.

Los lectores no reintentan automáticamente. Tienen límite de 20 segundos y 256 KiB por respuesta y rechazan redirecciones. No se transmiten tokens o claves al navegador, ni se guardan respuestas crudas o mensajes privados del proveedor.

## Interpretación de datos

El registro conserva una lista permitida de campos: identificadores, modelo, número de crédito, saldo, moneda, vigencia, estado explícito de pago completo, importes del crédito y cuotas, plazo, última conexión, estado técnico y pagos informados. Los campos opcionales ausentes o inválidos quedan desconocidos. No se calcula una cuota quincenal multiplicando la semanal.

Los importes sin moneda verificable se omiten con advertencia; no se les asigna la moneda de otra fuente. Se rechazan monedas contradictorias y un resultado combinado que indique pago completo con saldo positivo. Saldo cero o reducción del saldo no demuestran pago. La vigencia no certifica el estado actual de bloqueo.

Los pagos requieren importe, moneda y fecha verificables. Se conservan hasta los 100 más recientes recibidos, con advertencia si se omiten filas. Un historial vacío, parcial o no disponible nunca prueba que el cliente no haya pagado. La ficha muestra fuente y fecha de consulta; no presenta datos guardados como una lectura en vivo.

## Permisos, auditoría y seguimiento

Se reutiliza el acceso de extensiones: vendedor, apoyo operativo, supervisor, administrador y auditor; bodega, facturador y perfiles desconocidos quedan excluidos. La consulta directa puede usar equipos de otro asesor o sede, sin leer ni vincular su registro comercial. La búsqueda por cédula del módulo de extensiones conserva su alcance anterior.

La operación se guarda antes de consultar PayJoy. Un UUID idempotente, su hash de entrada y un bloqueo de lectura por identidad/identificador evitan repetir envíos concurrentes. Hay un límite local de diez consultas por minuto e identidad. Los errores se conservan con códigos seguros. Los datos de usuario, perfil y sede proceden de la sesión, nunca del cuerpo de la petición.

GET lee exclusivamente la base: devuelve las últimas 30 consultas y 30 operaciones de extensiones de la misma identidad completa (`usuarioId`, `perfilId`, `sedeId`). Abrir la pantalla, recuperar una consulta o actualizar el historial no llama a PayJoy ni modifica bloqueos de extensiones. El POST exige sesión, permiso, JSON y origen autorizado, y solo ejecuta lecturas del proveedor.

Para una extensión `EXITOSA` con respuesta explícita `GRANTED`, el seguimiento busca la última consulta del mismo equipo e identidad iniciada después de finalizar la extensión, aunque no esté entre las 30 consultas visibles. Los identificadores presentes deben ser compatibles; no se cruzan tags o IMEI contradictorios. Una consulta iniciada antes del resultado no cuenta como comprobación posterior. El último fallo no se oculta detrás de una lectura anterior exitosa.

Solo se informa un pago posterior cuando PayJoy entregó un movimiento positivo fechado después de la extensión y hasta el fin de la consulta. La comparación no altera el resultado original ni demuestra que la extensión causó el pago. Una gestión `INDETERMINADA` sigue requiriendo revisión en PayJoy: consultar la ficha no la confirma, reintenta o desbloquea.

## Migración y verificación

`PayJoyCreditCheck` incorpora 17 columnas y seis índices: clave primaria, UUID idempotente único, bloqueo de lectura único y tres índices por identidad/fecha, identidad/tag/fecha e identidad/IMEI/fecha. Conserva asesor, identificador, estado, observación mínima, error y fechas; no guarda nombres/documentos del cliente ni credenciales.

Se añade dentro de la misma transacción idempotente de `scripts/apply-payjoy-extensions-schema.sql`, con `lock_timeout = 10s` y `statement_timeout = 120s`. El verificador existente comprueba tipos, nulabilidad e índices de ambas tablas: `PayJoyExtensionOperation` conserva sus 26 columnas y seis índices. No hay creación de tablas durante las peticiones.

Antes de activar esta versión, aplicar y verificar el esquema con `npm run db:apply-payjoy-extensiones` y generar el cliente Prisma. Conservar en Railway el paso previo de `npm run db:apply-cierre` seguido del comando PayJoy; no reemplazar CIERRE. Un error de migración/verificación debe impedir activar la versión. El comando ya existente incluye la tabla nueva; no requiere otro paso independiente.

Verificación del cambio:

```sh
npm run test:payjoy-credito
npm run test:payjoy-extensiones
node --test tests/payjoy-extensions-navigation.test.mjs
npx tsc --noEmit
npm run build
```

Las pruebas sustituyen proveedor, sesión y base únicamente en sus fixtures. Cubren identidad, fuentes, datos ausentes, permisos, idempotencia, seguimiento temporal y ausencia de nuevas ejecuciones de extensiones. Revisar además escritorio/celular y confirmar migración, despliegue y una consulta real por separado. Producción no incorpora datos simulados.
