# Plan: consola de ROOT

**Estado:** mockups y supuestos 1 a 9 aprobados el 2026-10-15; novedades del mismo día (cuentas ROOT, historial de acciones) en el plan y los mockups, para confirmar. El script de cuentas ROOT está hecho; la consola todavía no tiene código · **Actualizado:** 2026-10-15 · **Base:** `main` (merge 7072d67)
**Mockups:** [`docs/mockups/consola-root/`](mockups/consola-root/README.md) (abrir `index.html`; 66 pantallas y estados)
**Viene de:** la sección 11.2 y el Apéndice A de [`plan-discovery-descuentos.md`](plan-discovery-descuentos.md). Este plan **reemplaza** a 11.2 y cambia la regla de ROOT (sección 2.1 y D16 de ese plan, y `CLAUDE.md`).

Este documento es la referencia de la consola de ROOT: qué hace ROOT, cómo está hoy el código, qué decidimos y qué hay que confirmar, la API, las pantallas, las etapas con su estimación y los riesgos. Si una decisión cambia, se actualiza acá.

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

Relevado el 2026-10-15 leyendo `main`. Son hechos, no suposiciones.

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
| 7 | **Cuentas de dueño:** email + contraseña, sin nombre (se saca `nombre` del DTO). Puede haber varios dueños por marca. **No se puede eliminar al último dueño de una marca activa** (409). | Aprobado |
| 8 | **Contraseñas:** el sistema genera la contraseña y la muestra **una sola vez**; la persona la tiene que cambiar en su primer ingreso (columna y pantalla nuevas). "Restablecer" genera otra y vuelve a marcarla como temporal. | Aprobado |
| 9 | **BurgerLab:** se da de baja desde la consola. Con eso, todos los ids que no son UUID quedan fuera de Discovery y de la operación, y **ya no hace falta** relajar los `@IsUUID()` (11.3 del plan de Discovery). | Aprobado |
| 10 | Los GERENTE no aparecen en la consola. `POST /admins` deja de aceptar a ROOT y los GERENTE los sigue creando el OWNER. | Derivado de la regla |
| 11 | Sacarle a ROOT los permisos viejos (Apéndice A del plan de Discovery) va **al final**, en la etapa 4. Hasta entonces ROOT puede seguir abriendo las pantallas viejas de web-admin por URL. | Aprobado |
| 12 | Las sesiones de mesa **ya abiertas** en el momento de la baja se dejan terminar (cobrar y cerrar); lo que se corta es abrir sesiones nuevas y entrar. Es un detalle de la 6. | A confirmar |
| 13 | **Un ROOT puede crear otras cuentas ROOT** desde la consola. Vamos a tener una por integrante del equipo (tres). | Acordado |
| 14 | **La primera cuenta ROOT de cada entorno se crea con un script** que corre el equipo, con la contraseña elegida al correrlo (sin eco): no queda escrita en el repo ni en la línea de comandos. Hecho: `apps/backend/scripts/cuentas-root.ts` (sección 7.1). | Acordado y hecho |
| 15 | **Las cuentas ROOT no se pueden borrar:** un ROOT no se borra a sí mismo y no se puede borrar al último. *Mi lectura (a confirmar):* ninguna cuenta ROOT se borra desde la consola ni desde la API; la única vía es el script, que nunca borra al último, y la base de datos también lo impide. Si querías que un ROOT pueda borrar a otro (menos a sí mismo y al último), es un cambio chico en E1a y E2. | Acordado; la lectura, a confirmar |
| 16 | **`root@menyu.com` se borra en staging y en producción** cuando las cuentas personales funcionen bien. Es la etapa 5 (sección 9). | Acordado |
| 17 | **Historial de acciones de ROOT:** todo lo que hace un ROOT queda registrado (quién, qué acción, sobre qué —marca, restaurante, OWNER u otro ROOT— y cuándo), incluidos crear un ROOT y restablecer contraseñas. **No se puede editar ni borrar**, ni desde la app ni desde la API ni, si se puede, desde la base de datos. Todos los ROOT lo ven desde una pantalla de la consola. | Acordado |
| 18 | **Qué se registra y cómo:** todo **cambio** que haga un ROOT (mirar listas no). El registro se escribe en **la misma transacción** que el cambio: si no se puede registrar, el cambio no se hace. Guarda una copia del email de quien lo hizo (sigue valiendo si esa cuenta se retira), qué cambió (antes y después) y **nunca una contraseña**. *Opcional:* registrar también los inicios de sesión de ROOT (+0,25 día). | A confirmar |
| 19 | **Un ROOT puede restablecer la contraseña de otro ROOT** (queda registrado; la otra persona la cambia al entrar). Hace falta si alguien la olvida. | A confirmar |
| 20 | **Mínimo de 12 caracteres** al elegir la contraseña en el primer ingreso, para dueños y ROOT (hoy los dueños tienen 8 como mínimo al crear la cuenta). | A confirmar |

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

