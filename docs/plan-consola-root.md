# Plan: consola de ROOT

**Estado:** mockups y supuestos 1 a 9 aprobados el 2026-10-15; novedades del mismo día (cuentas ROOT, historial de acciones) en el plan y los mockups; decisiones 12, 15, 18, 19 y 20 y las de implementación de E1a confirmadas el 2026-10-20. **El script de cuentas ROOT (E0) y las etapas 1a y 1b (backend completo: historial, cuentas ROOT, dueños, marcas y restaurantes) están hechos** (2026-10-20, rama `feat/pantalla-root`); la pantalla todavía no tiene código. Cómo probarlo en local: [`probar-consola-root.md`](probar-consola-root.md) **Ajustado el 2026-10-20 por la spec de autenticación con Supabase** ([`auth/specs/auth.md`](auth/specs/auth.md), Fases 1 y 2 ya en `main`): lo que toca contraseñas y cuentas se rehace sobre invitaciones por mail (sección 13) · **Actualizado:** 2026-10-20 · **Base:** `main` (v1.0.7)
**Mockups:** [`docs/mockups/consola-root/`](mockups/consola-root/README.md) (abrir `index.html`; 66 pantallas y estados)
**Viene de:** la sección 11.2 y el Apéndice A de [`plan-discovery-descuentos.md`](plan-discovery-descuentos.md). Este plan **reemplaza** a 11.2 y cambia la regla de ROOT (sección 2.1 y D16 de ese plan, y `CLAUDE.md`).

> **Planificación histórica en todo lo que toca a cuentas y contraseñas (al 2026-10-27).** Este plan se escribió sobre el login propio de MenYU: cuentas en la tabla `admin`, contraseñas con bcrypt, refresh tokens propios y `debeCambiarPassword`. La entrega 4.4 de [`auth.md`](auth/specs/auth.md) pasó la consola a Supabase (2026-10-21) y la Fase 5 borró ese login (2026-10-26). Lo que este documento cuenta de contraseñas, de `admin`, de los refresh tokens o de las rutas que los usaban —las secciones 3, 5 (las contraseñas que genera el sistema), 7 (con 7.1 y 7.2), 8.1, 9, 10, 11, 12 y 13— es cómo se planificó y se construyó, no cómo funciona hoy. **Lo vigente:** la API de la consola, en [`doc.md`](../doc.md) ("ROOT console") y en "4.4, cómo quedó" de la spec; las cuentas de los dueños y de ROOT son de Supabase, se invitan por mail y la contraseña la maneja cada persona desde web-auth.

Este documento es el plan de la consola de ROOT: qué hace ROOT, cómo estaba el código, qué se decidió, la API, las pantallas, las etapas con su estimación y los riesgos. Lo que no toca cuentas ni contraseñas (la regla de ROOT, qué edita, la baja y el historial) sigue valiendo; la referencia vigente de la API es "4.4, cómo quedó" de [`auth.md`](auth/specs/auth.md) y [`doc.md`](../doc.md) ("ROOT console").

## Índice

