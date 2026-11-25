# Pasada manual por staging: comandas (#344)

Se corre **una vez**, en el navegador, con `main` en el merge del #499 (`4e0a80c`) o posterior. Prueba de punta a punta lo que entregaron los PR de #344: el backend de comandas (#491), la comanda guardada en cada ítem del pedido (#492), la cocina filtrada por comanda en web-staff (#494) la gestión de comandas y el selector del plato en web-admin (#495) y el ajuste de la impresión, una sola vez al entrar a cocina (#499).

**Dónde:** "Restaurante Pruebas Auth" (`901c507f-dd63-43be-a006-10d8964521bf`). La sección F usa además un restaurante de demostración (`r-001`), solo para mirar. **No usar "Restaurante E2E". Nunca producción.**

**Qué es un hallazgo:** un error sin mensaje, una pantalla en blanco, un ítem que no aparece en ninguna pestaña o un dato que no coincide con lo esperado. Anotá cada uno con el paso, la hora (ART) y una captura.

**Cuentas** (las `caja-*.pruebas-auth`: owner, gerente, jefe, mozo-a y mozo-b; las contraseñas están en `docs/auth/.env.usuarios-staging` y no se pegan en chats, issues ni PRs):

| Para qué | Cuenta | Dónde |
|---|---|---|
| Gestionar comandas y platos | `caja-owner` (y `caja-gerente` en A1) | web-admin |
| Ver la cocina | `caja-owner` o `caja-gerente` (ver 0.4) | web-staff, Cocina |
| Pasar el pedido del comensal a "En preparación" y tomar un pedido como mozo | `caja-jefe` | web-staff, Pedidos y Toma de pedidos |
| Verificar que no entra a web-admin | `caja-jefe` | web-admin |
| El comensal | sin cuenta (QR o PIN) | web-cliente |

Cada cuenta en un perfil o navegador distinto: las ventanas de incógnito comparten la sesión.

---

## 0. Preparación

- [ ] **0.1 Deploy.** `https://api.staging.menyu-app.com/health` (o `https://menyu-backend-staging.up.railway.app/health`) responde con `db: "ok"` y un `sha` que es el del merge del #499 (`4e0a80c`) o uno posterior. Ojo: `/health` está **fuera** del prefijo `/api` (`apps/backend/src/main.ts`): con `/api/health` da 404.
- [ ] **0.2 Sin comandas en el restaurante.**
  ```sql
  SELECT nombre, activa FROM comanda
  WHERE restaurante_id = '901c507f-dd63-43be-a006-10d8964521bf';
  ```
  Tiene que dar 0 filas. Si hay alguna de una prueba anterior, anotala y adaptá los nombres de abajo.
- [ ] **0.3 Los dos platos.** "Plato de prueba" ($1.000) y "Plato de prueba 500" ($500), disponibles. En esta pasada el de $500 hace de **bebida** (va a Barra). *(Los nombres y precios no están en el repo: confirmarlos en staging.)*
- [ ] **0.4 Cuenta de cocina.** La pantalla Cocina de web-staff es de los roles **COCINA, OWNER y GERENTE** (`puedeVerCocina`, `apps/web-staff/src/store/contextoStore.ts`). De las `caja-*` entran **`caja-owner` y `caja-gerente`**; no entran `caja-jefe` (JEFE_SALON), `caja-mozo-a` ni `caja-mozo-b` (MOZO), que son de la vista del mozo y, al abrir `/cocina`, vuelven a `/`. Como OWNER y GERENTE ven las dos vistas, al entrar a web-staff caen en el **selector**: elegir "Cocina". Existe también `cocina.pruebas-auth@menyu-app.com` (COCINA de "Restaurante Pruebas Auth", en `docs/auth/usuarios-prueba-staging.md`), pero no está en `.env.usuarios-staging`: si se quiere usar, confirmar antes que exista en staging y tener su contraseña. Con `caja-owner` alcanza.
- [ ] **0.5 Sin sesiones activas.** En web-staff, en Pagos, "Sin mesas activas".

