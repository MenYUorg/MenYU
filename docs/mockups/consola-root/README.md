# Mockups de la consola de ROOT

Prototipos en HTML de la consola de ROOT de `web-admin` (rutas `/root/*`): la lista de marcas, el detalle de una marca con sus dueños y sus restaurantes, la lista de dueños, las cuentas ROOT, el historial de acciones de ROOT, la pantalla de primer ingreso con contraseña temporal, los diálogos (crear, editar, dar de baja, reactivar, restablecer contraseña, eliminar) y los estados de cada pantalla (66 en total). Tienen la estética de web-admin y son responsive. No forman parte de ninguna app ni del build. El plan, las decisiones y la estimación están en [`../../plan-consola-root.md`](../../plan-consola-root.md).

## Cómo verlos

Abrí **`index.html`** en el navegador (doble clic, no hace falta servidor). Tiene:

- La lista de pantallas y estados a la izquierda (cargando, vacío, error, sin conexión, nombres larguísimos, los diálogos).
- Un selector de ancho: celular (320, 360 y 390), tablet (768), escritorio (1280) o los tres a la vez.
- **Qué se aprobó y qué confirmar**: lo que se aprobó el 2026-10-15, lo que se agregó ese día (cuentas ROOT, script del primer ROOT, historial) y las suposiciones por confirmar (los mismos números que en el plan).

Las pantallas son **interactivas pero no guardan nada**: los botones abren los diálogos, la búsqueda filtra, el interruptor suma las marcas dadas de baja, el menú ⋮ muestra las acciones, la baja de una marca pide escribir su nombre, "Eliminar cuenta" del único dueño avisa que no se puede, el historial se filtra y despliega, y las cuentas ROOT no tienen "Eliminar". Cada pantalla también se abre sola con el botón "Abrir sola".

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | El visor. |
| `pantalla.html` | La pantalla en sí. Parámetros: `?vista=` `marcas`, `marca` (con `&id=`), `duenos`, `roots`, `historial` o `primer-ingreso`; `&estado=` `normal`, `cargando`, `vacio`, `error`, `sin-conexion` o `muchas`; `&dialogo=` `nueva-marca`, `editar-marca`, `baja-marca`, `reactivar-marca`, `nuevo-restaurante`, `editar-restaurante`, `baja-restaurante`, `reactivar-restaurante`, `nuevo-dueno`, `dueno-creado`, `cambiar-email`, `restablecer`, `restablecido`, `eliminar-dueno` o `ultimo-dueno`, `nuevo-root`, `root-creado`, `restablecer-root`, `restablecido-root` o `cambiar-password`; `&dato=` el restaurante o el dueño del diálogo; `&error=` `email`, `slug` o `red` (en `primer-ingreso`: `corta`, `sin-coincidir` o `igual`); del historial: `&actor=` (un email o `script`), `&tipo=` (`MARCA`, `RESTAURANTE`, `OWNER` o `ROOT`), `&desde=` y `&hasta=` (AAAA-MM-DD) y `&abierto=` (ids de acciones con el detalle desplegado, como `h1,h5`); `&bajas=1`; `&q=` la búsqueda; `&pop=` el menú ⋮ abierto (`dd1` un dueño, `rr1` un restaurante, `oro2` una cuenta ROOT); `&menu=1` el menú lateral abierto (celular). |
| `root.css` | Estilos. Los colores y las medidas son los de `apps/web-admin/src/pages/admin/AdminLayout.tsx` y `pages/admin/marca/estilos.ts`. |
| `root.js` | Datos de ejemplo (todo inventado) y el armado de las pantallas. |

Usan el logo real de `apps/web-admin/public/`, por eso hay que verlos dentro del repositorio. Las tipografías (Montserrat e Inter) se cargan desde Google Fonts: sin conexión se ven con la fuente del sistema.

## Después

Cuando la consola esté implementada, esta carpeta se puede borrar o dejar como referencia del diseño aprobado.
