# Llamadas PayJoy con Valeria

Esta implementación permite revisar y autorizar una campaña única de llamadas
desde un lote de contactos ya guardado en CONECTAMOS. La ventana está fijada al
**10 de noviembre de 2026, de 10:00 a 10:30 a. m. en Bogotá**:
`2026-11-10T15:00:00.000Z` a `2026-11-10T15:30:00.000Z`, sin incluir el extremo
final. No es una campaña diaria ni una importación automática del Radar.

Los artefactos del repositorio conservan los marcadores privados sin sustituir y
`cron_enabled: false` para que una nueva copia no active llamadas. En el espacio
FINSERPAY se verificaron por separado los recursos de producción: agente
`8ff952f3-000b-495b-acf4-5dbc3ea9c355`, puente de operaciones `iVWaZ` y flujo
programado `3WLlO`. La fila del programador quedó activa y sincronizada con
`0 10 10 11 *` y `America/Bogota`. El flujo y el servidor aplican la ventana
absoluta de 2026 para impedir llamadas en futuras ejecuciones de ese cron.

El saludo fijo se configura después de crear el agente. Valeria se presenta
como asistente virtual de CONECTAMOS, pregunta si habla con el titular de la
línea, termina tras 20 segundos de silencio y limita cada llamada a 3 minutos.
Después de guardar el agente desde la interfaz de Dapta, verificar de nuevo
`dapta_webhook`: esa interfaz puede borrar la dirección de devolución de
resultados. La configuración comprobada apunta a
`https://conectamos.app/api/payjoy/voz/callback`.

## Separación respecto a los borradores

Los [borradores PayJoy](PAYJOY_DAPTA.md) siguen en `DRAFT_ONLY`. Su API
`/api/payjoy/dapta` conserva `sendingEnabled: false`; consultar móviles, abrir
el historial o copiar un mensaje no programa llamadas. La voz tiene su propia
API `/api/payjoy/voz` y tablas `PayJoyVoiceBatch`, `PayJoyVoiceCall`,
`PayJoyVoiceEvent` y `PayJoyContactSuppression`.

La voz no envía WhatsApp, SMS ni correo. Valeria se identifica como asistente
virtual de CONECTAMOS. El recordatorio es condicional, menciona PayJoy y usa
**Efecty 112090 — Adelantos Colombia**, con la cédula del titular como referencia
al pagar. No solicita que se dicte la cédula ni confirma recaudos, acuerdos,
desbloqueos, saldos o mora. Un indicador del Radar o de 40/60 no demuestra mora.

## Revisión y autorización en la pantalla

En `/dashboard/payjoy/dapta`, abrir un lote muestra «Llamadas con Valeria».
El acceso exige perfil efectivo Administrador o Auditor; un perfil vendedor
no hereda este permiso de la cuenta base.

1. Consultar el estado guardado y revisar entre uno y siete equipos con celulares
   colombianos encontrados, sin duplicados y dentro de la lista autorizada.
2. Revisar el horario y los números completos del lote autorizado. La fuente
   `PAYJOY_NEQUI_PREFILL` acredita el origen, no la titularidad ni el consentimiento.
3. Confirmar explícitamente la comprobación de titularidad y la autorización
   para contactar por voz en ese horario. Los controles no aparecen marcados.
4. Confirmar la programación. El servidor registra usuario, perfil, sede,
   fecha de autorización, versión del guion y las dos declaraciones.
5. Consultar los estados o cancelar las llamadas que aún no tienen autorización
   final de despacho. Una llamada que ya recibió esa autorización puede estar
   iniciándose; cancelar el lote no promete interrumpirla.

El identificador de solicitud se conserva ante una respuesta perdida. La base
impide otra campaña para `PAYJOY_VOICE_2026_11_10`, otro equipo dentro del mismo
lote y otro registro para el mismo móvil en la fecha. Abrir o actualizar el estado
realiza sólo lecturas de la base; no consulta PayJoy ni inicia llamadas.

## Configuración de servidor

Todas estas variables son de servidor; ninguna usa el prefijo `NEXT_PUBLIC_`.
La pantalla muestra «Configuración pendiente» mientras falte alguna condición.

| Variable | Valor requerido |
| --- | --- |
| `PAYJOY_VOICE_AGENT_ID` | UUID del agente que se haya revisado; debe coincidir con el nodo de llamada. |
| `PAYJOY_VOICE_FROM_NUMBER` | Línea autorizada para esta implementación: `+573124085562`. |
| `PAYJOY_VOICE_JOB_SECRET` | Secreto privado de al menos 32 caracteres para el worker. |
| `PAYJOY_VOICE_EVENT_SECRET` | Secreto privado independiente de al menos 32 caracteres para firmar tokens por llamada. |
| `PAYJOY_VOICE_ALLOWED_DEVICES` | Exactamente siete códigos de equipo distintos, separados por comas. |
| `PAYJOY_VOICE_SCHEDULER_ENABLED` | Sólo la cadena exacta `true` habilita la configuración de voz en el servidor. |

La bandera del servidor no crea una tarea en Dapta. La tarea externa tampoco
puede omitir las comprobaciones del servidor. El ID del agente, la línea y los
códigos deben corresponder a los recursos revisados y a los equipos autorizados.
Los secretos y las URL de webhook que incluyan claves no se guardan en Git,
documentación, capturas, respuestas del navegador ni registros de operaciones.