## A. Gestión de comandas en web-admin (#495)

- [ ] **A1 Entrada en el menú.** Como `caja-owner` y como `caja-gerente`: en la sección CATÁLOGO aparece **"Comandas"** justo debajo de "Menú", con el ícono de gorro de chef (distinto del de "Pedidos").
- [ ] **A2 Lista vacía.** La pantalla Comandas muestra el formulario de alta y el estado vacío: **"Todavía no hay comandas. Creá la primera para asignarla a los platos desde el menú. Sin comandas, la cocina ve todos los pedidos juntos."**
- [ ] **A3 Crear.** Crear **"Cocina"** y **"Barra"**. Las dos aparecen en la lista como activas.
- [ ] **A4 Validaciones del alta.**
  - Nombre vacío: **"Escribí el nombre de la comanda"**, junto al campo, sin crear nada.
  - 41 caracteres: el campo **no deja pasar de 40** (`maxLength`, también al pegar), así que el error de largo máximo ("El nombre admite hasta 40 caracteres") no se puede ver desde el navegador; lo cubren los tests. Comprobar que el campo se queda en 40 y **no crear** esa comanda.
  - "Barra" otra vez: **"Ya hay una comanda con ese nombre en este restaurante"**, junto al campo.
  - "  Barra  " (con espacios): el mismo error de repetido, porque el nombre se recorta.
- [ ] **A5 Renombrar.** Renombrar "Barra" a "Barra 2" y volver a "Barra". Al cancelar o guardar, el foco vuelve al botón "Renombrar".
- [ ] **A6 Quién no entra.** Abrir web-admin con la sesión de `caja-jefe`: lo redirige a su app y nunca ve Comandas.

## B. Comanda de cada plato (#495)

- [ ] **B1 Asignar Cocina.** Editar "Plato de prueba": debajo de Categoría aparece el selector **Comanda** con "Sin comanda", "Barra" y "Cocina" (ordenadas por nombre). Elegir **Cocina** y guardar.
- [ ] **B2 Asignar Barra.** Editar "Plato de prueba 500": elegir **Barra** y guardar.
- [ ] **B3 Editar sin tocar la comanda.** Volver a abrir "Plato de prueba", cambiar solo la descripción y guardar. La comanda sigue en Cocina.
- [ ] **B4 En la base.**
  ```sql
  SELECT i.nombre, c.nombre AS comanda
  FROM item_menu i LEFT JOIN comanda c ON c.id = i.comanda_id
  WHERE i.restaurante_id = '901c507f-dd63-43be-a006-10d8964521bf'
  ORDER BY i.nombre;
  ```
  "Plato de prueba" → Cocina, "Plato de prueba 500" → Barra.

## C. Desactivar (#491 y #495)

- [ ] **C1 Con platos asignados.** Intentar desactivar **Barra**: aparece la confirmación; al confirmar, la fila muestra **"La comanda tiene 1 plato asignado: cambialo de comanda antes de desactivarla"**, la confirmación se cierra y Barra sigue activa. *(Eso vale si "Plato de prueba 500" es el único plato de Barra; si hay otro, el número cambia: "…tiene 2 platos asignados: cambialos…".)*
- [ ] **C2 Sin platos.** Crear **"Parrilla"**, desactivarla (con confirmación): queda "Inactiva". Activarla (va directo, sin confirmación) y volver a desactivarla. Queda **inactiva** para el resto de la pasada.
- [ ] **C3 Inactiva fuera del selector.** Al editar cualquier plato, "Parrilla" no aparece como opción.

## D. Cocina filtrada por comanda (#494)

Con `caja-owner` o `caja-gerente` en web-staff: el selector, "Cocina". **La cocina solo muestra pedidos "En preparación" y "Listo"**: un pedido del comensal entra como **Pendiente** y no aparece en ella hasta que un mozo lo pasa a "En preparación" (web-staff, Pedidos, con `caja-jefe`). Un pedido tomado por el mozo con "Toma de pedidos" entra directo a "En preparación" (D9). Si hay impresora, conectarla en esta pantalla (botón "Conectar impresora" de la cabecera) antes de D2: ver D10.