Es la pregunta de "qué pasa al borrar una marca con restaurantes y usuarios". Hoy no pasa nada efectivo; esto es lo aprobado (decisiones 5, 6 y 12). **No se borra ninguna fila** salvo las cuentas OWNER que ROOT elimine.

| Cosa | Baja de la **marca** | Baja de un **restaurante** |
|---|---|---|
| Sus restaurantes | Dejan de estar disponibles (sin cambiarles el `activo`: se evalúa `marca.activo AND restaurante.activo`) | — |
| Discovery y `GET /menu/:id` | No aparecen / 404 (Discovery ya lo hace; el menú hoy mira solo el restaurante) | No aparece / 404 |
| Abrir una mesa (QR, `/check-in`, PIN) | Se rechaza con "Este restaurante no está disponible" | Igual |
| Sesiones de mesa ya abiertas | Se dejan terminar (cobrar y cerrar) | Igual |
| Inicio de sesión de OWNER y GERENTE | Se rechaza (403) | GERENTE asignado solo a ese restaurante: se rechaza |
| Inicio de sesión de mozos y cocina | Se rechaza | Se rechaza |
| Sesiones ya iniciadas (tokens) | Siguen hasta que vence el token (8 h el de acceso); no se revocan | Igual |
| Cuentas OWNER, GERENTE y asignaciones | **Quedan como están** (no se borran) | Quedan |
| Menú, mesas, pedidos, pagos, logos | **Quedan como están** | Quedan |
| **Reactivar** | Vuelve todo como estaba | Vuelve todo |

La reactivación no puede fallar por "restaurantes dados de baja a mano": cada restaurante conserva su propio estado. Dar de baja y reactivar quedan en el historial.

## 7. API: `/root/*`, cuentas ROOT e historial

Módulo nuevo `root/` con `@Roles('ROOT')` a nivel de controller. Cada consulta con `select` explícito: nunca `include` sin `select`. Ningún DTO exige UUID: los ids de la ruta se validan solo por su forma. Las contraseñas se guardan con bcrypt y las generadas salen de `crypto.randomInt` (12 caracteres, sin los que se confunden: 0/O, 1/l/I). **Cada ruta que cambia algo registra la acción en el historial dentro de la misma transacción** (sección 7.2).

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

**El script** (hecho): `apps/backend/scripts/cuentas-root.ts`. Lo corre una persona del equipo, una vez por entorno. Comandos: `listar` (solo lectura), `crear <email>`, `restablecer <email>` y `eliminar <email>`. Se corre desde `apps/backend`:

```
pnpm exec ts-node --transpile-only scripts/cuentas-root.ts crear ana@dominio.com
```

