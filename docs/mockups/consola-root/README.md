# Mockups de la consola de ROOT

Prototipos en HTML de la consola de ROOT de `web-admin` (rutas `/root/*`): la lista de marcas, el detalle de una marca con sus dueños y sus restaurantes, la lista de dueños, las cuentas ROOT, el historial de acciones de ROOT, los diálogos (crear, editar, dar de baja, reactivar, invitar, quitar acceso) y los estados de cada pantalla. Tienen la estética de web-admin y son responsive. No forman parte de ninguna app ni del build. El plan, las decisiones y la estimación están en [`../../plan-consola-root.md`](../../plan-consola-root.md).

**Actualizados el 2026-10-21 para la Fase 4 de autenticación** (`docs/auth/specs/auth.md`): los dueños y las cuentas ROOT **se invitan por mail** y a los dueños se les **quita el acceso**. Ya no hay contraseña inicial, «Contraseña temporal», restablecer contraseña, cambiar email, eliminar la cuenta ni la pantalla de primer ingreso (la atiende web-auth). Ya reflejan el contrato real de la entrega 4.4 (la lista de dueños no informa invitaciones pendientes; sí si la cuenta está desactivada).

## Cómo verlos

Abrí **`index.html`** en el navegador (doble clic, no hace falta servidor). Tiene:

- La lista de pantallas y estados a la izquierda (cargando, vacío, error, sin conexión, nombres larguísimos, los diálogos).
- Un selector de ancho: celular (320, 360 y 390), tablet (768), escritorio (1280) o los tres a la vez.
- **Qué cambió y qué confirmar**: lo que cambió con la Fase 4, cómo quedó la 4.4 y lo que ROOT hace y no hace.

Las pantallas son **interactivas pero no guardan nada**: los botones abren los diálogos, la búsqueda filtra, el interruptor suma las marcas dadas de baja, el menú ⋮ muestra las acciones, la baja de una marca pide escribir su nombre, «Quitar acceso» del único dueño avisa que no se puede, el historial se filtra y despliega, y las cuentas ROOT no tienen acciones por fila. Cada pantalla también se abre sola con el botón "Abrir sola".

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | El visor. |
| `pantalla.html` | La pantalla en sí. Parámetros: `?vista=` `marcas`, `marca` (con `&id=`), `duenos`, `roots` o `historial`; `&estado=` `normal`, `cargando`, `vacio`, `error`, `sin-conexion` o `muchas`; `&dialogo=` `nueva-marca`, `editar-marca`, `baja-marca`, `reactivar-marca`, `nuevo-restaurante`, `editar-restaurante`, `baja-restaurante`, `reactivar-restaurante`, `invitar-dueno`, `invitacion-enviada`, `quitar-acceso`, `ultimo-dueno` o `invitar-root`; `&dato=` el restaurante o el dueño del diálogo (en `invitacion-enviada`: `dueno`, `existente`, `root` o `root-existente`; en `invitar-dueno`: `desde-duenos`); `&error=` `email`, `slug` o `red`; del historial: `&actor=` (un email o `script`), `&tipo=` (`MARCA`, `RESTAURANTE`, `OWNER` o `ROOT`), `&desde=` y `&hasta=` (AAAA-MM-DD) y `&abierto=` (ids de acciones con el detalle desplegado, como `h1,h5`); `&bajas=1`; `&q=` la búsqueda; `&pop=` el menú ⋮ abierto (`dd1` un dueño en el detalle de la marca, `ud1` en la lista de dueños, `rr1` un restaurante); `&menu=1` el menú lateral abierto (celular). |
| `root.css` | Estilos. Los colores y las medidas son los de `apps/web-admin/src/pages/admin/AdminLayout.tsx` y `pages/admin/marca/estilos.ts`. |
| `root.js` | Datos de ejemplo (todo inventado) y el armado de las pantallas. |

Usan el logo real de `apps/web-admin/public/`, por eso hay que verlos dentro del repositorio. Las tipografías (Montserrat e Inter) se cargan desde Google Fonts: sin conexión se ven con la fuente del sistema.

## Después

Cuando la consola esté implementada, esta carpeta se puede borrar o dejar como referencia del diseño aprobado.
