# Pasada manual por staging: caja en web-staff y web-admin, con Mercado Pago real (#359 y #360)

Se corre **una vez**, en el navegador, con `main` en `c782d11` o posterior. Prueba las pantallas de caja de web-staff (#359) y web-admin (#360) contra el backend y la base reales de staging. Incluye lo que nunca se probó: **un pago real de Mercado Pago con cuentas de prueba**, de punta a punta, que pasa por el webhook. Cuando pase entera, se cierran #358, #359 y #360 y se decide el tag de producción según los hallazgos.

**Dónde:** solo staging, en **"Restaurante Pruebas Auth"**. **No usar "Restaurante E2E"**: es el de la corrida automática de cada deploy (`e2e-staging.yml`), y un turno abierto ahí le cambia lo que ve su mozo. **Nunca producción.**

**Qué es lo esperado y qué sería un hallazgo.** Un aviso o un error con un mensaje claro es una respuesta válida donde se indica. **Un error sin mensaje, una pantalla en blanco o un dato que no coincide con lo cobrado son hallazgos.** Anotá cada uno con el paso, la hora y una captura.

**Las cuentas** son las `caja-*.pruebas-auth`: owner, gerente, jefe, mozo-a y mozo-b. Las contraseñas están en `docs/auth/.env.usuarios-staging` y no se pegan en chats, issues ni PRs. Conviene una ventana de incógnito por cuenta, más una para el comensal.

| Para qué | Cuenta | Dónde |
|---|---|---|
| ABM de cajas, cobros e historial (web-admin) | `caja-owner` y `caja-gerente` | `https://admin.staging.menyu-app.com` |
| Abrir, mover y cerrar el turno (web-staff) | `caja-jefe` | `https://staff.staging.menyu-app.com/mozo/caja` |
| Cobrar como mozo (web-staff) | `caja-mozo-a` y `caja-mozo-b` | `https://staff.staging.menyu-app.com/mozo/pagos` |
| El comensal | sin cuenta (QR o PIN) | `https://mesa.staging.menyu-app.com` |
| Pagar con Mercado Pago | la cuenta **compradora** de prueba de Mercado Pago | el checkout de Mercado Pago |

---

## 0. Preparación

- [ ] **0.1 Deploy.** `https://api.staging.menyu-app.com/health` muestra `6597109` o un SHA posterior de `main`. Entre `6597109` y `c782d11` solo cambió `bitacora.md`.
- [ ] **0.2 Mercado Pago conectado.** En el SQL Editor de Supabase staging: `SELECT nombre, mp_user_id IS NOT NULL AS conectado, mp_token_expires_at FROM restaurante WHERE nombre = 'Restaurante Pruebas Auth'`. Tiene que dar `conectado = true` y un vencimiento futuro. Si no, conectarlo con la **cuenta vendedora de prueba**, por API, porque web-admin no tiene pantalla para esto:
  1. Con el token de `caja-owner`: `GET https://api.staging.menyu-app.com/api/payments/mercadopago/oauth/conectar?restauranteId=<id>`. Devuelve `{ "url": … }`.
  2. Abrir esa URL en una ventana donde la sesión de Mercado Pago sea la de la cuenta **vendedora** de prueba y autorizar.
  3. Mercado Pago vuelve a `…/configuracion/pagos?mp=conectado` de web-admin. **Esa ruta no existe en web-admin**: la ruta comodín (`<Route path="*">` de `apps/web-admin/src/App.tsx`) redirige a `/admin`, así que se termina viendo el panel, sin ningún aviso de que se conectó. Es esperable; anotarlo, no es parte de esta pasada.
  4. Repetir la consulta del paso 0.2: `conectado = true`.
- [ ] **0.3 Firma del webhook (opcional).** En Railway, entorno staging, servicio del backend, Variables: existe `MP_WEBHOOK_SECRET`. El valor sale de Mercado Pago: Tus integraciones → la aplicación → Webhooks → Configurar notificaciones → Clave secreta. Cargarla redespliega el backend. Sin ella el pago anda igual, y cada notificación queda con `firma=sin-secreto` en el log. Con ella, el paso 6.4 sirve para decidir el PR C, que exigiría la firma.
- [ ] **0.4 Cajas.** En web-admin como `caja-owner`, en "Cajas": tiene que haber al menos dos cajas activas, por ejemplo "Caja principal" y "Caja barra", de la pasada de #357. Si no, se crean en el paso 2. Anotar **cuál es la más antigua**: `SELECT nombre, created_at, activa FROM caja WHERE restaurante_id = '<id>' ORDER BY created_at`. Ahí tiene que caer el Mercado Pago del comensal.
- [ ] **0.5 Sin turno abierto.** En web-staff como `caja-jefe`, en Caja, se ve el formulario "Abrir turno" y no "Turno abierto". Si hay uno abierto de antes, cerrarlo con cualquier monto declarado.
- [ ] **0.6 Mesas y carta.** **6 mesas** activas, con número "1" a "6", y dos platos: uno de **$1.000** y otro de **$500**. Cada mesa pide **un plato de $1.000**, salvo que el paso diga otra cosa. Las cuentas de abajo suponen eso; con otros precios, rehacerlas.
- [ ] **0.7 Sin sesiones viejas.** En web-staff como `caja-jefe`, en Pagos: "Sin mesas activas", o cerrar las que haya antes de empezar.

## A. Sin turno abierto: no se cobra

- [ ] **1.1 web-staff, MOZO.** El comensal abre la **mesa 1** desde web-cliente y pide un plato. `caja-mozo-a` entra a Pagos. Arriba se ve "No hay un turno abierto: no se pueden registrar pagos hasta que se abra uno.", **sin** el enlace "Abrir turno". El botón "Registrar pago" de la tarjeta está deshabilitado. Si escribe `/mozo/caja` en la barra de direcciones, vuelve al inicio.
- [ ] **1.2 web-staff, JEFE_SALON.** `caja-jefe`, en Pagos: el mismo aviso, **con** el enlace "Abrir turno", que lleva a Caja.
- [ ] **1.3 web-admin, "Registrar pago" sin turno.** Es un límite conocido del #480, y este paso confirma que se ve así. `caja-gerente`, en Pagos, con la **mesa 1** en la lista: se ve "No hay un turno abierto. Mientras no haya uno no se pueden registrar cobros: el turno se abre desde la app del personal, en Caja.". El botón **"Registrar pago" de la tarjeta está habilitado**. Al tocarlo, el modal se abre con "No hay un turno abierto: no se puede registrar el cobro." y "Confirmar pago" está deshabilitado. No se registra nada.
- [ ] **1.4 Mercado Pago sin turno.** El comensal de la **mesa 1** va a "Pagar la cuenta" y toca "Pagar toda la cuenta con Mercado Pago". Ve "El restaurante no está recibiendo pagos por Mercado Pago en este momento" y no sale al checkout. En la base, la sesión no tiene un pago `mercadopago` pendiente nuevo.

## B. Cajas en web-admin (#360)

- [ ] **2.1 Crear.** `caja-owner`, en Cajas, "Agregar caja": crear "Caja prueba 359". Aparece en "Cajas del restaurante" como activa. Un nombre repetido muestra "Ya hay una caja con ese nombre en este restaurante".
- [ ] **2.2 Renombrar.** `caja-gerente` la renombra con "Renombrar" y la vuelve a su nombre. El nombre vacío muestra "Escribí el nombre de la caja".
- [ ] **2.3 Desactivar y activar.** La desactiva: queda "Inactiva" y **no** aparece entre las cajas para abrir el turno en web-staff (paso 3.1). La vuelve a activar y después la deja **inactiva** para el resto de la pasada.
- [ ] **2.4 Quién la ve.** `caja-jefe` y `caja-mozo-a` no entran a web-admin. Al abrir `https://admin.staging.menyu-app.com` con su sesión, web-admin los manda a web-auth, y web-auth los deriva a web-staff, su app. Nunca ven el menú ni la pantalla Cajas.

  Por qué: `RequireAuth` de web-admin exige `tieneAcceso(perfil, 'admin')` (`apps/web-admin/src/App.tsx`), que pide ROOT o una membresía OWNER o GERENTE (`packages/auth-client/src/apps.ts:13`). Si no la hay, `irASuApp()` navega a web-auth (`navegacion.ts:26-27`).

## C. Turno con una caja (#359)

- [ ] **3.1 Abrir con una caja.** `caja-jefe`, en Caja: "Cajas del turno (hasta 2)" lista solo las activas. Elegir solo "Caja principal", con un fondo de $10.000, y "Abrir turno". Se ve "Turno abierto" con "Desde {fecha} · abrió {nombre}". Abrir sin elegir caja muestra "Elegí al menos una caja".
- [ ] **3.2 Cobro con una sola caja.** `caja-mozo-a` cobra la **mesa 1** (la del paso 1.1) en Efectivo, con $100 de propina. El modal **no** pide caja, porque hay una sola. Se ve "Pago registrado · Mesa {N}" y la mesa sale de Pagos.
- [ ] **3.3 Cerrar.** `caja-jefe`, "Cerrar turno": declarar efectivo **fondo + cobro + propina** (con un plato de $1.000: 10.000 + 1.000 + 100 = **$11.100**) y 0 en los demás métodos. "Continuar" muestra "Confirmá el cierre" con lo declarado y "Vas a cerrar el turno y todas sus cajas. No se puede deshacer.". Después de "Cerrar turno" se ve "Turno cerrado", con el arqueo de «Caja principal»: efectivo esperado $11.100 y diferencia $0.

## D. Turno con dos cajas: cobros, movimientos y roles (#359)

- [ ] **4.1 Abrir con dos cajas.** `caja-jefe` abre con "Caja principal" (fondo $10.000) y "Caja barra" (fondo $5.000). En "Mesas por mozo" asigna la mesa 1 a `caja-mozo-a` y la mesa 2 a `caja-mozo-b`. Las mesas 3 a 6 quedan sin mozo: `caja-mozo-a` ve la 1 y de la 3 a la 6; `caja-mozo-b`, la 2 y de la 3 a la 6.
- [ ] **4.2 MOZO contra JEFE_SALON.** El comensal abre las mesas 1 (de nuevo: se cobró en el 3.2), 2 y 3, y pide en cada una.
  - `caja-mozo-a` ve en Pagos las mesas **1 y 3**, no la 2.
  - `caja-mozo-b` ve la **2 y la 3**.
  - `caja-jefe` ve **las tres**, y en Caja tiene "Reasignar mesas". Los mozos no tienen Caja.
- [ ] **4.3 Elegir la caja.** `caja-mozo-a` abre "Registrar pago" en la mesa 1: aparece el selector "Caja". Confirmar sin elegirla muestra "Elegí en qué caja se cobra".
- [ ] **4.4 Los cinco métodos, con caja y propina.** Uno por fila, en este orden. Cada mesa tiene $1.000. Antes de la fila 4, el comensal abre la **mesa 4**. Antes de la fila 5, **vuelve a abrir la mesa 1** (cobrada en la fila 1) y pide otro plato de $1.000.

  | # | Mesa | Método | Caja | Propina | Cobra |
  |---|---|---|---|---|---|
  | 1 | 1 | Efectivo | Caja principal | $200 | `caja-mozo-a` |
  | 2 | 2 | Débito | Caja barra | $150 | `caja-mozo-b` |
  | 3 | 3 | Crédito | Caja principal | $0 | `caja-jefe` |
  | 4 | 4 | Transferencia | Caja barra | $50 | `caja-mozo-b` |
  | 5 | 1 | Mercado Pago (lo registra el mozo, con "ID de transacción (opcional)" vacío) | Caja barra | $0 | `caja-mozo-a` |

  Cada uno muestra "Pago registrado · Mesa {N}". El de Mercado Pago queda en **Caja barra**, la elegida, y no en la más antigua: así funciona Mercado Pago cuando lo registra el personal.
- [ ] **4.5 Movimientos.** `caja-jefe`, en "Movimientos de caja": un Ingreso de $1.500 ("Cambio") y un Egreso de $700 ("Compra de hielo") en Caja principal. Aparecen en la lista. Sin tipo muestra "Elegí si es un ingreso o un egreso"; sin caja, "Elegí la caja".
- [ ] **4.6 Reasignar.** El comensal **vuelve a abrir la mesa 3** (cobrada en la fila 3 del 4.4) y pide. `caja-jefe` mueve la mesa 3 a `caja-mozo-b`. Al recargar, `caja-mozo-a` ya no la ve y `caja-mozo-b` sí. **Esta sesión queda abierta a propósito** hasta el cierre (paso 7.3), para ver el aviso de mesas abiertas.

## E. Cobro con caja en web-admin (#360)

- [ ] **5.1 Cobro con caja y propina.** El comensal abre la **mesa 5** y pide. `caja-gerente`, en Pagos, la cobra en Efectivo, en **Caja barra**, con $300 de propina, atribuido a `caja-mozo-a`. El modal tiene "Caja" y "Propina (opcional)". Los métodos son 4: Efectivo, Débito, Crédito y Transferencia, sin Mercado Pago. Anotar el monto.

## F. Mercado Pago real del comensal (lo que nunca se probó)

- [ ] **6.1 Pagar.** Con el turno de dos cajas abierto, el comensal abre la **mesa 6**, pide un plato de $1.000, va a "Pagar la cuenta" y toca "Pagar toda la cuenta con Mercado Pago". Sale al checkout de Mercado Pago **de producción**: el `init_point` normal, sin sandbox. Paga con la **cuenta compradora de prueba** y una tarjeta de prueba aprobada.
- [ ] **6.2 Vuelta.** Mercado Pago vuelve a web-cliente con "Tu pago fue acreditado con éxito. ¡Gracias por tu visita!". Si vuelve a "Pago en proceso", esperar un minuto: lo que importa es el paso 6.3.
- [ ] **6.3 El webhook aprobó.** En la base: `SELECT estado, monto, turno_caja_id, requiere_revision, motivo_revision FROM pago WHERE sesion_id = '<sesión>' AND metodo = 'mercadopago'`. Tiene que dar un pago `aprobado` de 1000, sin revisión. Su `turno_caja_id` tiene que ser la apertura de la caja **más antigua** del paso 0.4, aunque no sea la primera que se eligió al abrir. La mesa queda libre y la sesión `cerrada`.
- [ ] **6.4 Logs del webhook.** En Railway, logs del backend, buscar `procesarWebhookMercadoPago` y la línea de la firma. Anotar los `tipo=` (`payment`, `merchant_order`) y los `firma=` de cada notificación. Con `MP_WEBHOOK_SECRET` cargada deberían ser `valida` o `invalida`; sin ella, `sin-secreto`. Esto decide el PR C.
- [ ] **6.5 En el resumen.** `caja-jefe`, en Caja, "Resumen del turno": en la sección Mercado Pago, "2 cobro(s): $2.000, y $0 de propina aparte" (el que registró el mozo en la fila 5 del 4.4 y el de la mesa 6), junto a "No entra al arqueo: se acredita en la cuenta de Mercado Pago, no en la caja.". El pago **no** suma en "Cobrado por método".
- [ ] **6.6 Mercado Pago con otro plato pedido después (a confirmar: sale de leer el código).**
  1. El comensal **vuelve a abrir la mesa 4** (cobrada en la fila 4 del 4.4) y pide un plato de $1.000, toca "Pagar toda la cuenta con Mercado Pago" y **no paga todavía**.
  2. Vuelve a la carta y pide otro plato de $500, para un total de $1.500.
  3. Vuelve a la pestaña del checkout y paga los **$1.000** de la preferencia.

  Mirar tres cosas:
  - **El pago registrado** (SQL del paso 6.3): `aprobado`, monto **1000**, en la caja más antigua. La **mesa sigue abierta**, porque 1000 no cubre 1500.
  - **Lo que ve el mozo:** `caja-mozo-a` (la mesa 4 no tiene mozo, así que la ve), en Pagos, "Registrar pago" de la mesa 4. **Anotar el monto que muestra "Total a cobrar"**. Leyendo el código, muestra la suma de los pedidos, **$1.500**, sin restar los $1.000 ya pagados (`totalAcumulado`).
  - **Lo que se cobra:** confirmar el cobro en Efectivo, en **Caja principal**, sin propina. Leyendo el código, el backend cobra **el saldo, $500**, y cierra la mesa. Comprobarlo en la base: dos pagos aprobados, 1000 de Mercado Pago y 500 en efectivo. Si el modal mostró $1.500 y se cobraron $500, **anotarlo como hallazgo de pantalla**: el modal confunde. No se arregla en esta pasada.

## G. Cierre con arqueo y resumen (#359)

- [ ] **7.1 Lo que se ve antes de cerrar.** "Resumen del turno" muestra la propina siempre en su columna, nunca sumada al monto. Mercado Pago no entra en ninguna de las dos tablas. Con todas las mesas en $1.000:

  "Cobrado por método":

  | Método | Cobros | Monto | Propina |
  |---|---|---|---|
  | Efectivo (4.4 fila 1, 5.1 y 6.6) | 3 | $2.500 | $500 |
  | Débito | 1 | $1.000 | $150 |
  | Crédito | 1 | $1.000 | $0 |
  | Transferencia | 1 | $1.000 | $50 |

  "Cobrado por mozo":
  - `caja-mozo-a`: 3 cobros, $2.500 y $500 de propina (la fila 1 del 4.4, el 5.1 a su nombre y el 6.6);
  - `caja-mozo-b`: 2 cobros, $2.000 y $200 de propina;
  - `caja-jefe`: 1 cobro, $1.000 y $0 de propina.

  Mercado Pago: "3 cobro(s): $3.000, y $0 de propina aparte" (la fila 5 del 4.4, el 6.1 y el 6.6).
- [ ] **7.2 El esperado de cada caja.**
  - **Efectivo** = fondo + cobros en efectivo + sus propinas + ingresos − egresos (los movimientos son solo de Caja principal).
  - **Cada otro método** = cobros de ese método en esa caja + sus propinas.
  - **Mercado Pago no cuenta**, ni el del comensal ni el que registró el mozo.

  | Caja | Efectivo | Débito | Crédito | Transferencia |
  |---|---|---|---|---|
  | Caja principal | 10.000 + 1.000 + 200 + 1.500 − 700 + 500 = **$12.500** | $0 | **$1.000** | $0 |
  | Caja barra | 5.000 + 1.000 + 300 = **$6.300** | 1.000 + 150 = **$1.150** | $0 | 1.000 + 50 = **$1.050** |

  Los $500 del 6.6 van a Caja principal porque es la que se elige en ese paso. Si se elige la otra, pasan a Caja barra: principal $12.000 y barra $6.800.
- [ ] **7.3 Cerrar con una diferencia.** `caja-jefe`, "Cerrar turno". El texto dice "Contá lo que hay en cada caja y cargalo sin mirar el sistema. Escribí 0 en los métodos sin movimiento.". Declarar lo del 7.2, pero con **$12.450** en el efectivo de Caja principal ($50 menos). La mesa 3 del 4.6 sigue abierta: se ve "1 mesa(s) abierta(s). Podés cerrar igual, pero sin un turno abierto no se van a poder cobrar hasta que se abra uno nuevo." y deja cerrar.
- [ ] **7.4 Resultado.** "Turno cerrado": "Arqueo de la caja «Caja barra»" y "Arqueo de la caja «Caja principal»", con Método, Esperado, Declarado y Diferencia. Cada esperado coincide con el 7.2, el efectivo de Caja principal tiene diferencia **−$50** y el resto $0. Aparece "Fondo inicial: …" de cada una.

## H. Historial de turnos en web-admin (#360)

- [ ] **8.1 La lista.** `caja-gerente`, en "Turnos de caja": aparecen el turno del paso 3 y el del paso 4, del más nuevo al más viejo, con "Cerrado" y las diferencias del arqueo en palabras, por ejemplo "Efectivo: Faltan $50". Si hay más turnos, "Cargar más" trae los siguientes.
- [ ] **8.2 El detalle.** Abrir el turno del paso 4. Tiene que mostrar:
  - "Cajas del turno", con "Caja barra · Fondo inicial $5.000" y la principal, cada una con su arqueo y sus movimientos (ingreso y egreso en la principal; "Sin movimientos" en la barra);
  - "Resumen de cobros", con "Cobrado por método" y "Cobrado por mozo" iguales al 7.1;
  - la sección "Mercado Pago" ("Informativo: lo cobrado con Mercado Pago se acredita en la cuenta y no entra al arqueo."), con "Pagos de Mercado Pago": tres pagos: el del 6.1 (mesa 6) y el de 1000 del 6.6 (mesa 4), con el **nombre de la caja más antigua**, y el que registró el mozo en la fila 5 del 4.4 (mesa 1), con **Caja barra**;
  - "Mesas asignadas", agrupadas por mozo.
- [ ] **8.3 Turno abierto: arqueo ciego.** Abrir un turno nuevo desde web-staff, con una caja. En web-admin, "Actualizar" lo muestra como "Abierto". Su detalle muestra "El arqueo y el resumen de cobros se ven cuando el turno se cierra" y no muestra totales.
- [ ] **8.4 El historial no se actualiza solo (límite del #480: confirmarlo o descartarlo).** Con la lista abierta en web-admin, cerrar ese turno desde web-staff. **Sin tocar nada**, la lista sigue diciendo "Abierto" (confirmado) o cambia sola (descartado: anotarlo). Con "Actualizar" pasa a "Cerrado".

## I. Limpieza

- [ ] **9.1 Sin turno abierto.** En web-staff, en Caja, el formulario "Abrir turno". Si quedó uno abierto, cerrarlo.
- [ ] **9.2 Sin sesiones activas.** Al menos queda la mesa 3 del 4.6. Cerrar cada sesión que quede con `POST https://api.staging.menyu-app.com/api/sessions/mesa/<mesaId>/cerrar` y el token de `caja-jefe`, como en las pasadas de #357 y #358: responde 200 con `{"ok": true}`, y 404 si la mesa ya no tiene sesión activa. Al final, en web-staff, en Pagos, se ve "Sin mesas activas".
- [ ] **9.3 La caja de prueba** ("Caja prueba 359") queda inactiva.
- [ ] **9.4 El E2E de staging sigue en verde.** Correr a mano el workflow "E2E — staging" desde Actions: confirma que la pasada no le movió nada a la corrida automática.

---

## Si algo falla

Anotar el paso, la hora (ART), la cuenta, lo que se esperaba y lo que pasó, con una captura y, si es del backend, la línea del log de Railway. Un hallazgo no se arregla durante la pasada: se abre un issue, y la pasada sigue con el paso siguiente si no depende del que falló.