- **La contraseña se pide al correrlo, sin eco** (no aparece en pantalla, no queda en el historial de la terminal, no se escribe en ningún archivo y **nunca se imprime**). Pide un mínimo de 12 caracteres, rechaza las conocidas (`root1234`…) y las que contienen el usuario del email, y la pide dos veces. Se guarda solo el hash (bcrypt, 12 rondas).
- **A qué base se conecta:** usa `DATABASE_URL` de **esa terminal** (la misma URL que tiene el backend en Railway para ese entorno) o un archivo **fuera del repo** con `--archivo-env=<ruta>`. **No lee el `.env`**, a propósito, para no tocar una base sin querer. Antes de escribir nada muestra a qué base apunta (servidor, puerto, nombre y usuario; nunca la clave) y pide escribir el nombre de la base.
- **Reglas:** normaliza el email a minúsculas (el login lo busca así) y **se niega si el email ya lo usa un admin, un mozo o un cliente**. `restablecer` y `eliminar` solo tocan cuentas ROOT, y `restablecer` cierra las sesiones renovables de la cuenta. **`eliminar` nunca borra al último ROOT** y pide escribir el email.
- **Verificado** (47 verificaciones contra una base descartable, más la terminal real simulada con retroceso y sin eco, más un backend temporal): la cuenta creada inicia sesión con la contraseña elegida y el token dice `rol: ROOT`. Con la entrada cerrada a la mitad corta con error, no con éxito.
- **Las acciones del script quedan en el historial desde E1a:** cuando exista la tabla (sección 7.2), el script también registra lo que hace, con el actor `SCRIPT` y el usuario del sistema operativo como operador. Antes de E1a, no.

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
| Dueño (OWNER) | `DUENO_CREAR`, `DUENO_CAMBIAR_EMAIL`, `DUENO_RESTABLECER`, `DUENO_ELIMINAR` |
| Cuenta ROOT | `ROOT_CREAR`, `ROOT_RESTABLECER`, `ROOT_ELIMINAR` (esta última solo la hace el script) |
| *Opcional* | `ROOT_INICIO_SESION` |

**Qué guarda cada registro:** quién (el id y una **copia del email** en ese momento, para que el dato siga valiendo si la cuenta se retira; si fue el script, el operador), qué acción, sobre qué (tipo, id y una copia del nombre o email, y la marca de contexto) y cuándo (la hora la pone la base). El **detalle** es la lista de cambios, con el valor de antes y el de después. **Nunca guarda una contraseña ni un hash**: una contraseña restablecida figura como "no se registra".

**Cómo se garantiza que esté completo:** el registro se escribe **dentro de la misma transacción** que el cambio. No puede haber un cambio sin su registro ni un registro de un cambio que no ocurrió; si no se puede registrar, el cambio no se hace.

**Cómo se garantiza que no se pueda alterar:**

| Capa | Qué hace |
|---|---|
| App y API | Solo existen `registrar` y `listar`. No hay ruta `PUT`, `PATCH` ni `DELETE` bajo `/root/historial` (un test recorre el enrutador) y el servicio nunca llama a `update` ni `delete` sobre la tabla (un test lo comprueba). |
| Base de datos | Disparadores que **bloquean `UPDATE`, `DELETE` y `TRUNCATE`** sobre la tabla para cualquier sesión, incluida la de la app. No hay clave foránea hacia las cuentas, así que borrar o retirar una cuenta no toca el historial. |
| Límite que hay que conocer | Quien tenga el rol dueño de la base (en Supabase, `postgres`) puede, en teoría, quitar el disparador: eso no lo impide ningún código de la app. Una medida opcional, fuera de este plan, es encadenar los registros con hashes (cada uno guarda el hash del anterior) para que cualquier alteración quede a la vista (+0,5 a 1 día). |

**Pantalla:** la ven todos los ROOT (`GET /root/historial` con `@Roles('ROOT')`): agrupada por día, con filtros por quién, sobre qué y fechas, el detalle desplegable y "Cargar más". Mockups en `docs/mockups/consola-root/`.

**Migración (E1a):** una sola, con la tabla del historial, sus disparadores, un disparador que **impide borrar al último ROOT** (sobre `admin`, solo para filas con `rol = 'ROOT'`) y la columna `admin.debe_cambiar_password boolean not null default false` (sin efecto en las cuentas existentes). Los tests y limpiezas que borran cuentas de admin tienen que usar `session_replication_role = replica`, como ya hacen las verificaciones contra la base local.

## 8. Pantallas

Mockups en `docs/mockups/consola-root/` (abrir `index.html`; 66 pantallas y estados, en celular, tablet y escritorio).