- [ ] **D1 Pestañas.** Arriba aparecen los botones **"Todas"**, **"Barra"** y **"Cocina"**. "Parrilla" no aparece (está inactiva). Si no aparecen, tocar "Actualizar".
- [ ] **D2 Pedido mixto en "Todas".** Desde el comensal, en la **mesa 1**, pedir "Plato de prueba" y "Plato de prueba 500" en el mismo pedido. La cocina todavía no lo muestra (está Pendiente). Con `caja-jefe`, en web-staff, Pedidos, tocar **"En preparación"** en ese pedido. En la cocina, pestaña "Todas", aparece completo y **suena**. *(El navegador solo deja sonar si la página ya recibió algún clic: tocar "Todas" antes alcanza.)*
- [ ] **D3 Pestaña Barra.** Elegir "Barra": el pedido muestra solo "Plato de prueba 500" y el aviso **"+1 de otras comandas"**. Los contadores cuentan lo visible.
- [ ] **D4 Pestaña Cocina.** Elegir "Cocina": el pedido muestra solo "Plato de prueba" con "+1 de otras comandas".
- [ ] **D5 Sonido por comanda.** Quedarse en **Barra**. Desde el comensal, en la **mesa 2**, pedir solo "Plato de prueba" y, con `caja-jefe`, pasarlo a **"En preparación"**. En Barra ese pedido **no aparece y no suena**. Pasar a "Cocina": ahí sí está. *(Sin pasarlo a "En preparación" no aparece en ninguna pestaña: no probaría el filtro.)*
- [ ] **D6 "Listo" con confirmación.** En **Barra**, tocar "Listo" en el pedido de la mesa 1: en la tarjeta aparece **"Vas a marcar listo todo el pedido, incluidos 1 ítem de Cocina"** con "Confirmar" y "Cancelar".
  - "Cancelar": el pedido no cambia.
  - Cambiar de pestaña con el aviso abierto: el aviso se descarta.
  - Volver a Barra, "Listo" y "Confirmar": el pedido avanza entero.
- [ ] **D7 "Listo" sin confirmación.** En **Cocina**, el pedido de la mesa 2 (solo Cocina): "Listo" avanza directo, sin aviso.
- [ ] **D8 Se recuerda la pestaña.** Elegir "Barra" y recargar la página: sigue en "Barra".
- [ ] **D9 Pedido del mozo.** Con `caja-jefe`, en web-staff, "Toma de pedidos", en la **mesa 1** (sesión abierta): tomar un pedido con "Plato de prueba" y "Plato de prueba 500". Entra directo a "En preparación": en la cocina, en "Barra", aparece solo la bebida con "+1 de otras comandas" y suena.
- [ ] **D10 Impresión (solo si hay impresora; si no, "no aplica").** Desde el #499 imprime **solo la pantalla Cocina**, **una vez por pedido**, cuando el pedido **entra a cocina**, y solo los ítems de la pestaña en la que está ese dispositivo. La impresora se conecta con "Conectar impresora" de la cabecera de Cocina (WebUSB: por pestaña, y se pierde al recargar: **volver a conectarla después de D8**); el botón "Test" imprime una prueba.
  - **La pantalla Pedidos del mozo ya no tiene impresora**: sin "Conectar impresora", sin "Test" y sin imprimir.
  - **Pedido del comensal (D2 y D5):** el ticket sale cuando `caja-jefe` lo pasa a "En preparación", **no** cuando el comensal lo crea. Con la pantalla en "Todas" sale el pedido completo (D2); en "Barra", solo "Plato de prueba 500"; en "Cocina", solo "Plato de prueba". En D5 (mesa 2, solo "Plato de prueba") en "Barra" no sale nada.
  - **Pedido del mozo (D9):** el ticket sale apenas lo toma, una sola vez, con los ítems de la pestaña.
  - **Una sola vez:** "Listo" (D6 y D7) no reimprime, ni tampoco recargar la pantalla; un pedido sin ítems en la pestaña no imprime.
  - **Una estación por pestaña:** con una impresora en "Barra" y otra en "Cocina", cada una saca su parte; un dispositivo en "Todas" saca el pedido completo (no dejar una impresora en "Todas" si otras estaciones ya imprimen sus partes). Los ítems **sin comanda** salen en todas las estaciones.