## Contrato y despacho

| Ruta | Acceso y finalidad |
| --- | --- |
| `GET /api/payjoy/voz?sourceBatchId=...` | Sesión autorizada. Devuelve configuración segura, bloqueos y estado; sólo lee la base. |
| `POST /api/payjoy/voz` | Sesión y origen permitidos. `schedule` recibe `sourceBatchId`, `requestId`, `confirmed: true`; `cancel` recibe `batchId`. No acepta teléfonos aportados por el navegador. |
| `POST /api/payjoy/voz/worker` | Bearer privado del worker. Acciones `claim`, `authorize_dispatch` y `receipt`. |
| `POST /api/payjoy/voz/operation` | Token firmado de una llamada. Verificación de identidad, resultado de contacto o exclusión. |
| `POST /api/payjoy/voz/callback` | Token firmado dentro de las variables de la llamada y correlación de `call_id`. Registra eventos del proveedor. |

`claim` reserva cada registro mediante una actualización condicional y vuelve a
consultar el dato real de PayJoy antes de proponer el despacho. Un móvil cambiado,
una identidad de equipo inconsistente o una consulta fallida retienen la llamada;
un crédito reportado como pagado o con vigencia actual la omite. Un saldo restante
o una vigencia pasada nunca se convierten en una afirmación de mora.

Justo antes del nodo de llamada, el flujo pide `authorize_dispatch`. Esta
autorización se consume una sola vez y vuelve a comprobar ventana, configuración,
cancelación, exclusiones y vigencia de la reserva. El flujo sólo sigue con
`allowed === true` y coincidencia exacta de evento, equipo y móvil. También aplica
su propio límite absoluto de fecha. Una negativa omite el contacto; un fallo al
obtener la autorización detiene el flujo sin iniciar la llamada.

El servidor no llama directamente al proveedor: el nodo nativo de Dapta realiza
la llamada después de esa autorización. El recibo y el callback vinculan el ID
externo con el registro reservado; un ID ya asociado a otra llamada se rechaza.
El callback utiliza el token emitido por CONECTAMOS como credencial, **no una
supuesta firma nativa de Dapta**. El token está limitado a una llamada y expira
el 10 de noviembre de 2026 a las 18:00 UTC, para admitir resultados posteriores
al cierre de la ventana de inicio.

## Resultados, exclusiones y privacidad

`ACCEPTED` sólo significa solicitud aceptada por Dapta; no acredita atención ni
identidad. La identidad únicamente se registra tras confirmación explícita y
autorización de la operación del servidor. El prompt prohíbe revelar el crédito
antes de esa comprobación y exige cerrar ante tercero, buzón o rechazo.

`PAID_REPORTED` es un pago informado pendiente de comprobación.
`PAYMENT_INTENT` no constituye un acuerdo aprobado. `NO_CONTACT` significa que
no hubo contacto; no genera una baja. `OPT_OUT` conserva la exclusión explícita,
bloquea próximos despachos y no se reemplaza por eventos posteriores ordinarios.

Una reserva interrumpida, un recibo ambiguo o un resultado no confirmado pasa a
`UNKNOWN`, sin reintento automático de la llamada. No se debe devolver ese registro
a `PENDING` ni ejecutar manualmente el nodo telefónico para «recuperarlo». Se
reconcilia el resultado con el proveedor y el registro de eventos antes de actuar.
`HELD` y `SKIPPED` tampoco representan llamadas atendidas.

Se conserva el mínimo operativo: móvil de destino, equipo, origen, estados,
fechas, usuario autorizador e ID externo. Las respuestas de estado exponen el
móvil enmascarado; la pantalla autorizada ya dispone del móvil completo del
borrador. No se guardan tokens, claves, transcripciones, grabaciones, payloads
completos ni notas libres de la conversación en las tablas de voz. Los eventos
guardan categorías y campos permitidos. Dapta procesa el teléfono y los datos
necesarios para la llamada como proveedor del canal.

## Instalación y validación

`scripts/apply-payjoy-voice-schema.sql` crea las tablas separadas con restricciones
de ventana, fecha, convenio, estados y unicidad. El verificador comprueba columnas,
índices únicos, restricciones y relaciones de auditoría. La cadena existente
`db:apply-payjoy-extensiones` → `db:apply-payjoy-dapta` → `db:apply-payjoy-voice`
conserva el predeploy previo de CIERRE. No usar `prisma db push` en producción.

```sh
npm run db:apply-payjoy-voice
npm run prisma:generate
npm run test:payjoy-voice
node --test tests/payjoy-dapta-ui.test.mjs
npm run build
```

Las pruebas usan datos sintéticos y proveedores sustituidos exclusivamente dentro
del entorno de pruebas. No realizan llamadas reales. Los artefactos de Dapta son
`integrations/dapta/payjoy-voice-agent.json`, `payjoy-voice-operations.flow.json`
y `payjoy-voice-scheduler.flow.json`. Antes de activar recursos externos se revisa
su diff, se verifican los valores privados en memoria y se relee el recurso creado
y su tarea programada. La comprobación no debe ejecutar el nodo telefónico ni
crear otra campaña de prueba en producción.