- **Rutas:** `/root` (Marcas), `/root/marcas/:id` (detalle de una marca), `/root/duenos`, `/root/roots` (cuentas ROOT) y `/root/historial`, más la pantalla de primer ingreso. Cada ruta con `RoleGuard roles={['ROOT']}`; el login manda a ROOT a `/root`.
- **Shell:** el mismo menú lateral y barra superior de web-admin, con dos grupos: **Administración** (Marcas, Dueños) y **Sistema** (Cuentas ROOT, Historial). En vez del selector de marca y restaurante (ROOT no opera ninguno) dice "Administración". Para no copiar las ~700 líneas de `AdminLayout`, se extrae un `Shell` que reciben `AdminLayout` y `RootLayout`; los tests de `AdminLayout` cubren esa extracción.
- **Marcas:** lista con búsqueda, interruptor "Mostrar dadas de baja" y "Nueva marca". Cada fila muestra restaurantes, dueños y estado, y avisa "Sin dueño".
- **Detalle de una marca (donde ROOT trabaja):** datos con Editar y Dar de baja; dueños con su menú (restablecer contraseña, cambiar email, eliminar); restaurantes con su dirección de solo lectura y su menú (editar nombre, dar de baja o reactivar). Cierra con el recordatorio de lo que ROOT no ve.
- **Dueños:** lista global con búsqueda por email o marca. **Opcional:** se puede dejar para después sin perder nada.
- **Cuentas ROOT:** una por integrante, con "Vos" y "Contraseña temporal", "Nueva cuenta ROOT" y el menú para restablecer la contraseña de otra o cambiar la propia. **No hay "Eliminar"**, y un aviso lo explica.
- **Historial:** agrupado por día; cada fila dice qué hizo quién y sobre qué, y se despliega para ver antes y después. Filtros, "Cargar más", estados vacío, sin resultados, error y cargando. Dice que no se puede editar ni borrar.
- **Primer ingreso (E3):** pantalla sola, sin menú lateral, "Elegí tu contraseña", para quien entra con una contraseña temporal. 12 caracteres como mínimo y distinta de la temporal.
- **Diálogos:** ventana al centro en escritorio y hoja desde abajo en celular. Dar de baja una marca pide escribir su nombre. La contraseña generada se muestra una sola vez, con botón para copiar. **Todos los que cambian algo avisan "Esta acción queda registrada en el historial".**
- **Estados:** cargando (esqueletos), vacío, error con "Reintentar", sin conexión y nombres larguísimos.
- **Responsive:** botones y áreas táctiles de 44 px o más, campos de 16 px, sin scroll horizontal, `100dvh`. Es la regla de la sección 2.3 del plan de Discovery.
- **Tipos:** `@menyu/types` suma los tipos de la consola (`RootMarca`, `RootRestaurante`, `RootDueno`, `RootCuenta`, `RootAccion` y sus pedidos y respuestas). La API del cliente va en `api.root.*` de `apps/web-admin/src/services/api.ts`.

## 9. Etapas, estimación y orden

Orden de magnitud, una persona en días de trabajo enfocado (no son las horas del plan; el equipo trabaja medio tiempo). Cada etapa es una rama y un PR, y cada una incluye sus tests y la verificación contra el backend real.

| Etapa | Qué entrega | Estimación |
|---|---|---|
| **E0** Script de cuentas ROOT | `cuentas-root.ts` (sección 7.1). **Hecho.** | 0,5 día (hecho) |
| **E1a** Backend: historial, cuentas ROOT y dueños | La migración (historial, disparadores, `debe_cambiar_password`), el servicio de historial, `POST /root/marcas/:id/duenos` y el resto de dueños, las rutas de cuentas ROOT, y que el script también registre. **Es lo que destraba el QA sin puente:** con el token de ROOT, desde el Swagger de staging, se crea un OWNER. | 2,5 a 3,5 días |
| **E1b** Backend: marcas, restaurantes y lectura del historial | El resto de `/root/*` (marcas, restaurantes, baja y reactivar, todavía sin efecto fuera de Discovery) y `GET /root/historial` con filtros y cursor. | 1,5 a 2 días |
| **E2** Consola (web-admin) | `Shell` compartido, rutas `/root/*` con `React.lazy`, las pantallas (marcas, detalle, dueños, **cuentas ROOT**, **historial**), los diálogos y estados, tipos y `api.root`, tests, verificación con Playwright contra el backend real. | 4,5 a 6 días |
| **E3** Baja efectiva y contraseñas | Sección 6 (menú público, apertura de mesas, login, pruebas de que reactivar devuelve todo), `POST /auth/cambiar-password`, la pantalla de primer ingreso con cambio obligatorio (y que el backend lo exija), revocación de refresh tokens. | 2 a 2,5 días |
| **E4** Sacarle a ROOT lo viejo | El Apéndice A del plan de Discovery: ~35 `@Roles(…ROOT…)` en 11 controllers, ~15 `rol === 'ROOT'`, un servicio de acceso central, `isOwner` y `canEdit` en ~6 pantallas, `SelectorPage` de web-staff, los specs invertidos y un "ROOT → 403" por cada ruta cerrada. | 3 a 4 días |
| **E5** Retirar `root@menyu.com` | Sección 7.1: crear las cuentas personales, probarlas, eliminar la compartida con el script y verificar, en staging y en producción. | 0,25 a 0,5 día |
| **Subtotal E1 a E3** (consola usable y segura) | | **10,5 a 14 días** |
| **Total con E4 y E5** | | **14 a 18,5 días** |

