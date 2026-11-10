# Borradores PayJoy para Dapta

Esta primera fase permite consultar el celular del equipo y preparar un lote
persistente. **No envía mensajes, no llama a Dapta, no crea solicitudes de pago y
no programa campañas.** Todos los lotes permanecen en `DRAFT_ONLY`; la API retorna
`sendingEnabled: false` y no implementa ninguna acción de envío.

## Fuente real del celular

Se reutiliza `readPayJoyCreditPaymentPayload` de `lib/payjoy.ts`, la consulta de
datos de pago que ya usa CONECTAMOS. No se añade un endpoint supuesto para buscar
contactos por cédula ni se automatiza el botón de cobro de Nequi.

El 9 de noviembre de 2026 se contrastó el equipo que el usuario tenía abierto en
PayJoy → Nequi. `deviceDetails.phoneNumber` y `formattedPhone` de la consulta
existente coincidieron exactamente con el número prellenado en el navegador y
con el número facilitado por el usuario. No se incluyen esos datos personales
en este documento ni en las pruebas.

El adaptador requiere `valid === true`, el mismo `deviceDetails.deviceTag` y
`deviceDetails.country === "CO"`. Normaliza exclusivamente celulares colombianos
sin truncarlos. Si los dos campos informan números diferentes, rechaza la
respuesta. Si falta el número estructurado, deja el contacto pendiente: nunca usa
teléfonos de soporte, de la tienda ni de terceros como sustitutos.

La fuente `PAYJOY_NEQUI_PREFILL` identifica el origen comprobado, **no acredita
titularidad, disponibilidad de WhatsApp ni consentimiento**. Esas revisiones
siguen pendientes. Los teléfonos completos sólo se muestran en el detalle a
perfiles autorizados; no se incluyen en logs ni en la lista del historial.

## Uso

Ruta: `/dashboard/payjoy/dapta`, accesible desde la cartera PayJoy para perfiles
Administrador y Auditor. Los perfiles de vendedor, apoyo, facturador o bodega no
heredan acceso por estar sobre una cuenta administrativa.

1. Pegar hasta 25 códigos de equipo PayJoy y preparar el borrador.
2. Consultar los celulares reales y revisar cada resultado.
3. Recuperar el mismo borrador desde su historial después de actualizar la página.
4. Reintentar de manera explícita las consultas fallidas o interrumpidas.

Se deduplican equipos y se señalan celulares compartidos dentro del lote. La
creación usa un identificador de solicitud para impedir duplicados al reenviar.
Las consultas tienen una reserva temporal para impedir carreras y recuperar
interrupciones. Abrir o actualizar un borrador no consulta PayJoy de nuevo.

La plantilla V2 de los nuevos borradores identifica a CONECTAMOS por el crédito
PayJoy e invita a revisar el crédito hoy y pagar hoy si hay un pago pendiente.
Usa exclusivamente **Efecty 112090 — Adelantos Colombia**, con la cédula del
titular como referencia, y el enlace oficial de cada equipo:
`https://pay.payjoy.com/p/device/{TAG}`. No afirma mora, saldo ni fecha límite,
ni inserta cédulas completas o promesas no verificadas. No reutiliza el convenio
de FINSER PAY.

Cada lote conserva su plantilla completa en `messageTemplate`; no se actualizan
los textos históricos ni se reemplazan al reenviar la solicitud de creación.
Al preparar la vista sólo se sustituye el marcador literal `{{paymentLink}}`
por una URL con host fijo y el código validado del equipo. Una plantilla anterior
sin ese marcador se muestra exactamente como fue guardada. Esta representación
no consulta PayJoy, no crea solicitudes de pago ni realiza envíos.

## Instalación y comprobación

La migración es aditiva y separada. El comando existente
`db:apply-payjoy-extensiones` conserva su SQL y verificador, y ahora ejecuta
`db:apply-payjoy-dapta` al final. Así el predeploy actual de Railway aplica las
tablas nuevas sin cambiar su configuración ni sustituir el paso de CIERRE.
No usar `prisma db push` sobre producción.

```sh
npm run db:apply-payjoy-dapta
npm run prisma:generate
node --test tests/payjoy-dapta-*.test.mjs
npm run build
```

Diagnóstico opcional con un equipo autorizado real:

```sh
node scripts/verify-payjoy-dapta-phone.mjs CODIGO_PAYJOY
```

El diagnóstico utiliza el mismo adaptador y sólo muestra los últimos cuatro
dígitos. No consulta la base ni envía el teléfono a Dapta. Las pruebas usan
fixtures sintéticos exclusivamente dentro del entorno de pruebas.

## Fase de envío pendiente

### Preparación de la conexión, 9 de noviembre de 2026

El usuario eligió como remitente CONECTAMOS, mencionando el crédito PayJoy,
y solicitó una línea separada. La revisión de Dapta encontró una única línea
Finser PAY y ninguna plantilla específica de CONECTAMOS/PayJoy. No se reutiliza
la plantilla de Finser PAY, su convenio ni su flujo de envío.

`integrations/dapta/payjoy-preview.flow.json` prepara un flujo HTTP aislado de
validación: recibe identificador de evento, equipo, texto y `PREVIEW_ONLY`;
responde con `sending_enabled: false`, `accepted_for_delivery: false` y sin
identificador de mensaje. No recibe celular ni documento, no tiene nodo de
mensajería, agente, acceso a contactos ni programación. Se comprobó localmente
y pasó la validación estricta de Dapta sin advertencias. Tras aprobar el usuario
su diff se creó el flujo `mvlBw` en el workspace FINSERPAY; Dapta confirmó la
persistencia y la lectura del mismo contenido. **No se ha ejecutado ni está
conectado al servidor de CONECTAMOS.** Su conexión posterior debe mantener la
credencial exclusivamente en servidor. Crear este validador no habilita envíos.

La organización solicitada del lote futuro es: vencidos, vencen hoy y prioridad
40/60, en ese orden y con una sola entrada por cliente. «No aprobado 40/60» no
demuestra mora. La hora solicitada es 10:00 `America/Bogota`; permanece sin
programar. La integración debe revalidar los datos, excluir domingos/festivos,
respetar las autorizaciones y bajas y evitar contactos repetidos entre campañas
y canales. El calendario y los grupos son requisitos pendientes, no filtros ya
activos en esta versión.

La URL del Radar proporcionada devuelve inicio de sesión de Google al servidor.
Su sesión de navegador no se usa como credencial del backend. Falta una API,
exportación autorizada o acceso a la fuente para formar lotes automáticos; no
se sustituyó por cortes locales ni por datos simulados. El usuario confirmó que
dispone del correo y clave del formulario propio del Radar; no se solicitaron,
copiaron ni almacenaron credenciales. Ese acceso aún no constituye un contrato
de integración automática verificado.

Esta entrega prepara datos y el flujo aislado de validación; no modifica agentes,
plantillas ni contactos externos. Una futura fase requiere resolver el canal
permitido para este caso, consentimiento, titularidad, plantillas específicas,
horarios, exclusiones, deduplicación entre campañas y revalidación del crédito.
La política vigente de WhatsApp enumera `debt collection` entre servicios
restringidos; una plantilla aprobada no sustituye esa validación.

Referencias:
- https://whatsappbusiness.com/policy/
- https://www.claro.com.co/portal/co/recursos_contenido/pdf/terminos-y-condiciones-pay-joy-alianzas-financieras.pdf
- Implementación de lotes revisada en FINSER PAY: commit `5b914b212f30694bb7c8bab47abb75c6a433f764`.