1. [Por qué ahora](#1-por-qué-ahora)
2. [La regla de ROOT (corregida)](#2-la-regla-de-root-corregida)
3. [Cómo está hoy el código](#3-cómo-está-hoy-el-código)
4. [Decisiones](#4-decisiones)
5. [Qué edita ROOT, campo por campo](#5-qué-edita-root-campo-por-campo)
6. [Qué pasa al dar de baja una marca o un restaurante](#6-qué-pasa-al-dar-de-baja-una-marca-o-un-restaurante)
7. [API: `/root/*`, cuentas ROOT e historial](#7-api-root-cuentas-root-e-historial)
8. [Pantallas](#8-pantallas)
9. [Etapas, estimación y orden](#9-etapas-estimación-y-orden)
10. [Tests y verificación](#10-tests-y-verificación)
11. [Riesgos y notas](#11-riesgos-y-notas)
12. [Fuera de alcance](#12-fuera-de-alcance)
13. [Autenticación con Supabase (`feat/auth`): qué cambia para la consola](#13-autenticación-con-supabase-featauth-qué-cambia-para-la-consola)

---

## 1. Por qué ahora

El QA en staging necesita un usuario OWNER para cargar logos y ofertas, y hoy **ROOT no puede crear un OWNER**: `POST /admins` solo crea GERENTE. El orden anterior (terminar Discovery y recién después la consola de ROOT) se cambió el 2026-10-15 a pedido del equipo: la consola va primero y el QA de Discovery sigue con ella. Mientras la consola no exista, un puente (script que imprime SQL, fuera del repo) destraba el QA: sección 9.

## 2. La regla de ROOT (corregida)

Corregida el 2026-10-15 (antes: "crea y elimina marcas, restaurantes y usuarios OWNER y GERENTE").

**ROOT crea, edita y borra** marcas, restaurantes y usuarios **OWNER** (asignados a su marca), y **crea otras cuentas ROOT** (una por integrante del equipo). **Los GERENTE no los crea ROOT: los crea el OWNER desde su panel.** **Las cuentas ROOT no se borran** desde la app (decisión 15).

**ROOT no ve datos privados ni toma decisiones** sobre las marcas ni los restaurantes: menú, precios, descuentos, mesas, pedidos, mozos, reportes, caja, y tampoco el logo ni la dirección (esos dos los decide solo el OWNER). No es un bypass: el código nuevo no incluye a ROOT en los chequeos de pertenencia.

**Todo lo que hace un ROOT queda registrado** en un historial que nadie puede editar ni borrar y que todos los ROOT pueden ver (decisión 17).

| Quién crea a quién | |
|---|---|
| La primera cuenta ROOT de cada entorno | una persona del equipo, con el script (decisión 14) |
| Las demás cuentas ROOT | otro ROOT, desde la consola |
| Marcas, restaurantes y cuentas OWNER | ROOT |
| Cuentas GERENTE, mozos, cocina, mesas y todo el menú | OWNER (el GERENTE, lo que se le asigne) |

En la interfaz a los OWNER se los llama **dueños**; en el código y la API siguen siendo `OWNER`.

## 3. Cómo está hoy el código

Relevado el 2026-10-15 leyendo `main`. Son hechos, no suposiciones. **Describe el login propio (`Admin`, contraseñas, JWT propio), que la migración a Supabase Auth retiró (Fase 5, 2026-10-26): ver la sección 13.**

| Tema | Hoy |
|---|---|
| Crear un OWNER | **No se puede por la API.** `POST /admins` crea siempre un GERENTE (aunque lo llame ROOT, y sin marca). Una cuenta OWNER solo se crea con el seed o con SQL. |
| Crear un ROOT | No hay forma por la API. Salían del seed (solo local) o de `POST /auth/dev/root`, que se sacó en el hotfix v1.0.5. La documentación dice que `root@menyu.com` / `root1234` se creó así, así que **puede existir en staging y producción con esa contraseña**. |
| `nombre` de la cuenta | `CreateAdminDto` pide `nombre`, pero la tabla `admin` no tiene esa columna y el servicio lo ignora. Una cuenta de admin es solo **email + contraseña + rol + marca**. Tampoco tiene fecha de alta ni estado. |
| Login | Busca el email **en minúsculas** y mira primero `admin`, después `mozo` y después `cliente`: una cuenta de admin con el mismo email que un cliente o un mozo **taparía** su inicio de sesión. |
| "Borrar" una marca o un restaurante | `DELETE /marcas/:id` y `DELETE /restaurantes/:id` solo hacen `activo = false`. **No cierran nada:** `POST /sessions/open` mira solo que la mesa esté activa (no el restaurante ni la marca), el login no mira ningún estado (ni el de la marca o el restaurante ni el `activo` del propio mozo), y `GET /menu/:id` mira el restaurante pero no la marca. Lo único que respeta el estado de la marca es Discovery (`marca.activo` y `restaurante.activo`). |
| Reactivar | No hay. `activo` no se puede volver a `true` por la API, y las listas de ROOT filtran `activo = true`. |
| Borrado físico | Imposible en la práctica: **todas** las claves foráneas hacia `restaurante` y `marca` son `ON DELETE RESTRICT` y hay pedidos, pagos y menú colgando. |
| `slug` de la marca | Es único (incluso entre dadas de baja) y **nada lo usa**: no está en ninguna ruta ni pantalla. Es un identificador interno. |
| Contraseñas | No existe "cambiar mi contraseña" ni recuperación por mail (no hay servicio de mail). La única vía es `PATCH /admins/:id` (ROOT, o OWNER sobre las cuentas de su marca), sin pantalla. |
| Historial de acciones | No hay nada parecido. Lo más cercano es `pedido_edicion` (ediciones de pedidos). |
| `GET /marcas` y `GET /restaurantes` | Devuelven las filas completas, **incluidas las columnas `mp_*` cifradas** (AES-256-GCM: no es el token en claro) de cada restaurante, a ROOT, OWNER y GERENTE. Conviene un `select` explícito. No se toca nada de Mercado Pago: solo qué columnas salen en estas dos listas. |
| ROOT en web-admin | Entra con las pantallas de OWNER y GERENTE; el selector de contexto carga todas las marcas y restaurantes. No hay pantalla para crear o borrar nada. |
| Ids que no son UUID | Los datos viejos (`m-001`, `r-001`…) no pasan los `@IsUUID()`. Los endpoints nuevos no exigen UUID (validan solo la forma, como `IdRestaurantePipe`). |

## 4. Decisiones

**Acordado** lo pidió el equipo. **Aprobado** es lo que se aprobó el 2026-10-15. **A confirmar** son suposiciones mías para que las apruebes o las cambies. Los números son los mismos que en el visor de los mockups.

| # | Decisión | Estado |
|---|---|---|
| 1 | **Dónde vive:** rutas `/root/*` dentro de web-admin, solo para ROOT (`RoleGuard`) y cargadas con `React.lazy` (OWNER y GERENTE no bajan ese código). ROOT, al iniciar sesión, cae en `/root`. Una cuarta app costaría más y no aporta nada: ROOT ya inicia sesión ahí. | Aprobado |
| 2 | **Qué edita ROOT:** marca: nombre e identificador (`slug`). Restaurante: solo el nombre. Dueño: email y contraseña. Detalle en la sección 5. | Aprobado |
| 3 | **Qué ve ROOT:** solo identidad y estado, con una **API propia `/root/*` y un `select` explícito** en cada consulta. No usa las rutas compartidas `GET /marcas` y `GET /restaurantes`, que devuelven de más. | Aprobado |
| 4 | **Dirección al crear un restaurante:** la carga ROOT una sola vez, porque hoy es obligatoria al crear (D2), y después solo la cambia el OWNER. | Aprobado |
| 5 | **"Borrar" una marca o un restaurante es una baja lógica y reversible** (`activo = false`, con "Reactivar"). No se borra ninguna fila (secciones 3 y 6). Las cuentas OWNER **sí se eliminan** de verdad: son solo credenciales. | Aprobado |
| 6 | **La baja tiene efecto real** (sección 6). Se evalúa "marca activa **y** restaurante activo", así que reactivar la marca devuelve todo como estaba sin tocar cada restaurante. | Aprobado |
| 7 | **Cuentas de dueño:** email + contraseña, sin nombre (se saca `nombre` del DTO). Puede haber varios dueños por marca. **No se puede eliminar al último dueño de una marca activa** (409). *Con Supabase (sección 13):* un dueño es una `Membresia` OWNER de un `Usuario`, sin contraseña propia; la regla del último dueño se mantiene. | Aprobado |
| 8 | **Contraseñas:** el sistema genera la contraseña y la muestra **una sola vez**; la persona la tiene que cambiar en su primer ingreso (columna y pantalla nuevas). "Restablecer" genera otra y vuelve a marcarla como temporal. | Aprobado el 2026-10-15; **supersedida el 2026-10-20** por la spec de autenticación: ROOT no genera ni conoce contraseñas, invita por mail (sección 13) |
| 9 | **BurgerLab:** se da de baja desde la consola. Con eso, todos los ids que no son UUID quedan fuera de Discovery y de la operación, y **ya no hace falta** relajar los `@IsUUID()` (11.3 del plan de Discovery). | Aprobado |
| 10 | Los GERENTE no aparecen en la consola. `POST /admins` deja de aceptar a ROOT y los GERENTE los sigue creando el OWNER. | Derivado de la regla |
| 11 | Sacarle a ROOT los permisos viejos (Apéndice A del plan de Discovery) va **al final**, en la etapa 4. Hasta entonces ROOT puede seguir abriendo las pantallas viejas de web-admin por URL. | Aprobado |
| 12 | Las sesiones de mesa **ya abiertas** en el momento de la baja se dejan terminar (cobrar y cerrar); lo que se corta es abrir sesiones nuevas y entrar. Es un detalle de la 6. | Confirmada (2026-10-20) |
| 13 | **Un ROOT puede crear otras cuentas ROOT** desde la consola. Vamos a tener una por integrante del equipo (tres). *Con Supabase:* se invita por mail (sección 13). | Acordado |
| 14 | **La primera cuenta ROOT de cada entorno se crea con un script** que corre el equipo, con la contraseña elegida al correrlo (sin eco): no queda escrita en el repo ni en la línea de comandos. Hecho: `apps/backend/scripts/cuentas-root.ts` (sección 7.1). *Con Supabase:* el primer ROOT de cada ambiente se crea a mano (Auth y un `INSERT`, como dice `docs/auth/usuarios-prueba-staging.md`) y el script pasa a "promover" un `Usuario` (sección 13). | Acordado y hecho (el script, hasta la migración) |
| 15 | **Las cuentas ROOT no se pueden borrar:** un ROOT no se borra a sí mismo y no se puede borrar al último. *Mi lectura (a confirmar):* ninguna cuenta ROOT se borra desde la consola ni desde la API; la única vía es el script, que nunca borra al último, y la base de datos también lo impide. Si querías que un ROOT pueda borrar a otro (menos a sí mismo y al último), es un cambio chico en E1a y E2. | Acordado; la lectura, confirmada (2026-10-20) |
| 16 | **`root@menyu.com` se borra en staging y en producción** cuando las cuentas personales funcionen bien. Es la etapa 5 (sección 9). | Acordado |
| 17 | **Historial de acciones de ROOT:** todo lo que hace un ROOT queda registrado (quién, qué acción, sobre qué —marca, restaurante, OWNER u otro ROOT— y cuándo), incluidos crear un ROOT y restablecer contraseñas. **No se puede editar ni borrar**, ni desde la app ni desde la API ni, si se puede, desde la base de datos. Todos los ROOT lo ven desde una pantalla de la consola. | Acordado |
| 18 | **Qué se registra y cómo:** todo **cambio** que haga un ROOT (mirar listas no). El registro se escribe en **la misma transacción** que el cambio: si no se puede registrar, el cambio no se hace. Guarda una copia del email de quien lo hizo (sigue valiendo si esa cuenta se retira), qué cambió (antes y después) y **nunca una contraseña**. *Opcional:* registrar también los inicios de sesión de ROOT (+0,25 día). | Confirmada (2026-10-20); el opcional quedó afuera |
| 19 | **Un ROOT puede restablecer la contraseña de otro ROOT** (queda registrado; la otra persona la cambia al entrar). Hace falta si alguien la olvida. | Confirmada el 2026-10-20; **con Supabase** pasa a ser "mandarle el mail para cambiar la contraseña" (sección 13) |
| 20 | **Mínimo de 12 caracteres** al elegir la contraseña en el primer ingreso, para dueños y ROOT (hoy los dueños tienen 8 como mínimo al crear la cuenta). | Confirmada el 2026-10-20; **con Supabase** es la política de contraseñas del proyecto (Authentication → Password), no código nuestro |

## 5. Qué edita ROOT, campo por campo

| Dato | ROOT | Quién más |
|---|---|---|
| Marca: nombre, identificador (`slug`) | ✔ crea y edita | OWNER edita nombre y `slug` de su marca (ya es así; no se toca) |
| Marca: estado (activa, de baja) | ✔ | — |
| Marca: **logo** | ✘ | OWNER |
| Restaurante: nombre | ✔ crea y edita | OWNER y GERENTE (ya es así) |
| Restaurante: estado | ✔ | — |
| Restaurante: **dirección** | ✘ edita. Solo la escribe al crearlo (decisión 4); la ve de solo lectura | OWNER |
| Restaurante: **logo** | ✘ | OWNER |
| Restaurante: modo de sesión | ✘ (hoy ROOT sí puede: se le saca en E4) | OWNER y GERENTE |
| Restaurante: nombre de la sección de recomendados | ✘ (hoy ROOT sí puede: se le saca en E4) | solo OWNER |
| Restaurante: pasarlo a otra marca | ✘ (se da de baja y se crea de nuevo) | — |
| Cuenta OWNER: email | ✔ | — |
| Cuenta OWNER: contraseña | ✔ la genera el sistema al crear y la **restablece** | la persona la cambia en su primer ingreso (E3) |
| Cuenta OWNER: eliminar | ✔ (no al último de una marca activa) | — |
| Cuenta ROOT: crear | ✔ (email; la contraseña la genera el sistema) | el script, para la primera |
| Cuenta ROOT: restablecer la contraseña de otra | ✔ (decisión 19) | el script |
| Cuenta ROOT: cambiar la propia contraseña | ✔ (E3) | — |
| Cuenta ROOT: **eliminar** | ✘ nunca desde la app (decisión 15) | solo el script, y nunca la última |
| Historial de acciones: ver | ✔ todos los ROOT | — |
| Historial de acciones: editar o borrar | ✘ nadie | — |
| Cuentas GERENTE, mozos, cocina | ✘ | OWNER |
| Menú, precios, descuentos, mesas, pedidos, reportes, caja | ✘ no los ve | OWNER y GERENTE |

Con el identificador de una marca dada de baja pasa algo práctico: como el `slug` es único incluso entre las de baja, para reutilizarlo hay que cambiárselo a la vieja. ROOT puede editarlo también en una marca de baja.

## 6. Qué pasa al dar de baja una marca o un restaurante

Es la pregunta de "qué pasa al borrar una marca con restaurantes y usuarios". Esto es lo aprobado (decisiones 5, 6 y 12). **No se borra ninguna fila** salvo las cuentas OWNER que ROOT elimine.

**Estado (2026-10-21).** La parte pública **ya se corta**: Discovery (desde antes), `GET /menu/:id`, `GET /marca/:id/restaurantes` y la apertura de mesas por QR o PIN miran `restaurante.activo AND marca.activo` (una sola regla: `common/restaurante-disponible.ts`). Abrir una mesa nueva de un restaurante dado de baja responde **403 "Este restaurante no está disponible"**; si la mesa ya tiene una sesión abierta, quien vuelve a escanear su QR o se suma entra igual (si no, no podría pedir la cuenta ni pagar). En web-cliente, quien ya estaba en la mesa y abre `/menu` (que da 404) ve la pantalla "Este restaurante ya no está disponible" (`MesaSinCarta`): le dice que su mesa sigue abierta, cómo pedir la cuenta y le ofrece "Pagar la cuenta", "Ver mis pedidos" y "Llamar al mozo". **El acceso del personal también se corta desde la Fase 4 de `feat/auth`** (entrega 4.2): `AccesoService` no cuenta las membresías de una marca o un restaurante dados de baja, así que su personal recibe 403 en cada pedido (y `/auth/me` no los lista); al reactivar, vuelven a contar. Eso incluye cobrar en efectivo, cerrar la mesa, atender llamados y la cocina. **Decidido en la entrega 4.5 (2026-10-21):** una sesión que quedó abierta solo se puede pagar con Mercado Pago desde el celular, y los textos de la consola lo dicen así (`copy.ts`); no se hace ninguna excepción de permisos para que el personal termine esas sesiones.

| Cosa | Baja de la **marca** | Baja de un **restaurante** |
|---|---|---|
| Sus restaurantes | Dejan de estar disponibles (sin cambiarles el `activo`: se evalúa `marca.activo AND restaurante.activo`) | — |
| Discovery y `GET /menu/:id` | No aparecen / 404 (Discovery ya lo hace; el menú hoy mira solo el restaurante) | No aparece / 404 |
| Abrir una mesa (QR, `/check-in`, PIN) | Se rechaza con "Este restaurante no está disponible" | Igual |
| Sesiones de mesa ya abiertas | Siguen pidiendo y pagan con Mercado Pago desde el celular. El personal tampoco puede cobrarlas ni cerrarlas: también perdió el acceso (decisión de la 4.5) | Igual |
| Inicio de sesión de OWNER y GERENTE | Se rechaza (403) | GERENTE asignado solo a ese restaurante: se rechaza |
| Inicio de sesión de mozos y cocina | Se rechaza | Se rechaza |
| Sesiones ya iniciadas (tokens) | Con Supabase, el token sigue vigente, pero cada pedido consulta las membresías: el corte es inmediato | Igual |
| Cuentas OWNER, GERENTE y asignaciones | **Quedan como están** (no se borran) | Quedan |
| Menú, mesas, pedidos, pagos, logos | **Quedan como están** | Quedan |
| **Reactivar** | Vuelve todo como estaba | Vuelve todo |

La reactivación no puede fallar por "restaurantes dados de baja a mano": cada restaurante conserva su propio estado. Dar de baja y reactivar quedan en el historial.

## 7. API: `/root/*`, cuentas ROOT e historial

> **Planificación histórica: la tabla y el párrafo que la presenta son el diseño de las etapas 1a y 1b, sobre el login propio, y no la API vigente** (la vigente está en [`doc.md`](../doc.md), "ROOT console"). **Desde la entrega 4.4 de auth (2026-10-21)** la consola usa el token de Supabase (`@RequiereRoot()`) y los dueños y las cuentas ROOT son `Usuario` y `Membresia` que se invitan por mail: sin contraseñas, sin `debeCambiarPassword` y sin "cambiar el email" ni "restablecer". Las rutas de dueños y cuentas ROOT de la tabla de abajo quedaron así: `GET /root/duenos`, `POST /root/marcas/:id/duenos` `{ email, nombre }`, `DELETE /root/duenos/:membresiaId`, `GET /root/roots` y `POST /root/roots` `{ email, nombre }`. El detalle, en "4.4, cómo quedó" de [`docs/auth/specs/auth.md`](auth/specs/auth.md). La tabla queda como el diseño de las etapas 1a y 1b.

Módulo nuevo `root/` con `@Roles('ROOT')` a nivel de controller (desde la 4.4 de auth, `@RequiereRoot()`). Cada consulta con `select` explícito: nunca `include` sin `select`. Ningún DTO exige UUID: los ids de la ruta se validan solo por su forma. Las contraseñas se guardan con bcrypt y las generadas salen de `crypto.randomInt` (12 caracteres, sin los que se confunden: 0/O, 1/l/I). **Cada ruta que cambia algo registra la acción en el historial dentro de la misma transacción** (sección 7.2).

| Método y ruta | Qué hace | Errores |
|---|---|---|
| `GET /root/marcas?bajas=true` | Lista: `id`, `nombre`, `slug`, `activo`, cantidad de restaurantes (activos y total) y de dueños | |
| `POST /root/marcas` `{ nombre, slug }` | Crea la marca | 409 identificador repetido |
| `GET /root/marcas/:id` | Detalle: datos, restaurantes (`id`, `nombre`, `direccion` de lectura, `activo`) y dueños (`id`, `email`, `debeCambiarPassword`) | 404 |
| `PATCH /root/marcas/:id` `{ nombre?, slug? }` | Edita | 404, 409 |
| `POST /root/marcas/:id/baja` y `/reactivar` | Cambia el estado (idempotente) | 404 |
| `POST /root/marcas/:id/restaurantes` `{ nombre, direccion }` | Crea un restaurante, activo, en esa marca | 404, 409 si la marca está de baja |
| `PATCH /root/restaurantes/:id` `{ nombre? }` | Edita el nombre. Si llega otro campo, 400 (no se ignora en silencio) | 404 |
| `POST /root/restaurantes/:id/baja` y `/reactivar` | Cambia el estado | 404 |
| `GET /root/duenos?q=` | Lista las cuentas OWNER con su marca | |
| `POST /root/marcas/:id/duenos` `{ email, password? }` | Crea un OWNER. Sin `password`, la genera. **Devuelve la contraseña inicial solo en esta respuesta.** Normaliza el email (minúsculas, sin espacios) y rechaza el de un mozo o un cliente | 409 email repetido, 404, 409 marca de baja |
| `PATCH /root/duenos/:id` `{ email }` | Cambia el email (la contraseña no) | 404, 409 |
| `POST /root/duenos/:id/restablecer-password` | Genera una contraseña nueva, la devuelve una vez, marca `debeCambiarPassword` y revoca los refresh tokens de esa cuenta (la tabla `refresh_token` ya existe, con `user_id`, `user_tipo` y `revoked_at`) | 404 |
| `DELETE /root/duenos/:id` | Elimina la cuenta | 404, 409 si es el último dueño de una marca activa |
| `GET /root/roots` | Lista las cuentas ROOT: `id`, `email`, `debeCambiarPassword` y si es la propia | |
| `POST /root/roots` `{ email, password? }` | Crea una cuenta ROOT. Igual que un dueño: contraseña generada, devuelta una sola vez y temporal | 409 email repetido |
| `POST /root/roots/:id/restablecer-password` | Restablece la contraseña **de otra** cuenta ROOT (decisión 19); revoca sus refresh tokens | 400 si es la propia (para eso está "cambiar mi contraseña"), 404 |
| *(no existe)* `DELETE /root/roots/:id` | **No hay ruta para borrar cuentas ROOT** (decisión 15). Un test recorre el enrutador y falla si aparece | |
| `GET /root/historial` | El historial, de lo más nuevo a lo más viejo, de a 50 con cursor. Filtros: `actor`, `entidad`, `desde`, `hasta` | |
| `POST /auth/cambiar-password` `{ actual, nueva }` | Cambia la contraseña de la propia cuenta (dueño, gerente o ROOT); apaga `debeCambiarPassword` y cierra las demás sesiones | 400 si la nueva no cumple, 401 si la actual está mal |

Solo actúa sobre cuentas con rol `OWNER` (las rutas de dueños) o `ROOT` (las de `roots`); una cuenta GERENTE responde 404 en todas.

**Rutas viejas** (etapa 4): `POST` y `DELETE /marcas` y `/restaurantes` (solo ROOT) pasan a vivir en `/root/*` y se sacan; ROOT sale de `PATCH /marcas/:id`, `PATCH /restaurantes/:id`, `POST`, `PATCH` y `DELETE /admins` y del resto del Apéndice A; `GET /marcas` y `GET /restaurantes` dejan de devolver las columnas `mp_*`.

### 7.1 Cuentas ROOT: el script y el retiro de `root@menyu.com`

> **Desde la entrega 4.4 de auth** el script tiene solo `listar` y `promover <email>` (hace ROOT a un `Usuario` que ya existe y lo registra como `ROOT_PROMOVER`), con la misma forma de conectarse a la base. `crear`, `restablecer` y `eliminar` sobre `admin` ya no existen. Lo de abajo describe el script de la etapa 0.

> **Con la migración a Supabase (sección 13)** este script y el retiro de `root@menyu.com` son del login actual: `Admin` se retira en la Fase 5 de la spec de autenticación. El script pasa a "promover" un `Usuario` a ROOT, y mientras exista el login actual sigue siendo la forma de crear las cuentas personales.

**El script** (hecho): `apps/backend/scripts/cuentas-root.ts`. Lo corre una persona del equipo, una vez por entorno. Comandos: `listar` (solo lectura), `crear <email>`, `restablecer <email>` y `eliminar <email>`. Se corre desde `apps/backend`:

```
pnpm exec ts-node --transpile-only scripts/cuentas-root.ts crear ana@dominio.com
```

- **La contraseña se pide al correrlo, sin eco** (no aparece en pantalla, no queda en el historial de la terminal, no se escribe en ningún archivo y **nunca se imprime**). Pide un mínimo de 12 caracteres, rechaza las conocidas (`root1234`…) y las que contienen el usuario del email, y la pide dos veces. Se guarda solo el hash (bcrypt, 12 rondas).
- **A qué base se conecta:** usa `DATABASE_URL` de **esa terminal** (la misma URL que tiene el backend en Railway para ese entorno) o un archivo **fuera del repo** con `--archivo-env=<ruta>`. **No lee el `.env`**, a propósito, para no tocar una base sin querer. Antes de escribir nada muestra a qué base apunta (servidor, puerto, nombre y usuario; nunca la clave) y pide escribir el nombre de la base.
- **Reglas:** normaliza el email a minúsculas (el login lo busca así) y **se niega si el email ya lo usa un admin, un mozo o un cliente**. `restablecer` y `eliminar` solo tocan cuentas ROOT, y `restablecer` cierra las sesiones renovables de la cuenta. **`eliminar` nunca borra al último ROOT** y pide escribir el email.
- **Verificado** (47 verificaciones contra una base descartable, más la terminal real simulada con retroceso y sin eco, más un backend temporal): la cuenta creada inicia sesión con la contraseña elegida y el token dice `rol: ROOT`. Con la entrada cerrada a la mitad corta con error, no con éxito.
- **Las acciones del script quedan en el historial desde E1a (hecho):** si la base tiene la tabla (sección 7.2), el script también registra lo que hace, con el actor `SCRIPT` y el usuario del sistema operativo como operador, **en la misma transacción** que el cambio (si no se puede registrar, el cambio no se hace). Si la base todavía no la tiene (producción, hasta el tag que lleve la consola), **avisa y hace la acción igual, sin registrarla**: así se puede crear las cuentas personales y retirar `root@menyu.com` de producción antes del tag. Para eso el alta usa un `INSERT` explícito y no `prisma.admin.create`: el cliente de Prisma agrega a cada alta la columna `debe_cambiar_password`, que una base sin migrar no tiene. Verificado con 75 comprobaciones contra una base nueva y una vieja sin la migración (incluido que, con el historial roto a propósito, la cuenta no se crea, la contraseña no cambia y las sesiones no se cierran).

**Retirar `root@menyu.com`** (decisión 16, etapa 5). Hace falta, en cada entorno (staging y producción):

1. Crear las tres cuentas personales: la primera con el script, las otras dos con el script o desde la consola, si ya existe.
2. Entrar con cada una y comprobar que anda (y, con la consola, que ve las pantallas).
3. Correr `eliminar root@menyu.com` con el script (queda en el historial como acción del script).
4. Verificar: `listar` ya no la muestra y `root@menyu.com` / `root1234` da 401 al iniciar sesión.
5. El seed sigue creándola **solo en la base local** (desarrollo): nunca se corre contra staging ni producción. `Documentacion/datos-de-prueba-local.md` y el README del backend lo aclaran.

No hace falta esperar a la consola para esto: el script ya permite crear las cuentas personales y borrar la compartida, que puede existir con una contraseña pública. Cuándo hacerlo es decisión del equipo.

### 7.2 Historial de acciones de ROOT

**Qué se registra** (decisión 18): cada **cambio** que hace un ROOT a través de `/root/*` y cada acción del script. Los códigos de acción:

| Sobre | Acciones |
|---|---|
| Marca | `MARCA_CREAR`, `MARCA_EDITAR`, `MARCA_BAJA`, `MARCA_REACTIVAR` |
| Restaurante | `RESTAURANTE_CREAR`, `RESTAURANTE_EDITAR`, `RESTAURANTE_BAJA`, `RESTAURANTE_REACTIVAR` |
| Dueño (OWNER) | `DUENO_CREAR`, `DUENO_CAMBIAR_EMAIL`, `DUENO_RESTABLECER`, `DUENO_ELIMINAR`. Desde la 4.4 de auth: `DUENO_INVITAR` y `DUENO_QUITAR` (los anteriores ya no se escriben) |
| Cuenta ROOT | `ROOT_CREAR`, `ROOT_RESTABLECER`, `ROOT_ELIMINAR` (esta última solo la hace el script). Desde la 4.4 de auth: `ROOT_INVITAR` y, desde el script, `ROOT_PROMOVER` (los anteriores ya no se escriben) |
| *Opcional* | `ROOT_INICIO_SESION` |

**Qué guarda cada registro:** quién (el id y una **copia del email** en ese momento, para que el dato siga valiendo si la cuenta se retira; si fue el script, el operador), qué acción, sobre qué (tipo, id y una copia del nombre o email, y la marca de contexto) y cuándo (la hora la pone la base). El **detalle** es la lista de cambios, con el valor de antes y el de después. **Nunca guarda una contraseña ni un hash**: una contraseña restablecida figura como "no se registra". *(Desde la 4.4 de auth, un texto con forma de hash se tapa y uno de más de 500 caracteres se recorta, en lugar de rechazar la acción: así un nombre que eligió el dueño no traba una baja de ROOT.)*

**Cómo se garantiza que esté completo:** el registro se escribe **dentro de la misma transacción** que el cambio. No puede haber un cambio sin su registro ni un registro de un cambio que no ocurrió; si no se puede registrar, el cambio no se hace.

**Cómo se garantiza que no se pueda alterar:**

| Capa | Qué hace |
|---|---|
| App y API | Solo existen `registrar` y `listar`. No hay ruta `PUT`, `PATCH` ni `DELETE` bajo `/root/historial` (un test recorre el enrutador) y el servicio nunca llama a `update` ni `delete` sobre la tabla (un test lo comprueba). |
| Base de datos | Disparadores que **bloquean `UPDATE`, `DELETE` y `TRUNCATE`** sobre la tabla para cualquier sesión, incluida la de la app. No hay clave foránea hacia las cuentas, así que borrar o retirar una cuenta no toca el historial. |
| Límite que hay que conocer | Quien tenga el rol dueño de la base (en Supabase, `postgres`) puede, en teoría, quitar el disparador: eso no lo impide ningún código de la app. Una medida opcional, fuera de este plan, es encadenar los registros con hashes (cada uno guarda el hash del anterior) para que cualquier alteración quede a la vista (+0,5 a 1 día). |

**Pantalla:** la ven todos los ROOT (`GET /root/historial` con `@Roles('ROOT')`; desde la 4.4 de auth, `@RequiereRoot()`): agrupada por día, con filtros por quién, sobre qué y fechas, el detalle desplegable y "Cargar más". Mockups en `docs/mockups/consola-root/`.

**Migración (E1a, hecha):** `20261020150000_consola_root_historial`, una sola, con la tabla del historial, sus disparadores, un disparador que **impide borrar al último ROOT** (sobre `admin`, solo para filas con `rol = 'ROOT'`) y la columna `admin.debe_cambiar_password boolean not null default false` (sin efecto en las cuentas existentes). Los tests y limpiezas que borran cuentas de admin tienen que usar `session_replication_role = replica`, como ya hacen las verificaciones contra la base local.

Cómo quedó, en concreto (probado contra un PostgreSQL de verdad, `historial-root.base.spec.ts`):

- **`historial_root`** no tiene claves foráneas (guarda copias del email y los nombres). La clave es un entero autoincremental, que además ordena el historial y sirve de cursor para `GET /root/historial` (E1b). `actor_tipo` es `ROOT` o `SCRIPT` (un `ROOT` siempre trae el id de su cuenta) y `entidad_tipo` es `MARCA`, `RESTAURANTE`, `OWNER` o `ROOT`, los dos con un `CHECK`. El detalle es un `jsonb` con la lista `{ campo, antes, despues }`.
- **La hora la pone la base de verdad:** Prisma manda la hora de su servidor en el `INSERT`, así que un disparador `BEFORE INSERT` la pisa con `now()`.
- **`UPDATE`, `DELETE` y `TRUNCATE` fallan** con un disparador que siempre lanza una excepción, y los tres disparadores son **`ENABLE ALWAYS`**: valen también con `session_replication_role = replica`, el atajo de las limpiezas de pruebas. **Consecuencia:** una prueba manual en la base local deja filas que no se pueden limpiar con un `DELETE`; se usa una base descartable o `docker compose down -v` (el README del backend lo explica).
- **La última cuenta ROOT** no se puede borrar **ni dejar de ser ROOT** (un `UPDATE` del rol también está cubierto). El disparador bloquea las otras cuentas ROOT con `FOR UPDATE` mientras decide, así dos bajas simultáneas de las dos últimas no dejan la base sin ROOT. Este sí se puede saltear con `session_replication_role = replica`, a propósito (las limpiezas de pruebas).
- **Hay que aplicarla a la base local y regenerar el cliente** al traer la rama: el cliente nuevo pide `debe_cambiar_password` en cada consulta a `admin`, así que con la base sin migrar el login da 500. En staging y producción la aplica sola el arranque del backend.

**Decisiones de implementación de E1a** (no estaban en el plan; marcadas para que las revises):

- **Entidad `OWNER`:** `entidad_tipo` usa `OWNER` y no `DUENO`, como el filtro "Sobre qué" de los mockups; las acciones siguen llamándose `DUENO_*`. Se dejó afuera `ROOT_INICIO_SESION` (la parte opcional de la decisión 18).
- **Toda contraseña puesta por ROOT es temporal**, también la que ROOT elige al crear la cuenta (`debeCambiarPassword = true`). Si ROOT la elige, no se devuelve (`passwordTemporal: null`) y el historial dice "elegida por quien la creó (no se registra)". Se acepta de 12 a 72 bytes (bcrypt corta lo que pasa de 72), y se rechazan las conocidas y las que llevan la parte del email antes de la arroba: la misma política que el script.
- **Quién actúa se lee de la base, dentro de la transacción:** un token de ROOT puede vivir hasta 8 horas después de que la cuenta se retiró. Las rutas que cambian algo responden 401 y no hacen nada si la cuenta del token ya no existe o ya no es ROOT; el email que queda en el historial es el de la base, no el del token.
- **Email repetido:** se compara sin distinguir mayúsculas contra `admin`, `mozo` y `cliente`, y el mensaje no dice cuál lo usa (ROOT no tiene por qué saber qué mozos o clientes hay). Cambiar el email de un dueño por el mismo no hace nada y no deja registro.
- **Eliminar un dueño:** corre en una transacción serializable (dos bajas simultáneas de los dos últimos dueños no pasan las dos). Se permite eliminar al último dueño de una marca **dada de baja**. Las ediciones de pedidos que hizo no se borran (la clave foránea las deja sin autor).
- **Se cerró una puerta vieja:** `DELETE /admins/:id` (ROOT u OWNER) podía borrar **cualquier** cuenta, incluida una ROOT, sin dejar rastro en el historial. Ahora responde 403 si el objetivo es una cuenta ROOT. Sigue pudiendo borrar las demás hasta la etapa 4. `PATCH /admins/:id` (que le permite a ROOT cambiar el email o la contraseña de cualquier cuenta, también ROOT, **sin historial**) **no se tocó**: es parte del Apéndice A y se saca en la etapa 4. Hasta entonces esa ruta es un hueco de la regla "todo lo que hace un ROOT queda registrado".
- **Las respuestas** nombran la contraseña generada `passwordTemporal` (`null` si la eligió ROOT) y la marca de un dueño va como `{ id, nombre, activo }`. `GET /root/historial` no está: llega en la etapa 1b (en esta etapa el servicio solo tiene `registrar`).

**Decisiones de implementación de E1b** (hecha el 2026-10-20; tampoco estaban en el plan, para que las revises):

- **Un cuerpo con un campo que ROOT no puede tocar responde 400**, no se ignora. El plan lo pedía para `PATCH /root/restaurantes/:id`; se aplicó a los cuatro cuerpos de marcas y restaurantes (`POST` y `PATCH` de marcas, `POST …/restaurantes`, `PATCH` de restaurantes). El `ValidationPipe` global es `whitelist: true` y descarta lo que sobra sin avisar, así que se resolvió con un guard (`CamposPermitidosGuard`, que corre antes que los pipes) y un decorador `@CamposPermitidos([...], motivo)` por ruta. Los cuerpos de dueños y cuentas ROOT (1a) siguen ignorando lo que sobra, como ya estaba probado.
- **Las marcas y restaurantes no se borran, y no hay ruta para hacerlo** (decisión 5): un test recorre el enrutador y falla si aparece un `DELETE` o `PUT` en `/root/marcas` o `/root/restaurantes`. La baja es `activo = false`.
- **La baja, por ahora, solo saca la marca o el restaurante de Discovery** (lo único que ya mira `marca.activo` y `restaurante.activo`). No toca los restaurantes, las cuentas, las sesiones ni el menú; reactivar es solo volver a poner `activo = true`. Un test lo comprueba (la baja de una marca no llama a nada más). El corte efectivo es la etapa 3.
- **Idempotencia y "sin cambios":** `baja` y `reactivar` sobre algo que ya está en ese estado responden 200 sin escribir ni registrar; un `PATCH` que manda lo mismo que ya hay tampoco registra, y si cambia una sola de dos cosas el registro lleva solo esa.
- **Se puede editar el nombre y el identificador de una marca dada de baja** (el plan lo pedía: para liberar un `slug`), reactivar un restaurante de una marca dada de baja (cada uno conserva su estado) y crear un dueño o un restaurante en una marca de baja **no** (409).
- **Reglas de los datos:** nombre de hasta 120 caracteres (recortado); `slug` en minúsculas, números y guiones sueltos, de hasta 80 (se pasa a minúsculas solo); dirección de hasta 200 y obligatoria al crear un restaurante, como hoy. Los textos con el carácter nulo se rechazan (PostgreSQL daba 500). Las marcas que ya existen con otro formato de `slug` no se tocan; la regla vale al crear o cambiarlo.
- **`GET /root/marcas`:** sin `bajas` solo las activas; con `bajas=true`, todas. Cuenta los dueños como las cuentas `OWNER` (los gerentes no). Las respuestas de crear, editar, baja y reactivar son el detalle de la marca, para que la pantalla se refresque con una sola llamada.
- **`GET /root/historial`:** de a 50, de lo más nuevo a lo más viejo, con cursor por `id` (una acción nueva nunca corre las páginas), filtros `actor` (email de una cuenta ROOT, o `script`), `entidad`, `desde` y `hasta`. **Las fechas son días completos en hora de Buenos Aires (UTC-3)**, los dos extremos incluidos, como ya hacen los reportes; una fecha que no existe o un `desde` posterior a `hasta` dan 400. La lista de personas para el filtro "Quién" sale de `GET /root/roots` más "script": no hace falta una ruta más. No devuelve el id de la cuenta que actuó.
- **Un hallazgo del recorrido contra la base real:** `equals` con `mode: 'insensitive'` de Prisma se ejecuta como `ILIKE` y trata `_` y `%` como comodines. Se escapan en el filtro de `actor` igual que ya se hacía con los emails.

## 8. Pantallas

Mockups en `docs/mockups/consola-root/` (abrir `index.html`; 66 pantallas y estados, en celular, tablet y escritorio).

- **Rutas:** `/root` (redirige a Marcas), `/root/marcas`, `/root/marcas/:id` (detalle de una marca), `/root/duenos`, `/root/roots` (cuentas ROOT) y `/root/historial`, más la pantalla de primer ingreso. Cada ruta con `RoleGuard roles={['ROOT']}`; el login manda a ROOT a `/root`. *(En E2a: un solo `RoleGuard` sobre `/root/*`, y `AdminRedirect` manda a ROOT a `/root`.)*
- **Shell:** el mismo menú lateral y barra superior de web-admin, con dos grupos: **Administración** (Marcas, Dueños) y **Sistema** (Cuentas ROOT, Historial). En vez del selector de marca y restaurante (ROOT no opera ninguno) dice "Administración". Para no copiar las ~700 líneas de `AdminLayout`, se extrae un `Shell` que reciben `AdminLayout` y `RootLayout`; los tests de `AdminLayout` cubren esa extracción.
- **Marcas:** lista con búsqueda, interruptor "Mostrar dadas de baja" y "Nueva marca". Cada fila muestra restaurantes, dueños y estado, y avisa "Sin dueño".
- **Detalle de una marca (donde ROOT trabaja):** datos con Editar y Dar de baja; dueños con su menú (restablecer contraseña, cambiar email, eliminar); restaurantes con su dirección de solo lectura y su menú (editar nombre, dar de baja o reactivar). Cierra con el recordatorio de lo que ROOT no ve. **En E2a** los dueños se mostraban de solo lectura. **Desde E2b** (8.2) la sección tiene **Invitar dueño** (nombre y email) y, en el menú ⋮ de cada dueño, **Quitar acceso**: restablecer la contraseña y cambiar el email ya no existen (sección 13).
- **Dueños:** lista global con búsqueda por nombre, email o marca, "Invitar dueño" y, por dueño, "Quitar acceso". **Hecha en E2b** (8.2).
- **Cuentas ROOT:** una por integrante, con "Vos" y "Cuenta desactivada" e "Invitar cuenta ROOT". **Sin acciones por cuenta:** no hay "Eliminar" (un aviso lo explica) ni restablecer la contraseña, que cada persona recupera desde web-auth. **Hecha en E2b** (8.2). *(El diseño del 2026-10-15 tenía "Contraseña temporal" y el menú para restablecer la contraseña: con Supabase ya no, sección 13.)*
- **Historial:** agrupado por día; cada fila dice qué hizo quién y sobre qué, y se despliega para ver antes y después. Filtros, "Cargar más", estados vacío, sin resultados, error y cargando. Dice que no se puede editar ni borrar.
- **Primer ingreso (E3):** pantalla sola, sin menú lateral, "Elegí tu contraseña", para quien entra con una contraseña temporal. 12 caracteres como mínimo y distinta de la temporal. **Ya no se hace:** las invitaciones y la recuperación las atiende web-auth (sección 13).
- **Diálogos:** ventana al centro en escritorio y hoja desde abajo en celular. Dar de baja una marca pide escribir su nombre. La contraseña generada se muestra una sola vez, con botón para copiar *(con Supabase no hay contraseña generada: se reemplaza por "Invitación enviada a …")*. **Todos los que cambian algo avisan "Esta acción queda registrada en el historial".**
- **Estados:** cargando (esqueletos), vacío, error con "Reintentar", sin conexión y nombres larguísimos.
- **Responsive:** botones y áreas táctiles de 44 px o más, campos de 16 px, sin scroll horizontal, `100dvh`. Es la regla de la sección 2.3 del plan de Discovery.
- **Tipos:** `@menyu/types` suma los tipos de la consola (en `root.types.ts`: `RootMarcaResumen`, `RootMarcaDetalle`, `RootRestaurante`, `RootHistorialItem`, `RootCuentaResumen` y sus pedidos y respuestas; los de dueños y cuentas ROOT por invitación, `RootDueno`, `RootInvitarCuentaRequest` y `RootCuentaInvitada`, llegaron con la 4.4 de auth y los usa E2b). La API del cliente va en `api.root.*` de `apps/web-admin/src/services/api.ts`.

### 8.1 E2a: cómo quedó (hecha el 2026-10-21)

**Dónde está:** `apps/web-admin/src/components/shell/Shell.tsx` (extraído de `AdminLayout`, que ahora lo usa; su spec no cambió) y `apps/web-admin/src/pages/root/` (`RootRoutes`, `RootLayout`, `marcas/`, `historial/`, `dialogos/`, `ui/`, `copy.ts`, `useCarga.ts`, `useRootSession.ts`, `root.css`). Rutas: `/root` → `/root/marcas`, `/root/marcas/:id`, `/root/historial`.

**Decisiones de implementación (a revisar):**

1. **Código aparte.** `/root/*` se carga con `React.lazy` y solo entra un ROOT: el chunk de la consola pesa 37 kB (más 14 kB de CSS) y no está en el bundle principal (verificado con `vite build`). El CSS de la consola está acotado a la clase `.rc` para no pisar Tailwind ni el resto de web-admin; los diálogos se dibujan en `document.body` dentro de un `.rc` propio.
2. **Los textos de la baja dicen la verdad.** Al terminar E2a la baja solo sacaba a la marca o al restaurante de Discovery; desde el 2026-10-21 también corta la carta y las mesas nuevas (sección 6), y los diálogos lo dicen. Faltaba el inicio de sesión del personal: desde la entrega 4.4 de `feat/auth`, `BAJA_CORTA_EL_LOGIN` (en `copy.ts`) está en `true` y salen los textos del diseño aprobado (un test cuida que existan los dos juegos). Desde la entrega 4.5, la viñeta de las mesas abiertas también dice la verdad: "solo pueden pagar con Mercado Pago desde el celular: el personal tampoco puede cobrarlas ni cerrarlas mientras esté de baja" (sección 6).
3. **Dueños de solo lectura**, con un aviso de que crear, cambiar o eliminar llega con la migración de autenticación. Nada usa `debeCambiarPassword`. La sesión y el rol salen de un solo hook (`useRootSession`).
4. **Historial:** los días y las horas son de Buenos Aires (UTC-3, sin importar la zona de la computadora); el filtro "Quién" sale de `GET /root/roots` (si falla, queda "Todos" y "Script"); un código de acción que la pantalla no conoce se muestra tal cual; "Hasta" anterior a "Desde" se avisa en pantalla sin llamar a la API; el cartel "Llegaste al principio del historial" aparece solo si se cargó más de una página.
5. **Diálogos:** tocar el fondo no los cierra (no se pierde lo escrito); Escape no cierra mientras guarda; el 409 de un identificador repetido va debajo del campo y no como error general; si no cambió nada, "Guardar" cierra sin llamar a la API ni dejar registro; la baja de una marca pide escribir su nombre (sin importar mayúsculas, sí los acentos).
6. **`AdminRedirect` manda a ROOT a `/root`.** Las rutas `/admin/*` todavía aceptan a ROOT: eso se corrige en E4 (Fase 4 de `feat/auth`).

**Verificación:** typecheck de los 9 paquetes y `eslint --max-warnings 0`; 677 tests de web-admin (unos 190 nuevos: textos, fechas, carga con respuestas tardías, piezas y diálogos, páginas, rutas y armado de las URLs de `api.root`); 26 mutaciones de la lógica clave, todas detectadas (las que sobrevivieron al principio mostraron tests débiles y se reforzaron); y 99 comprobaciones en un navegador real (Edge) contra un backend y una base descartables: acceso por rol, alta, edición, baja y reactivación de marcas y restaurantes con lo que queda en la base y en Discovery, historial con más de 50 acciones y filtros, celular, tablet y escritorio sin scroll horizontal y con objetivos de 44 px o más, y el historial que ni la API ni la base dejan cambiar. **Hallazgo:** un código de acción llamado `constructor` mostraba una función en vez de texto (la tabla de textos heredaba de `Object`); corregido y con test.

**Lo que quedó para E2b** (hecha el 2026-10-22, 8.2): las acciones de dueños, la pantalla de Dueños y la de Cuentas ROOT. Los diálogos de contraseña ya no existen (sección 13).

### 8.2 E2b: cómo quedó (hecha el 2026-10-22)

**Dónde está:** `pages/root/duenos/DuenosPage.tsx`, `pages/root/roots/CuentasRootPage.tsx`, los diálogos `dialogos/invitar-dueno.tsx`, `quitar-dueno.tsx` (con el del último dueño), `invitar-root.tsx` e `invitacion-enviada.tsx`, `ui/FilaDeDueno.tsx` y las acciones de dueños en `marcas/MarcaDetallePage.tsx`; en `services/api.ts`, `api.root.duenos` (`listar`, `invitar`, `quitar`) y `api.root.cuentas.invitar`. No toca lo que cambia la Fase 4 (`apps/backend/src/root/`, `apps/backend/src/auth/`, `useRootSession`, `BAJA_CORTA_EL_LOGIN`). Está hecha **sobre la rama `feat/auth-fase-4`** (entregas 4.4 y 4.5): **no se mergea a `main` antes del PR de la Fase 4**, porque en `main` los endpoints de dueños todavía tienen el contrato viejo.

**El contrato que usa** (4.4, `docs/auth/specs/auth.md`):

| Ruta | Qué hace |
|---|---|
| `GET /root/duenos` | Las membresías OWNER: `RootDueno[]` = `{ membresiaId, usuarioId, email, nombre, activo, marca }`. No dice si la invitación está pendiente |
| `POST /root/marcas/:id/duenos` `{ email, nombre }` | Invita por mail. 201 `{ usuarioId, membresiaId, invitacionEnviada }` (`false`: ya tenía cuenta, no se mandó mail). 403 con el email propio, 404 si la marca no existe, 409 si ya es dueño de esa marca, si la marca está de baja o si su cuenta está desactivada, 502 si Supabase rechaza |
| `DELETE /root/duenos/:membresiaId` | Quita la membresía (204); la cuenta queda. 409 si es el único dueño de una marca activa |
| `GET /root/roots` | Las cuentas ROOT: `{ id, email, nombre, activo, esPropia }` |
| `POST /root/roots` `{ email, nombre }` | Invita a una cuenta ROOT nueva: 201 `{ usuarioId, email, invitacionEnviada }`. 409 si el email ya es de una cuenta de MenYU (hacerla ROOT es del script `promover`) |

**Decisiones de implementación (a revisar):**

1. **La lista de dueños se pide entera y se busca en pantalla** (nombre, email o marca, sin importar mayúsculas ni acentos). `GET /root/duenos?q=` distingue los acentos ("lucia" no encontraría a "Lucía"): sigue disponible en la API, la pantalla no lo usa.
2. **No hay "invitación pendiente".** Los mockups de la primera versión lo tenían; la API no lo informa. Lo que sí informa es `activo`: una cuenta desactivada lleva el aviso "Cuenta desactivada". Los mockups se corrigieron.
3. **El único dueño de una marca activa no se quita.** La pantalla lo sabe de antes (cuenta sobre la lista entera, no sobre la filtrada) y muestra "No se puede quitar todavía" con "Invitar a otro dueño", sin llamar a la API. Si aun así la API responde 409 (otro ROOT quitó al otro dueño un instante antes), el diálogo muestra el texto del servidor. En una marca de baja sí se quita al único dueño.
4. **Dónde va cada error.** Los dos que tienen un campo propio van debajo del email: 409 "ya tiene un rol ahí" → "Esa persona ya es dueña de esta marca."; 403 "vos mismo" → "Ese es tu propio email"; y, al invitar una cuenta ROOT, cualquier 409 → "ya tiene una cuenta de MenYU… el equipo usa el script". **La API no manda un código sino un texto**, y la pantalla reconoce esos dos por el texto: si cambia, el aviso sale arriba con el texto del servidor y nada se rompe. Los otros 409 (marca de baja, cuenta desactivada) salen arriba con su texto; un 502 dice "Probá de nuevo en un momento", sin el texto técnico de Supabase.
5. **"Ya tenía una cuenta"** cuando `invitacionEnviada` es `false`: no se mandó ningún mail. **El texto no promete que "ya puede entrar"**: con un dueño quiere decir que su `Usuario` ya existe (es dueño de otra marca, es personal de un restaurante o es alguien al que se le había quitado el acceso), y la API solo le suma la marca aunque nunca haya aceptado la primera invitación; por eso el diálogo dice cómo pedir un enlace desde «Olvidé mi contraseña». Con una cuenta ROOT, `false` es una cuenta de acceso ya confirmada (por ejemplo, la de Google) y el texto habla de la consola. **Reenviar una invitación todavía no existe** (queda para la Fase 4).
6. **Cuentas ROOT sin acciones por cuenta:** ni eliminar ni restablecer la contraseña (decisión 15 y sección 13). Un test cuida que `api.root.cuentas` solo tenga `listar` e `invitar`, y `api.root.duenos`, `listar`, `invitar` y `quitar`.
7. **Un arreglo de E2a:** con un error 5xx el aviso de un diálogo repetía "No pudimos completar la acción." (el título en negrita y el texto genérico). Ahora hay un solo `AvisoDeError` compartido que no lo repite, con su test.

**Verificación:** typecheck y `eslint --max-warnings 0` de web-admin; 853 tests de web-admin (unos 127 son de E2b: validaciones, diálogos, filas, páginas, rutas y menú, y el armado de las URLs de `api.root`); 33 mutaciones de la lógica clave, todas detectadas (tres sobrevivieron al principio, porque la búsqueda no aislaba el nombre ni la marca y el seguro del doble envío no tenía test, y se reforzaron); y 19 pasos en un navegador real (Edge) contra el **backend real de la 4.4** con una base descartable y un Supabase falso (no se manda ningún mail): invitar a un dueño desde la lista y desde una marca (con el email en minúsculas y lo que queda en la base y en el historial), los errores en su campo (ya es dueña, el propio email, ya tiene cuenta de MenYU), "Ya tenía una cuenta" sin mail, quitar el acceso sin borrar la cuenta, el último dueño de una marca activa (en pantalla y por el 409 de una carrera) y el de una marca de baja, un 502 de Supabase sin texto técnico y sin dejar nada a medias en la base, las cuentas ROOT con "Vos" y sin acciones, el historial con los códigos nuevos y celular (360 px) sin scroll horizontal. **Hallazgos:** (1) el aviso repetía el título con un error 5xx (E2a), corregido; (2) volver a invitar a alguien cuyo `Usuario` ya existe no manda mail y el diálogo prometía "ya puede entrar": corregido (decisión 5). El código de la consola pasó de 37 a 51 kB (más 14 kB de CSS).

## 9. Etapas, estimación y orden

Orden de magnitud, una persona en días de trabajo enfocado (no son las horas del plan; el equipo trabaja medio tiempo). Todo lo de ROOT va en **una sola rama general, `feat/pantalla-root`** (decisión del equipo, 2026-10-20; el plan decía una rama y un PR por etapa): los commits se separan por etapa y cada una incluye sus tests y la verificación contra el backend real.

| Etapa | Qué entrega | Estimación |
|---|---|---|
| **E0** Script de cuentas ROOT | `cuentas-root.ts` (sección 7.1). **Hecho.** | 0,5 día (hecho) |
| **E1a** Backend: historial, cuentas ROOT y dueños | La migración (historial, disparadores, `debe_cambiar_password`), el servicio de historial, `POST /root/marcas/:id/duenos` y el resto de dueños, las rutas de cuentas ROOT, y que el script también registre. **Es lo que destraba el QA sin puente:** con el token de ROOT, desde el Swagger de staging, se crea un OWNER. **Hecha** (2026-10-20): detalle en 7.2. | 2,5 a 3,5 días (hecha) |
| **E1b** Backend: marcas, restaurantes y lectura del historial | El resto de `/root/*` (marcas, restaurantes, baja y reactivar, todavía sin efecto fuera de Discovery) y `GET /root/historial` con filtros y cursor. **Hecha** (2026-10-20): decisiones de implementación en 7.2. | 1,5 a 2 días (hecha) |
| **E2** Consola (web-admin) | `Shell` compartido, rutas `/root/*` con `React.lazy`, las pantallas (marcas, detalle, dueños, **cuentas ROOT**, **historial**), los diálogos y estados, tipos y `api.root`, tests, verificación con Playwright contra el backend real. **Se parte en dos (13.4):** E2a (shell, marcas, restaurantes, bajas e historial) se hizo primero; E2b (dueños y cuentas ROOT) esperó a `feat/auth`. **E2a hecha** (2026-10-21): cómo quedó, en 8.1. **E2b hecha** (2026-10-22), sobre la 4.4 de auth: en 8.2. | 4,5 a 6 días (E2a: 3,5 a 4,5; E2b: 1 a 1,5) |
| **E3** Baja efectiva y contraseñas | Sección 6 (menú público, apertura de mesas, login, pruebas de que reactivar devuelve todo). **Hecha:** lo público el 2026-10-21 y el corte del acceso en la entrega 4.2 de auth (`AccesoService` no cuenta las membresías de una marca o un restaurante de baja). La mitad de contraseñas (cambiar contraseña, primer ingreso, refresh tokens propios) **se descartó**: con Supabase es de web-auth. | 2 a 2,5 días (hecha) |
| **E4** Sacarle a ROOT lo viejo | El Apéndice A del plan de Discovery: ~35 `@Roles(…ROOT…)` en 11 controllers, ~15 `rol === 'ROOT'`, un servicio de acceso central, `isOwner` y `canEdit` en ~6 pantallas, `SelectorPage` de web-staff, los specs invertidos y un "ROOT → 403" por cada ruta cerrada. **Hecha dentro de la Fase 4 de `feat/auth`** (entregas 4.3, 4.5 y 4.6): ROOT recibe 403 en todas las rutas de datos y no aparece en las pantallas. | 3 a 4 días (hecha) |
| **E5** Retirar `root@menyu.com` | Sección 7.1: crear las cuentas personales, probarlas, eliminar la compartida con el script y verificar, en staging y en producción. **Con Supabase** la cuenta compartida ya no abre la consola (Fase 4) y desaparece con la tabla `Admin` (Fase 5). | 0,25 a 0,5 día |
| **Subtotal E1 a E3** (consola usable y segura) | | **10,5 a 14 días** |
| **Total con E4 y E5** | | **14 a 18,5 días** |

**Lo que agregó lo nuevo del 2026-10-15** (cuentas ROOT, historial y primer ingreso mockeado): **3,5 a 4,5 días** sobre la estimación aprobada (7 a 9,5 hasta E3): el historial, 2,5 a 3 (migración con disparadores, servicio dentro de la transacción, tests de que no se puede alterar, lectura con filtros, pantalla y estados), y las cuentas ROOT, 1 a 1,5 (rutas, disparador del último ROOT, pantalla y diálogos). La estimación original de 11.2 era 6 a 8 días y no incluía editar, reactivar, la baja efectiva ni las contraseñas.

**Se puede recortar:** sin las decisiones 6 y 8, E3 desaparece (con Supabase, la parte de contraseñas desaparece igual: sección 13). Sin la pantalla de Dueños (opcional), E2 baja 0,5 día. Sin el historial no: es un pedido del equipo.

**Orden:** E0 (hecho) → E1a → E1b → E2a → *(esperó a `feat/auth`)* → E2b, dueños y cuentas ROOT sobre invitaciones (hecha, 8.2) y baja efectiva → E4 dentro de la Fase 4 → E5. El historial va en E1a porque **cada acción de ROOT tiene que quedar registrada desde la primera**. La consola (E2) puede salir a staging sin E3 y sin E4.

**El puente para el QA, hasta que exista E1a:** un script fuera del repo (`puente-qa-staging.mjs`, en la carpeta del usuario) **no se conecta a ninguna base**: imprime el SQL, que se revisa y se pega en el editor SQL de Supabase de staging. Crea un OWNER de la marca que se elija (con la contraseña pedida sin eco y solo su hash en el SQL), da de baja una marca (BurgerLab, `m-001`) o la reactiva, y trae consultas de solo lectura (cuentas, marcas con su cantidad de dueños e ids que no son UUID). Es temporal: se descarta cuando exista la consola.

## 10. Tests y verificación

- **Backend:** un spec por servicio (`root-marcas`, `root-restaurantes`, `root-duenos`, `root-roots`, `historial-root`) y uno de endpoints con la matriz de permisos: ROOT 200, OWNER, GERENTE, mozo y sin token 403 o 401, en **cada** ruta de `/root/*`.
- **"No devuelve nada privado":** un test por respuesta que compara las claves devueltas contra una lista exacta. Si alguien le agrega un `include` o un campo (`mp_*`, mozos, mesas, menú), el test falla.
- **Reglas:** email repetido (sin importar mayúsculas, y también si lo usa un mozo o un cliente), identificador repetido, último dueño, marca de baja, id que no es UUID (`m-001`), el campo de más en `PATCH /root/restaurantes/:id` (400), solo cuentas del rol que corresponde, la contraseña generada aparece una sola vez, el ROOT no restablece su propia contraseña por la ruta de otros.
- **Cuentas ROOT:** no existe ninguna ruta para borrarlas (un test recorre el enrutador); el disparador de la base impide borrar al último ROOT aunque se intente por SQL; el script nunca lo borra.
- **Historial:** cada ruta que cambia algo deja **exactamente un** registro con el actor, la acción y el objeto correctos; **si registrar falla, el cambio se revierte** (se fuerza el fallo en el test); ningún detalle contiene una contraseña ni un hash (se serializa todo y se busca); `UPDATE`, `DELETE` y `TRUNCATE` sobre la tabla **fallan contra la base real** (test con la base local); no hay ruta `PUT`, `PATCH` ni `DELETE` bajo `/root/historial`; el servicio nunca llama a `update` ni `delete` sobre la tabla; OWNER y GERENTE no pueden leerlo; los filtros y el cursor devuelven lo que corresponde; borrar una cuenta no toca sus registros.
- **Baja efectiva (E3):** con la marca de baja, `GET /menu/:id` y `POST /sessions/open` rechazan, el login de OWNER, GERENTE, mozo y cocina rechaza, la sesión ya abierta puede cobrarse y cerrarse, y reactivar lo devuelve todo.
- **Cambio de contraseña (E3):** con una contraseña temporal el backend rechaza todo salvo cambiarla; la nueva respeta el mínimo y no es igual a la anterior; cierra las demás sesiones.
- **Mutaciones:** como en las fases anteriores, se rompe a propósito cada regla (en especial las del historial y las de ROOT) para ver que algún test la detecta.
- **web-admin:** los tests de cada pantalla y diálogo, `RoleGuard` (OWNER y GERENTE a `/root` rebotan), estados, el `Shell` extraído (los tests de `AdminLayout` siguen en verde), que en cuentas ROOT no haya "Eliminar" y que los diálogos avisen del historial.
- **Contra el backend real y Playwright:** crear marca, restaurante y dueño; entrar como ese dueño y ver su panel; dar de baja y comprobar que se corta; reactivar; crear una cuenta ROOT, entrar con ella y verla en el historial. Con foto de la base y limpieza al final, como en las fases anteriores.
- **QA en staging y celulares:** el checklist de responsive de la sección 2.3 del plan de Discovery, más: la hoja del diálogo con el teclado abierto, copiar la contraseña desde el celular, el cajón del menú lateral y el historial con muchas filas.

## 11. Riesgos y notas

- **ROOT puede, por diseño, crear un dueño o restablecer la contraseña de uno y entrar como él.** La regla "ROOT no ve datos privados" se cumple por permisos e interfaz, no es una barrera técnica. Lo que la protege es que (a) la contraseña es temporal y cambia en el primer ingreso (decisión 8), (b) restablecerla cierra las sesiones, así que la persona lo nota, y (c) **ahora todo queda en el historial, que ningún ROOT puede borrar**: una entrada indebida deja rastro de quién restableció qué y cuándo. Es la protección que antes faltaba. **Con Supabase (sección 13)** ROOT no conoce ninguna contraseña ni puede cambiar el email de un dueño: invita por mail. Pero puede invitar como dueño de una marca a otra casilla suya (`ana+x@…`), o invitarse primero como otra cuenta ROOT y después sumarla como dueño, y entrar así a los datos de la marca: no hay barrera técnica posible, y la protección sigue siendo el historial (`ROOT_INVITAR` y `DUENO_INVITAR` quedan registrados).
- **El historial no es invulnerable.** Quien tenga el rol dueño de la base puede quitar el disparador (sección 7.2). Se acepta para este plan; la cadena de hashes es la mejora si hiciera falta.
- **Tres ROOT con los mismos poderes:** cualquiera puede restablecer la contraseña de otro ROOT (decisión 19). Queda registrado con su nombre, pero no hay un segundo control. Para un equipo de tres es razonable. *(Con Supabase: cualquiera puede mandar el mail de recuperación de otro ROOT.)*
- ~~**La cuenta ROOT de producción.**~~ **Cerrado por la Fase 5 de auth (2026-10-26).** `root@menyu.com` podía existir en staging y producción con `root1234`, una contraseña que está en la documentación de un repo público. Desde la Fase 4 esa cuenta ya no abría la consola (el acceso lo da `usuario.es_root`), y la Fase 5 borró la tabla `admin` entera: la contraseña no sirve para nada porque no hay dónde verificarla.
- **Las acciones del script quedan en el historial solo en las bases que ya tienen la migración de E1a.** La cuenta ROOT que se creó en staging antes de E1a no dejó rastro. En producción, hasta el tag que lleve la migración, el script avisa y no registra.
- **Cambio de comportamiento público (E3):** una marca o restaurante dado de baja deja de abrir mesas y de mostrar su carta. Hoy "borrar" no hacía eso: si alguien depende de eso, se entera acá.
- **Sesiones ya iniciadas:** los tokens de acceso (8 h) de gente de una marca dada de baja, o de una cuenta cuya contraseña se restableció, siguen valiendo hasta que vencen; lo que se revoca al instante son los refresh tokens. Revocar todo al instante exigiría consultar la base en cada pedido; no se propone. *Con Supabase (sección 13)* el access token dura 1 hora y cada pedido consulta las membresías en la base, así que la baja y la quita de una membresía valen de inmediato para la API.
- **Migración (E1a, ya escrita y probada):** `20261020150000_consola_root_historial`, una sola, con la tabla del historial, los disparadores y la columna de contraseña temporal. En `main` ya están desplegadas v1.0.6 y v1.0.7 (producción con las 32 migraciones anteriores, incluida la de autenticación); la de la consola es la única pendiente y sale con el primer tag que lleve esta rama, **ensayada antes con una copia de producción**. El disparador del último ROOT hace que `delete from admin` falle mientras quede un ROOT: las limpiezas de tests usan `session_replication_role = replica`. El historial, en cambio, **no se puede limpiar ni con ese atajo**. Cuando se retire `Admin` (Fase 5 de la spec de autenticación), ese disparador se rehace sobre `usuario.es_root`; `historial_root` no se toca.
- **La consola necesita un web-admin de staging con URL fija.** Existe `menyu-admin-staging` (creado el 2026-10-19; ver 11.4 del plan de Discovery). Con la spec de autenticación, los dominios propios (`admin.staging.menyu-app.com`) son los que van a compartir sesión; los de `vercel.app` siguen con el login actual hasta la Fase 4.
- **Cuenta sin dueño:** hoy puede haber marcas sin OWNER (BurgerLab). La consola las marca con "Sin dueño".
- **Hasta E4** ROOT sigue entrando a las pantallas viejas de web-admin escribiendo la URL. La consola no cierra eso: lo cierra E4.
- **Compatibilidad:** los scripts de prueba que usan a `root@menyu.com` (`Documentacion/datos-de-prueba-local.md`) siguen sirviendo en local; en staging y producción esa cuenta se retira (E5).
- **Deuda hermana** (Apéndice B del plan de Discovery): endpoints que no validan pertenencia entre marcas. Se revisan en E4 con el mismo servicio de acceso.

## 12. Fuera de alcance

- Encadenar los registros del historial con hashes, o guardar una copia externa (mejora opcional, +0,5 a 1 día).
- Registrar las lecturas de ROOT (solo se registran los cambios).
- Recuperación de contraseña por mail (no hay servicio de mail): lo cubre "Restablecer".
- Mover un restaurante a otra marca.
- Borrado físico de marcas y restaurantes.
- Borrar cuentas ROOT desde la app (decisión 15).
- Que un dueño cambie su propio email o administre más de una marca.

## 13. Autenticación con Supabase (`feat/auth`): qué cambia para la consola

*Agregado el 2026-10-20, después de leer [`docs/auth/specs/auth.md`](auth/specs/auth.md) con las Fases 1 y 2 ya en `main` (producción en v1.0.7).* Hasta acá este plan suponía el login propio (`Admin`, contraseñas, JWT propio). La spec lo reemplaza por Supabase Auth: el personal entra por **invitación por mail**, ROOT es el indicador `Usuario.esRoot` (no una membresía) y los permisos salen de `Usuario` y `Membresia`, que decide `AccesoService`.

> **Al día 2026-10-22: la Fase 4 está completa en código** (PR #416, a la espera del merge), y E2b también (8.2), sobre esa misma rama. La consola corre entera sobre Supabase: el backend de `/root/*` en la entrega 4.4 y las pantallas en la 4.5. El login propio ya no abre el panel: `root@menyu.com` no sirve para la consola. De esta sección no queda nada pendiente salvo poder reenviar una invitación que no se aceptó (13.3).

### 13.1 Qué cambia, pieza por pieza

> **La consola ya corre sobre la sesión de Supabase (entrega 4.5 de auth, 2026-10-21).** `useRootSession` usa `usePerfil()` (email y `esRoot`) y `logout()` de `@menyu/auth-client`, y `/root/*` entra solo con `esRoot`. Las pantallas y los diálogos no cambiaron. E2b (dueños y cuentas ROOT) está hecha: 8.2.

| Pieza | Efecto | Qué se hace |
|---|---|---|
| Marcas, restaurantes, baja y reactivar (backend de 1b y sus pantallas) | **Casi nada.** No dependen de cómo se loguea la persona. | Al llegar la Fase 4 se cambian el guard (`@RequiereRoot()`, ver 13.3) y de dónde sale el actor: ~0,5 día. |
| Historial (tabla, `GET /root/historial` y su pantalla) | **Sigue igual.** La tabla no tiene claves foráneas y guarda copias, justamente para sobrevivir a esto. | `actor_id` pasa a ser el id del `Usuario` (es una columna de texto). Habrá códigos de acción nuevos (invitar, mandar la recuperación): la pantalla tolera códigos que no conoce, y las filas viejas siguen valiendo. |
| Dueños (rutas de 1a, pantalla "Dueños" y menú de dueños en el detalle de una marca) | **Se rehacen.** | Un dueño es una `Membresia` OWNER de un `Usuario`. Crear = invitar por mail; eliminar = quitar la membresía. Sin contraseña temporal. *Hecho en la 4.4 de auth:* `POST /root/marcas/:id/duenos` y `DELETE /root/duenos/:membresiaId`. Cambiar el email y "restablecer" no se hicieron: son de la persona, desde web-auth. |
| Cuentas ROOT (rutas de 1a, pantalla y script) | **Se rehacen.** | `esRoot`. El primer ROOT de cada ambiente se crea a mano (Supabase → Authentication y un `INSERT`, como dice `docs/auth/usuarios-prueba-staging.md`). Los demás: la invitación de un ROOT a otro, que hay que construir. La última cuenta ROOT se protege con un disparador sobre `usuario.es_root`, que reemplaza al de `admin`. El script pasa a "promover" un `Usuario`. |
| E3 | **Desaparece la mitad.** | Sin cambiar contraseña, sin primer ingreso, sin refresh tokens propios y sin `debeCambiarPassword`. Queda la baja efectiva (13.3). |
| E4 | **Se funde con la Fase 4 de la spec**, que pasa los 43 `@Roles` legacy de 13 controllers a `@RequiereRol`. | No se hace aparte: se le pasan los criterios del Apéndice A del plan de Discovery (ROOT fuera de las rutas de datos y un "ROOT → 403" por ruta). |
| E5 | **Pierde sentido a mediano plazo.** | `root@menyu.com` desaparece con la tabla `Admin` (Fase 5). Desde la Fase 4 ya no abre la consola: su riesgo es el de una fila muerta. |
| 11.4 (tokens en la URL) | **Resuelto.** | La Fase 4 reemplazó el pase por la URL con la cookie de sesión de dominio compartido: web-admin y web-staff dejaron de leer `?token=&refresh=` (4.5 y 4.6) y web-cliente dejó de mandarlos (4.7). El "arreglo de fondo" de 11.4 no hizo falta. |

### 13.2 Decisiones reemplazadas y decisiones nuevas

**Reemplazadas.** Las decisiones **8** (contraseña generada y cambio en el primer ingreso), **19** (restablecer la contraseña de otro ROOT) y **20** (mínimo de 12 caracteres) quedan supersedidas: ROOT no genera, ve ni fija contraseñas. Invita por mail o manda el mail de recuperación, y la política de contraseñas es del proyecto de Supabase.

**Nuevas** (a confirmar):

- **21. ROOT invita a OWNER y a otras cuentas ROOT; el GERENTE lo invita el OWNER.** Es la regla del 2026-10-15. La spec y `puedeInvitar` dicen "ROOT → OWNER y GERENTE": hay que corregirlos (pedido 1).
- **22. El historial registra lo que cambia en nuestra base.** La llamada a Supabase es externa y queda fuera de la transacción: se hace primero (es idempotente: una cuenta ya confirmada se reutiliza) y después una sola transacción guarda el `Usuario`, la `Membresia` y el registro. Si esa transacción falla, el mail ya salió, pero nunca queda un permiso sin registro.
- **23. Una persona puede ser dueña de más de una marca.** El modelo lo permite (una `Membresia` por marca) y `POST /auth/invitaciones` ya suma la membresía a un email existente. La consola lo admite: invitar a un email que ya es dueño de otra marca no es un error (con `Admin` sí lo era: 409).

### 13.3 Lo que se le pide a `feat/auth`

> **Hecho, los cinco puntos (Fase 4 de auth, 2026-10-21).** El 1 (`ROLES_DE_ROOT` es `['OWNER']`), el 2 (`POST /root/roots` con `cuentaDeSupabase()`, el disparador `usuario_proteger_ultimo_root` de la 4.2 y `promover` en el script), el 3 (la baja efectiva en `AccesoService`, en la 4.2), el 4 (el registro `DUENO_INVITAR` en la transacción de la invitación) y el 5 (`@RequiereRoot()` en las rutas de `/root`, hecho por `feat/auth` y no por la consola). Queda pendiente, como deuda, reenviar una invitación que no se aceptó. Detalle en "4.4, cómo quedó" de `docs/auth/specs/auth.md`.

Con el código de la Fase 2 a la vista (`apps/backend/src/auth/`):

1. **Corregir la regla de ROOT.** `ROLES_DE_ROOT` de `puede-invitar.ts` y su test de tabla, la descripción del endpoint y la tabla de roles de la spec dicen "ROOT → OWNER y GERENTE". Tiene que ser solo OWNER (más ROOT, punto 2).
2. **Cómo se crean las demás cuentas ROOT.** `Rol` no tiene `ROOT` e `invitar` nunca pone `esRoot`: el primer ROOT a mano está bien, pero la consola tiene que poder invitar a otros. Proponemos que lo construya la consola reutilizando `cuentaDeSupabase()` (exportarlo del servicio), más el disparador de la última cuenta ROOT sobre `usuario.es_root` y un script que promueva un `Usuario`.
3. **La baja efectiva en `AccesoService`.** `rolesEnRestaurante`, `esOwnerDeMarca` y `perfil()` ignoran `activo` (ya figura en "Para la Fase 4"). Una membresía solo cuenta si la marca y el restaurante están activos, y `invitar` rechaza (409) sumar gente a una marca o restaurante dado de baja. Con eso la baja de la consola corta el acceso en cada pedido, sin tocar cuentas.
4. **Que lo que hace ROOT quede en el historial.** `InvitacionesService.invitar` es una acción de ROOT cuando `invitador.esRoot`, y hoy no deja rastro. Dentro de la transacción de `guardar()` hay que llamar a `HistorialRootService.registrar` (la consola aporta `actorDe` para un `Usuario`). Y si en la Fase 0 se opta por activar RLS en vez de apagar la Data API, la lista tiene que incluir `historial_root` y `admin`.
5. **Las rutas `/root/*` pasan con la Fase 4.** Son 5 controllers y 19 rutas con `JwtAuthGuard` y `@Roles('ROOT')`, todavía no en `main`. `@RequiereRol` solo sirve con `:restauranteId`: hace falta un `@RequiereRoot()` (`SupabaseAuthGuard` más `usuario.esRoot`). La migración de esas rutas la hace la consola, no `feat/auth`; también falta poder reenviar una invitación a quien no la aceptó (ya anotado en la spec).

### 13.4 E2, partida en dos

- **E2a: no depende de la autenticación, se hace ya.** El `Shell` compartido y las rutas `/root/*` con `React.lazy`, la lista de marcas, el detalle de una marca (datos y restaurantes; los dueños de solo lectura), los diálogos de marca y de restaurante (crear, editar, dar de baja y reactivar; la baja de una marca pide escribir su nombre), el historial con sus filtros, los estados, los tipos en `@menyu/types` y `api.root`, con tests y verificación contra el backend real.
- **E2b: esperó a `feat/auth` y está hecha** (2026-10-22, 8.2). Las acciones de dueños, la pantalla de Dueños y la de Cuentas ROOT. *Desde la 4.4 de auth* son invitar (email y nombre) y quitar dueños, e invitar cuentas ROOT, sobre la API de esa entrega; no hay diálogos de contraseña ni de cambiar el email. La pantalla de primer ingreso **no se hace**: la atiende web-auth.
- **Cuidados de E2a para no rehacer nada:** la sesión y el rol salen de un solo hook (`useRootSession`), que cambia de fuente en la Fase 4; la pantalla del historial tolera códigos de acción que no conoce; el detalle de una marca no usa `debeCambiarPassword`; ningún componente compartido habla de contraseñas.

### 13.5 Estimación después de leer la spec (orden de magnitud)

| Qué | Días | Cuándo |
|---|---|---|
| E2a (pantallas que no dependen de auth) | 3,5 a 4,5 | Ya |
| E2b (dueños y cuentas ROOT sobre invitaciones, front) | 1 a 1,5 | Hecha (2026-10-22), sobre la rama de la Fase 4 |
| Dueños y cuentas ROOT sobre invitaciones (backend), `@RequiereRoot()` en `/root/*`, actor desde `Usuario`, disparador y script | 2 a 2,5 | Hecho en la entrega 4.4 de `feat/auth` (2026-10-21) |
| Baja efectiva (en `AccesoService`) | 0,5 a 1 | Hecha en la entrega 4.2 de `feat/auth` (2026-10-21) |
| E4 | — | Hecho en la entrega 4.3 de `feat/auth` (2026-10-21) |
| E3 (contraseñas) | 0 | Descartada |