**Lo que agregó lo nuevo del 2026-10-15** (cuentas ROOT, historial y primer ingreso mockeado): **3,5 a 4,5 días** sobre la estimación aprobada (7 a 9,5 hasta E3): el historial, 2,5 a 3 (migración con disparadores, servicio dentro de la transacción, tests de que no se puede alterar, lectura con filtros, pantalla y estados), y las cuentas ROOT, 1 a 1,5 (rutas, disparador del último ROOT, pantalla y diálogos). La estimación original de 11.2 era 6 a 8 días y no incluía editar, reactivar, la baja efectiva ni las contraseñas.

**Se puede recortar:** sin las decisiones 6 y 8, E3 desaparece. Sin la pantalla de Dueños (opcional), E2 baja 0,5 día. Sin el historial no: es un pedido del equipo.

**Orden:** E0 (hecho) → E1a → E1b → E2 → E3 → E4 → E5. El historial va en E1a porque **cada acción de ROOT tiene que quedar registrada desde la primera**. La consola (E2) puede salir a staging sin E3 y sin E4.

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

- **ROOT puede, por diseño, crear un dueño o restablecer la contraseña de uno y entrar como él.** La regla "ROOT no ve datos privados" se cumple por permisos e interfaz, no es una barrera técnica. Lo que la protege es que (a) la contraseña es temporal y cambia en el primer ingreso (decisión 8), (b) restablecerla cierra las sesiones, así que la persona lo nota, y (c) **ahora todo queda en el historial, que ningún ROOT puede borrar**: una entrada indebida deja rastro de quién restableció qué y cuándo. Es la protección que antes faltaba.
- **El historial no es invulnerable.** Quien tenga el rol dueño de la base puede quitar el disparador (sección 7.2). Se acepta para este plan; la cadena de hashes es la mejora si hiciera falta.
- **Tres ROOT con los mismos poderes:** cualquiera puede restablecer la contraseña de otro ROOT (decisión 19). Queda registrado con su nombre, pero no hay un segundo control. Para un equipo de tres es razonable.
- **La cuenta ROOT de producción.** En 11.1 del plan de Discovery se decidió no cambiar cuentas ni contraseñas de producción. `root@menyu.com` puede existir en staging y producción con `root1234` (la documentación dice que se creó con el endpoint de desarrollo). Con la consola, quien entre con ella crea dueños y entra a cualquier marca. **El retiro (E5) lo resuelve**, y el script permite hacerlo antes de que exista la consola; si no, conviene cambiarla antes del tag que lleve la consola. La decisión es del equipo; queda anotada.
- **Las acciones del script no quedan en el historial hasta E1a.** Crear la primera cuenta en staging hoy no deja rastro; después sí.
- **Cambio de comportamiento público (E3):** una marca o restaurante dado de baja deja de abrir mesas y de mostrar su carta. Hoy "borrar" no hacía eso: si alguien depende de eso, se entera acá.
- **Sesiones ya iniciadas:** los tokens de acceso (8 h) de gente de una marca dada de baja, o de una cuenta cuya contraseña se restableció, siguen valiendo hasta que vencen; lo que se revoca al instante son los refresh tokens. Revocar todo al instante exigiría consultar la base en cada pedido; no se propone.
- **Migración (E1a):** una sola, con la tabla del historial, los disparadores y la columna de contraseña temporal. Va en el mismo tag que las 13 migraciones pendientes y **entra en el ensayo con una copia de producción**. El disparador del último ROOT hace que `delete from admin` falle mientras quede un ROOT: las limpiezas de tests usan `session_replication_role = replica`.
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
