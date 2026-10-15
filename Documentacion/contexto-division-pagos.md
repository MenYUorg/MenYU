# Contexto — División de pagos (MenYU)

Documento para retomar el trabajo. Leelo entero antes de tocar código.

---

## Dónde estamos

**Rama:** `feat/division-pagos-ui`, creada desde `origin/main` (`376b071`, con el PR #345 ya mergeado).

**El backend está terminado y mergeado.** Lo que queda es el frontend de `web-cliente`, más un bloque aparte de `web-staff` que todavía no arrancó.

**Nada de lo que está en el working tree está commiteado.** Los commits los hace Coty, no vos.

---

## Entorno local

La base de desarrollo es un Postgres en Docker, **no** el Supabase de QA. El `.env` de `apps/backend` apunta por defecto a local justamente para que un olvido pegue ahí y no en la base compartida.

```bash
cd apps/backend
docker compose up -d          # postgres:17.6 en localhost:5433
npx prisma migrate deploy
pnpm prisma db seed
npx nest start                # NO pnpm dev: en Windows sin TTY no arranca
```

Nunca pases `DATABASE_URL` ni `DIRECT_URL` en línea salvo que se pida explícitamente pegarle a QA.

Credenciales del seed: `root@menyu.com`/`root1234`, `owner@menyu.com`/`owner1234`, `mozo@menyu.com`/`mozo1234`, `cliente1@menyu.com`/`cliente1234`. Mesas 99 (PIN 9998), 100 (9997), 101 (9996). Menú de 9 ítems con precios distintos entre sí, pensados para que cualquier monto de una división sea rastreable.

La base local es descartable. Resetearla (`docker compose down -v` o `prisma migrate reset --force`) es seguro y se hizo varias veces.

---

## Backend ya mergeado (PR #345)

### Schema

- `SesionMesa.cantidadComensales Int?` — cantidad declarada de comensales
- `Restaurante.divisionPagosHabilitada Boolean @default(true)` — flag por restaurante
- `Comensal.creadoPorComensalId String?` — quién creó esta etiqueta
- `Comensal.nombreNormalizado String` + `@@unique([sesionId, nombreNormalizado])` — unicidad de nombre case-insensitive por sesión

La columna materializada se usa en vez de un índice funcional sobre `lower(nombre)` porque Prisma no modela índices funcionales y eso generaría drift permanente. El service la llena con `nombre.trim().toLowerCase()`.

### Reglas de negocio implementadas

**Congelamiento.** Una sesión está congelada cuando tiene al menos un `Pago` con estado `'aprobado'`. Congelada:

- no se crean comensales (ni auto-registro ni etiquetas manuales) → 409
- no se borran comensales → 409
- no se modifica `cantidadComensales` → 409
- no se desetiqueta nada → 409
- **sí** se puede etiquetar un ítem huérfano (sin ninguna etiqueta), pero solo hacia un comensal que no tenga pago aprobado

**Divisor:** `Math.max(cantidadComensales ?? 0, comensales.length)`. Si se crean más etiquetas que la cantidad declarada, el divisor sube solo, sin error.

**Borrado de comensal:** solo el creador. El solicitante manda su `comensalId` como query param y se compara contra `creadoPorComensalId`. Los `ItemComensal` del borrado se eliminan (los ítems vuelven a la bolsa común). No se puede borrar un auto-registrado (`creadoPorComensalId === null`) ni uno con pago aprobado.

**Reclamo con PIN.** Existe porque una sesión congelada bloquea el auto-registro: si alguien cierra la pestaña y vuelve, no puede entrar. `POST /sesiones/:sesionId/comensales/reclamar` con `{ nombre, pin }` devuelve el comensal existente + `tienePagoAprobado`. Un único 404 genérico para PIN incorrecto, nombre inexistente y sesión no activa, para no filtrar cuál falló.

**`modoDivision`** se fija al crear el primer pago, con `updateMany({ where: { id, modoDivision: null } })`. Si afecta 0 filas, otro ganó la carrera y se relee. Sin Serializable, sin retry. Si el segundo comensal pide otro modo, se ignora y se usa el ya fijado.

**`calcularPartesIguales` ya no depende de `esOwner`.** El resto de centavos cae en `comensales[0]` (ordenado por `createdAt asc`). El motivo: el slot de anfitrión se consume en `sessions.open()` antes de que la persona ponga su nombre, así que puede no cumplirse nunca y esa mesa quedaría sin poder dividir.

**`division/por-consumo` ya no tira 400** con ítems sin etiquetar. Devuelve las partes igual, más `huerfanos: { items, totalCentavos, total }`.

### Shapes

```ts
PartesIgualesResult { divisionPagosHabilitada, divisor, partes }
PorConsumoResult    { divisionPagosHabilitada, divisor, partes, huerfanos }
ParteComensal       { comensalId, nombre, montoCentavos, monto }
```

`partes` **no incluye el detalle de ítems por comensal**. Para armar el mensaje por consumo con el desglose, hay que usar los datos de `useEtiquetado`, no `pagoStore`.

---

## Trabajo sin commitear en esta rama

### Frontend

- **`src/theme.ts`** (nuevo): paleta `C` compartida. `PagarPage`, `EtiquetarPedidosPage` y `ElegirNombrePage` importan de ahí en vez de declararla local. `borderFocus` se descartó por ser código muerto; `orangeHover` se conservó porque se usa en otros tres archivos.
- **`services/api.ts`**: agregados `comensales.reclamar`, `comensales.setCantidadComensales`, `comensales.borrarComensal`, y el namespace `sesiones.saldo`.
- **`ElegirNombrePage`**: el input usa `C.borderInput` en vez del literal hardcodeado.

### Backend

- **`division.service.ts`**: `calcularTotalSesion` ahora es público y vive acá (se mudó desde `payments.service.ts`); nuevo `obtenerSaldo`; `calcularPartesIguales` dejó su copia inline y usa la compartida.
- **`payments.service.ts`**: borrado el `calcularTotalSesion` privado, los 3 call sites apuntan a `divisionService.calcularTotalSesion`.
- **`sesion-saldo.controller.ts`** (nuevo): `GET /sesiones/:sesionId/saldo` → `{ totalSesion, totalCobrado, saldoPendiente }`. `saldoPendiente` nunca negativo, sin throw en 0. Registrado en `ComensalesModule`. Es superficie del comensal, no confundir con `SessionsController` (staff).

Los cinco casos de prueba del endpoint pasaron, incluido el de pedido cancelado (excluido correctamente del total).

---

## Diseño acordado del frontend

```
PagarPage (la original, sin selector de modo inline) + [Dividir la cuenta]
├── Dividir en dispositivo        ← oculto si divisionPagosHabilitada es false
│   │                               o si modoDivision ya está fijado
│   ├── Partes iguales → /dividir/cantidad → /pagar
│   └── Por consumo    → /etiquetar → /pagar
└── Generador de mensaje          ← siempre visible
    ├── Partes iguales → /dividir/cantidad → /dividir/mensaje
    └── Por consumo    → /etiquetar → /dividir/mensaje
```

**Decisiones cerradas, no re-discutir:**

- Modal para "Dividir la cuenta" sobre `/pagar`. Dos rutas nuevas: `/dividir/cantidad` y `/dividir/mensaje`. `/etiquetar` se reusa.
- La intención viaja como `?destino=pagar|mensaje`. La cantidad viaja a `/dividir/mensaje` como `?cantidad=N`.
- **El selector de cantidad persiste (`PATCH cantidad-comensales`) solo en la rama `pagar`.** En la rama `mensaje` queda en estado local, sin tocar el backend — así el mensaje sigue funcionando con la sesión congelada, que es el caso de "pago todo yo y después les mando el detalle".
- El piso del stepper por comensales registrados aplica **solo** en `destino=pagar`.
- Con `modoDivision` ya fijado: se oculta "Dividir en dispositivo" y queda un botón directo "Armar mensaje", sin modal.
- Formato de moneda: como está hoy (`$16100.00`).
- La pantalla del mensaje termina con un botón "Pagar toda la cuenta" (`comensalId: null`), para que el orden natural funcione.
- Al reclamar con `tienePagoAprobado: true`, el destino es la pantalla de "gracias por su visita" (`GraciasCard`).
- Usar la paleta de `src/theme.ts`, no declarar locales.

**Riesgo a respetar:** si los botones de pago de `PagarPage` pasan a llamar con `comensalId: null` por defecto, el copy tiene que decir **"Pagar toda la cuenta"**, no "Pagar". Es plata real: alguien puede pagar la mesa entera creyendo que paga su parte.

---

## Qué falta, en orden

1. **`/dividir/cantidad`** — selector de cantidad. Diseño ya aprobado, listo para escribir.
2. **`/dividir/mensaje`** — generador. Necesita `useEtiquetado` para el desglose por ítem, no alcanza `pagoStore`.
3. **Modal "Dividir la cuenta"** y reestructuración de `PagarPage` (sacar el selector de modo inline).
4. **Creación de etiquetas** en `EtiquetarPedidosPage` (el backend ya lo soporta vía `creadoPorComensalId`).
5. **Reclamo con PIN** en `ElegirNombrePage`: si `crearComensal` devuelve 409, revelar un campo de PIN y ofrecer recuperar.
6. **Bloque aparte: `web-staff`.** El mozo tiene que ver todas las cuentas de la mesa y poder cobrar una sola.

---

## Deuda técnica anotada (no resolver sin pedirlo)

**El bug del cierre de mesa.** `sessions.service.ts:615` (`registrarCobro`) calcula el total **sin filtrar pedidos cancelados y sin respetar `cantidadEditada`**. Con un pedido cancelado de $2300, el mozo cobraría $4000 en vez de $1700, y el cierre de la sesión se dispara contra un número inflado. Es el candidato principal del síntoma "te cierra la mesa cuando uno solo paga". Va con el bloque de `web-staff`.

**Fórmulas de total de sesión.** Había seis; dos se fusionaron en `calcularTotalSesion`. Quedan cuatro con drift: `registrarCobro`, `getSesiones` (caja), `reportes.service.ts`, y el total client-side de `PagarPage`. Las tres primeras muestran números; solo `registrarCobro` cobra.

**No existe endpoint para cancelar un pedido.** `'cancelado'` se lee en todos lados pero nunca se escribe. Probablemente por eso el drift de arriba no explotó todavía.

**Seguridad:**
- Los 8+ endpoints de `ComensalesController` no tienen ningún guard. El borrado por creador es falsificable mientras siga así.
- Los 4 endpoints `/api/auth/dev/*` están abiertos en Railway sin guard. `POST /api/auth/dev/root` devuelve un admin ROOT con tokens a cualquiera.
- No hay rate limiting en ningún lado. El PIN de mesa es de 4 dígitos y `/sessions/open` lo acepta sin límite de intentos.
- Se filtró un fragmento de la password de Supabase de QA; rotarla sigue pendiente.

**Agujero del congelamiento:** si la sesión está congelada y alguien pide más comida, el total sube pero el divisor está congelado y hay gente que ya pagó. Nadie cubre lo nuevo.

**Otros:**
- El `upsert` de pago pisa un pago `'aprobado'` si se vuelve a llamar, devolviéndolo a `'pendiente'`. No verificado si algo aguas arriba lo impide.
- `montoParaComensal` corre dentro de `$transaction` pero con `this.prisma`, así que toma una conexión distinta del pool. Aceptado conscientemente. Si aparecen timeouts en pagos concurrentes, mirar ahí.
- `GraciasCard.tsx` tiene su propia copia de la paleta, quedó fuera de la migración a `theme.ts`.
- El segundo diálogo de `App.tsx` ("Sesión finalizada", `setSesionCerrada`) es código muerto: nunca se dispara.
- `api.payments.initiate` apunta a un endpoint que ya no existe en el backend.
- `DIRECT_URL` en `.env.qa` apunta al pooler igual que `DATABASE_URL`, así que no cumple su función de saltear PgBouncer.
- `prisma.config.ts` pisa `package.json#prisma`; el seed funciona igual pero hay que migrarlo a `migrations.seed` antes de Prisma 7.

**Estado de infraestructura:** Railway está caído (trial vencido), así que el deploy de staging no corre. La migración `20260906183320_division_pagos_campos` se aplicó a mano en Supabase, con su registro en `_prisma_migrations` y el checksum real, así que Railway no la va a reaplicar cuando vuelva. Para aplicarla hubo que vaciar la tabla `comensal` en QA (143 filas del backfill de agosto, con hasta 36 "Invitado" en una misma sesión) porque el índice único habría fallado; los 139 pagos quedaron intactos con `comensal_id` en NULL.

---

## Cómo trabajar

- **Mostrá el diff antes de aplicar** cuando se pida. Ya pasó dos veces que se aplicó primero y se mostró después.
- Diagnóstico de solo lectura antes de cada bloque, y esperar el OK antes de escribir.
- `npx tsc --noEmit` (backend y frontend según corresponda) después de cada cambio.
- Probar con curl contra la base local antes de dar algo por terminado.
- No commitear. Los commits los hace Coty.
- Si algo del diagnóstico contradice lo que dice este documento, decilo en vez de asumir que el documento tiene razón. Ya pasó: este documento afirmaba que `modoDivision` no se escribía nunca, y resultó que sí se escribía en dos lugares duplicados.
