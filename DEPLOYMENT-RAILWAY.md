# Publicacion de Conectamos en Railway

Esta guia esta pensada para alguien que no sabe de servidores y quiere publicar la app de la forma mas simple posible.

## Lo que vas a usar

- Railway para subir la aplicacion
- PostgreSQL dentro de Railway
- Un dominio propio opcional

## Antes de empezar

Necesitas:

- una cuenta en GitHub
- una cuenta en Railway
- este proyecto subido a un repositorio privado o publico de GitHub

## Variables de entorno obligatorias

En Railway debes crear estas variables:

- `DATABASE_URL`
- `SESSION_SECRET`
- `NUOVOPAY_API_TOKEN`

Para emitir facturas desde Siigo tambien agrega:

- `SIIGO_USERNAME`
- `SIIGO_ACCESS_KEY`
- `SIIGO_PARTNER_ID`

Opcionales para Siigo:

- `SIIGO_ITEM_CODE`
- `SIIGO_API_BASE_URL`
- `SIIGO_AUTH_URL`
- `SIIGO_DEFAULT_COUNTRY_CODE`
- `SIIGO_DEFAULT_STATE_CODE`
- `SIIGO_DEFAULT_CITY_CODE`
- `SIIGO_DEFAULT_POSTAL_CODE`
- `SIIGO_EXEMPT_ITEM_LIMIT`
- `SIIGO_MAX_INVOICE_TOTAL`

La resolucion/documento, vendedor, forma de pago, ciudad y opciones de envio se configuran por sede en `Dashboard > Sedes`. Si faltan las variables de credenciales o la sede no esta configurada, la app no envia nada a Siigo y muestra el dato pendiente en el modulo de facturacion.

### Variables para facturacion con Siigo

- `SIIGO_USERNAME`: usuario API generado en Siigo Nube.
- `SIIGO_ACCESS_KEY`: access key generado en Siigo Nube.
- `SIIGO_PARTNER_ID`: nombre de la app, por ejemplo `CONECTAMOSAPP`.
- `SIIGO_API_BASE_URL`: opcional; si no se define usa `https://api.siigo.com/v1` para los metodos de API.
- `SIIGO_AUTH_URL`: opcional; si no se define usa `https://api.siigo.com/auth`.
- `SIIGO_ITEM_CODE`: codigo fijo opcional del producto en Siigo. Cada sede puede tener su propio codigo.
- `SIIGO_DEFAULT_COUNTRY_CODE`: por defecto `CO`.
- `SIIGO_DEFAULT_STATE_CODE`: respaldo opcional si una sede no tiene codigo de departamento.
- `SIIGO_DEFAULT_CITY_CODE`: respaldo opcional si una sede no tiene codigo de ciudad.
- `SIIGO_DEFAULT_POSTAL_CODE`: codigo postal de respaldo.
- `SIIGO_EXEMPT_ITEM_LIMIT`: tope por linea exenta. Por defecto `1150000`.
- `SIIGO_MAX_INVOICE_TOTAL`: valor maximo que se permite facturar en Siigo. Por defecto `2500000`.

### Parametros Siigo por sede

En `Dashboard > Sedes`, cada sede puede activar Siigo y definir:

- Documento/resolucion de factura de venta (`document-types?type=FV`).
- Vendedor Siigo (`users`).
- Forma de pago (`payment-types?document_type=FV`).
- Codigo de producto, centro de costo, pais, departamento, ciudad y codigo postal.
- Si envia a DIAN y/o por correo al crear la factura.

Las facturas se envian a Siigo sin impuestos en los items. Si el valor del
equipo supera `$1.150.000`, la app divide el producto en varias lineas enteras,
repartidas lo mas parejo posible y de maximo ese valor. Si la venta supera
`$2.500.000`, la app no permite emitir la factura en Siigo. Confirma con
contabilidad que el producto usado en Siigo tambien este creado como exento o
excluido de IVA.

Los stands y la sede `ONLINE` facturan usando la configuracion Siigo de `ONLINE`.
Para los stands no hace falta duplicar la resolucion: configura `ONLINE` y los registros
guardados en sedes cuyo nombre empiece por `Stand` o codigo empiece por `STAND-`
tomaran esa resolucion.

### Ejemplo de `SESSION_SECRET`

Usa una cadena larga y dificil de adivinar, por ejemplo un texto de 32 a 64 caracteres.

## Paso 1. Subir el proyecto a GitHub

Si todavia no lo tienes en GitHub:

1. Crea un repositorio nuevo
2. Sube la carpeta `C:\conectamos-web\conectamos`
3. Confirma que en GitHub se vea el codigo del proyecto

## Paso 2. Crear el proyecto en Railway

1. Entra a Railway
2. Pulsa `New Project`
3. Elige `Deploy from GitHub repo`
4. Selecciona tu repositorio

### Importante si subes la carpeta padre completa

Si en GitHub subes `C:\conectamos-web` completo, tu app real esta dentro de:

```text
conectamos
```

En Railway debes abrir la configuracion del servicio y definir:

- `Root Directory` = `conectamos`

Si no haces eso, Railway intentara construir desde la carpeta equivocada.

## Paso 3. Crear la base de datos

1. Dentro del proyecto en Railway, pulsa `New`
2. Elige `Database`
3. Elige `PostgreSQL`
4. Railway generara una base nueva

## Paso 4. Conectar la app con la base de datos

1. En el servicio de PostgreSQL, copia la variable `DATABASE_URL`
2. En el servicio de la app, abre `Variables`
3. Agrega:
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `NUOVOPAY_API_TOKEN`
   - variables `SIIGO_*` si ya vas a emitir facturas desde Siigo

## Paso 5. Comandos de build y arranque

Railway normalmente detecta Node solo, pero si te pide comandos usa estos:

### Build Command

```bash
npm install && npm run prisma:generate && npm run build
```

### Start Command

```bash
npm run start:standalone
```

## Paso 6. Crear tablas en produccion

Antes de usar la app por primera vez, en Railway abre una terminal del servicio de la app y ejecuta:

```bash
npm run db:push
```

Luego, si hace falta, ejecuta tambien:

```bash
npm run prisma:generate
```

## Paso 7. Crear o revisar el usuario admin

Cuando la base ya este conectada:

- verifica que exista tu usuario admin
- confirma que puedes iniciar sesion
- prueba inventario, ventas, prestamos, caja y panel financiero

## Paso 8. Poner dominio

Puedes usar el dominio gratis de Railway o conectar uno propio:

1. Entra al servicio de la app
2. Abre `Settings` o `Networking`
3. Agrega un dominio personalizado
4. Railway te dira que registros DNS crear
5. En tu proveedor de dominio, pega esos DNS

## Paso 9. Despues de publicar

Cada vez que hagas cambios:

1. pruebas localmente
2. subes cambios a GitHub
3. Railway redeploya solo
4. si cambias la base, ejecutas:

```bash
npm run db:push
```

## Recomendacion importante

Antes de abrir la app a todas las sedes:

- prueba con 1 o 2 sedes reales
- confirma login, ventas, prestamos, caja, arqueo y reportes
- haz respaldo de la base de datos
- define `SESSION_SECRET` antes de publicar
- si el token de Nuovo Pay ha sido compartido o mostrado, regeneralo

## Enlaces oficiales

- Next.js self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- Railway docs: https://docs.railway.com
- Prisma deploy: https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate
