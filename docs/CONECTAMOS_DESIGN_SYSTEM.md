# Sistema visual de CONECTAMOS

Este documento define el lenguaje visual base de CONECTAMOS. Toda pantalla nueva o rediseño debe respetarlo sin alterar rutas, permisos, reglas de negocio ni cálculos existentes.

## Principios

- **Lujo sobrio:** interfaces limpias, precisas y profesionales; la jerarquía nace del espacio, el contraste y la tipografía.
- **Operación primero:** los datos, estados y acciones principales deben poder leerse rápidamente.
- **Consistencia:** una misma acción conserva texto, tamaño, color y comportamiento entre módulos.
- **Color con intención:** rojo para marca y acciones prioritarias; verde solo para resultados positivos; ámbar o rojo para alertas.
- **Densidad equilibrada:** evitar tarjetas gigantes, espacios vacíos excesivos, textos diminutos y controles innecesarios.

## Paleta

| Uso | Color recomendado |
| --- | --- |
| Fondo general | `#F5F6F8` |
| Superficie / tarjeta | `#FFFFFF` |
| Grafito principal | `#11161D` |
| Texto principal | `#0F172A` |
| Texto secundario | `#64748B` |
| Borde | `#E2E8F0` |
| Rojo CONECTAMOS | `#E30613` |
| Rojo suave | `#FEF2F2` |
| Verde positivo | `#059669` |
| Verde suave | `#ECFDF5` |
| Ámbar de alerta | `#D97706` |
| Ámbar suave | `#FFFBEB` |

No usar degradados azul-verde, violeta o rosado como decoración de base. Los estados nunca deben depender únicamente del color: incluir etiqueta, icono o texto.

## Tipografía

- Familia actual: `Arial, Helvetica, sans-serif` mientras el proyecto no adopte una fuente global distinta.
- Título de página: 28–34 px, peso 800–900, interlineado compacto.
- Título de sección: 18–24 px, peso 800–900.
- Título de tarjeta: 14–16 px, peso 700–900.
- Texto de cuerpo: 14–16 px, interlineado 1.45–1.6.
- Texto auxiliar: mínimo 12 px. Evitar información operativa por debajo de ese tamaño.
- Etiquetas superiores: 11–12 px, mayúsculas, peso alto y espaciado moderado.

## Espaciado y estructura

- Escala base: 4, 8, 12, 16, 20, 24, 32 y 40 px.
- Separación entre secciones: 20–28 px.
- Relleno de tarjetas: 16–24 px.
- Alto mínimo de controles: 44 px; acciones principales: 44–48 px.
- Radio de tarjetas: 14–16 px. Controles y botones: 10–12 px.
- Aprovechar el ancho disponible. En escritorio usar grillas equilibradas; en tableta reducir columnas y en móvil apilar sin perder el orden lógico.

## Superficies y tarjetas

- Fondo blanco, borde `#E2E8F0` y sombra discreta, por ejemplo `0 8px 24px rgba(15, 23, 42, 0.05)`.
- Evitar tarjetas dentro de tarjetas cuando una división, una fila o un borde sea suficiente.
- Las tarjetas de indicadores deben tener altura uniforme dentro de una misma fila.
- Los valores extensos deben usar `min-width: 0`, ajuste de tamaño o salto controlado; nunca deben salir de su contenedor.

## Botones y acciones

- **Primario:** fondo rojo CONECTAMOS, texto blanco. Reservado para la acción principal o confirmación.
- **Grafito:** fondo `#11161D`, texto blanco. Acceso destacado o acción operativa principal.
- **Secundario:** fondo blanco, borde gris, texto grafito.
- **Peligro:** rojo sobre superficie roja suave; exigir confirmación cuando la acción sea destructiva.
- Mantener altura, radio, peso y capitalización uniformes dentro de la pantalla.
- En centros de herramientas, usar mayúsculas con espaciado moderado para los nombres de los accesos operativos; conservar títulos y descripciones en escritura normal.
- Siempre incluir estados `hover`, `focus-visible`, `disabled` y `loading`.
- El foco debe ser visible con anillo de alto contraste. No retirar el contorno sin reemplazarlo.

## Formularios

- Etiqueta visible encima del control; el placeholder no reemplaza la etiqueta.
- Errores debajo del campo afectado, en lenguaje claro y sin borrar la información ingresada.
- Agrupar campos por objetivo, no por conveniencia técnica.
- Controles de 44–48 px, borde gris y foco visible.
- Las acciones deben quedar al final del flujo; evitar barras de botones largas y desalineadas.

## Tablas y listados

- Encabezado claro y persistencia visual de columnas.
- Filas con separación suave, suficiente altura y alineación numérica consistente.
- Importes alineados a la derecha; estados mediante etiquetas compactas.
- En pantallas pequeñas permitir desplazamiento horizontal controlado o transformar filas en tarjetas legibles.
- Paginación y cantidad de resultados deben ser visibles cuando el volumen lo requiera.

## Estados

- **Carga:** esqueleto o indicador dentro del área que se actualiza.
- **Vacío:** explicar qué falta y ofrecer una acción útil cuando exista.
- **Error:** mensaje específico, opción de reintentar y preservación de datos ya capturados.
- **Éxito:** confirmación breve, sin bloquear el siguiente paso.
- **Protegido:** mostrar que el dato está restringido sin exponer el valor ni alterar el permiso.

## Gráficas

- Etiquetar claramente cada serie y su unidad.
- Cuando se comparen conteos con dinero, usar escalas independientes visibles; no mezclar ambas magnitudes en un mismo eje.
- Usar rojo CONECTAMOS para la serie comercial principal y verde únicamente para resultados positivos como utilidad.
- Los puntos deben ofrecer el valor exacto mediante tooltip y conservar un estado vacío legible.

## Navegación

- Sidebar grafito fijo en escritorio y menú desplegable en móvil.
- Sección activa con rojo CONECTAMOS y contraste suficiente.
- Mantener el mismo destino de las rutas existentes y filtrar opciones según permisos reales.
- En centros de herramientas, menús y accesos rápidos, usar una única configuración de rutas para renderizado, búsqueda, conteos y favoritos.

## Iconografía

- Reutilizar `DashboardIcon` y los iconos existentes antes de agregar dependencias.
- Iconos monocromáticos, tamaño coherente (18–24 px) y siempre acompañados de texto en acciones no evidentes.
- No mezclar varios estilos de trazo o iconos decorativos de colores sin significado operativo.

## Revisión antes de entregar

1. Confirmar escritorio, tableta y móvil.
2. Verificar roles, sedes, rutas y estados restringidos.
3. Revisar foco por teclado, contraste, etiquetas y textos alternativos.
4. Comprobar carga, vacío, error y contenido largo.
5. Ejecutar lint, pruebas disponibles y compilación.
6. Confirmar que el rediseño no cambió datos, reglas de negocio ni permisos.
