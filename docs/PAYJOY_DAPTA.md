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

El mensaje de muestra usa exclusivamente **Efecty 112090 — Adelantos Colombia**,
con la cédula del titular como referencia. No inserta cédulas completas, saldos,
fechas o promesas no verificadas. No reutiliza el convenio de FINSER PAY.

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

Esta entrega prepara datos para Dapta, pero no crea ni modifica agentes, flujos,
plantillas o contactos externos. Una futura fase requiere resolver el canal
permitido para este caso, consentimiento, titularidad, plantillas específicas,
horarios, exclusiones, deduplicación entre campañas y revalidación del crédito.
La política vigente de WhatsApp enumera `debt collection` entre servicios
restringidos; una plantilla aprobada no sustituye esa validación.

Referencias:
- https://whatsappbusiness.com/policy/
- https://www.claro.com.co/portal/co/recursos_contenido/pdf/terminos-y-condiciones-pay-joy-alianzas-financieras.pdf
- Implementación de lotes revisada en FINSER PAY: commit `5b914b212f30694bb7c8bab47abb75c6a433f764`.