## E. La comanda queda guardada en el pedido (#492)

- [ ] **E1 En la base.**
  ```sql
  SELECT m.numero, i.nombre,
         c.nombre  AS comanda_del_pedido,
         ca.nombre AS comanda_actual_del_plato
  FROM pedido_item pit
  JOIN pedido p       ON p.id = pit.pedido_id
  JOIN mesa m         ON m.id = p.mesa_id
  JOIN item_menu i    ON i.id = pit.item_id
  LEFT JOIN comanda c  ON c.id = pit.comanda_id
  LEFT JOIN comanda ca ON ca.id = i.comanda_id
  WHERE m.restaurante_id = '901c507f-dd63-43be-a006-10d8964521bf'
  ORDER BY p.created_at DESC, i.nombre
  LIMIT 10;
  ```
  Cada ítem de los pedidos de D2, D5 y D9 tiene su comanda (Cocina para "Plato de prueba", Barra para "Plato de prueba 500"). Cubre los tres caminos que crean pedidos: el del comensal (D2 y D5) y el del mozo (D9).
- [ ] **E2 Cambiar la comanda del plato no mueve los pedidos.** En web-admin, pasar "Plato de prueba 500" de Barra a **Cocina**. Repetir la consulta E1: `comanda_actual_del_plato` ahora dice Cocina, pero `comanda_del_pedido` de los pedidos ya creados sigue en **Barra**. Volver a dejarlo en Barra.

## F. Restaurante de demostración (solo mirar)

- [ ] **F1 Pestañas sin configurar nada.** Con una cuenta de cocina de `r-001`, si hay una disponible: la cocina muestra "Todas", "Barra" y "Cocina" con los platos ya clasificados. Si no hay cuenta, marcar "no aplica". *(No hay una cuenta de cocina de `r-001` documentada en el repo.)*

## G. Limpieza

- [ ] **G1 Sesiones.** Cerrar las sesiones de las mesas 1 y 2 (desde Pagos o con `POST /api/sessions/mesa/:mesaId/cerrar`). En Pagos, "Sin mesas activas".
- [ ] **G2 Comandas.** Dejar "Cocina" y "Barra" activas con sus platos asignados: sirven para la demo y el video. "Parrilla" queda inactiva.

---

## Lo que esta pasada no puede mostrar

- **Un plato con una comanda inactiva** ("Barra (inactiva)" en el selector): no se puede llegar desde la app, porque el backend no deja desactivar una comanda con platos asignados. Lo cubren los tests del PR 3.
- **El error de largo máximo del nombre** (A4): el campo no deja escribir más de 40 caracteres. Lo cubren los tests.
- **Impresión sin cola ni reimpresión:** si la pantalla Cocina estaba cerrada o la impresora desconectada cuando el pedido entró a cocina, ese ticket no sale. Y un pedido que entra en el mismo instante en que la pantalla carga puede no imprimirse (límite conocido del #499).
- **"Listo" por comanda:** quedó fuera del alcance; el "Listo" sigue siendo por pedido (límite conocido).
- **Las pestañas no se actualizan solas** cuando se crea o desactiva una comanda: hace falta "Actualizar" o recargar (límite conocido).

## Si algo falla

Anotar el paso, la hora (ART), la cuenta, lo esperado y lo que pasó, con una captura y, si es del backend, la línea del log de Railway. Un hallazgo no se arregla durante la pasada: se abre un issue y se sigue con el paso siguiente si no depende del que falló.
