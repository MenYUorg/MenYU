# Datos de prueba — entorno local (seed)

**Fuente de verdad:** `apps/backend/prisma/seed.ts`. Todo lo de este documento sale de ahí — si algo no coincide, el seed manda. Para regenerar los datos (o crearlos si la base está vacía):

```bash
pnpm --filter @menyu/api seed
```

---

## Usuarios

**El seed no crea contraseñas.** Desde la Fase 5 de auth (`docs/auth/specs/auth.md`, 2026-10-26) MenYU no tiene login propio: toda cuenta, del personal o de un cliente, es de Supabase Auth y se inicia en web-auth. En local no hay Supabase Auth, así que para entrar hace falta una cuenta del Supabase de staging (abajo).

| Qué crea el seed | Email | Para qué sirve |
|---|---|---|
| `Usuario` OWNER de Marca Seed (con su `Membresia`) | `owner@menyu.com` | El dueño de Restaurante Seed. Su `supabaseUserId` es ficticio: para entrar con él hay que reemplazarlo por el id de una cuenta real de staging (el seed no lo pisa) |
| `Mozo` "Mozo Seed" de Restaurante Seed, sin cuenta | `mozo@menyu.com` | Invitarlo desde Personal como MOZO engancha este perfil en lugar de crear otro |
| `Cliente` "Cliente Uno", sin cuenta | `cliente1@menyu.com` | Registrarse en web-auth con ese email vincula este `Cliente` (Fase 4b) y se queda con su historial de mesas |
| `Cliente` "Cliente Dos", sin cuenta | `cliente2@menyu.com` | Igual que el anterior |

Para probar el personal en local hace falta una cuenta del Supabase de staging con su `Usuario` y su `Membresia` en tu base. El paso a paso (los `.env.local` de cada app, el backend con `SUPABASE_URL`, y el SQL para insertar las seis cuentas de prueba con su `supabase_user_id`) está en **"Probar la entrega 4.5 en local"** y **"Probar la entrega 4.6 (web-staff) en local"** de [`docs/auth/usuarios-prueba-staging.md`](../docs/auth/usuarios-prueba-staging.md).

El comensal no necesita cuenta: por QR o PIN entra como "Invitado". "Ingresar" y "Registrarme" de web-cliente van a web-auth, y su `/auth` es solo un redirect a web-auth (conserva el `?volver=`).

## Mesas (PIN de ingreso del comensal)

| Mesa | PIN | qrToken |
|---|---|---|
| 99 | `9998` | `TEST-QR-SEED-002` |
| 100 | `9997` | `TEST-QR-SEED-100` |
| 101 | `9996` | `TEST-QR-SEED-101` |
| 1 (Restaurante Seed 2) | `9995` | `TEST-QR-SEED-201` |

El comensal entra por **web-cliente**: en el home (Discovery) elige el restaurante → "Ingresar a una mesa" → "Escanear QR" o, detrás del texto chico "¿Pasó algo con tu cámara?", el PIN de la mesa. No hace falta escanear un QR real en local:

- Ingreso con PIN directo: `http://localhost:5176/restaurante/<id>/mesa?pin` (los ids están más abajo).
- El link que codifica el QR de una mesa: `http://localhost:5176/check-in?restaurantId=<id>&tableCode=<qrToken>`. Por ejemplo, la mesa 100: `http://localhost:5176/check-in?restaurantId=22222222-2222-4222-a222-222222222222&tableCode=TEST-QR-SEED-100`.

| Restaurante | id |
|---|---|
| Restaurante Seed | `22222222-2222-4222-a222-222222222222` |
| Restaurante Seed 2 | `eeeeeeee-0002-4002-a002-000000000002` |

## Puertos en desarrollo local

| App | Puerto | Notas |
|---|---|---|
| Backend (`@menyu/api`) | `3000` | `http://localhost:3000/api`, Swagger en `/docs` |
| web-cliente | `5176` | Vite asigna el puerto libre más alto de este rango si está ocupado |
| web-staff | `5175` | mozo + cocina |
| web-admin | `5174` | dueño / gerente |
| web-auth | `5173` | el login de todo el personal (Fase 3 de auth) |

Para el personal hay que abrir las apps por `*.menyu.local` y no por `localhost`: la sesión vive en una cookie de dominio compartido, que `localhost` no admite. Vite tiene que escuchar en IPv4 (`exec vite --host 127.0.0.1 --strictPort --port <n>`).

Para levantar todo: `pnpm dev` desde la raíz (turbo corre las 4 apps en paralelo). Ver nota técnica en `modulo-pagos-divididos-sesion5.md` si `pnpm dev` se cuelga mostrando solo el banner de `cmd.exe` sin logs — es un problema puntual de cómo Windows/este entorno lanza el script-shell, no del código.

## Otros datos del seed

- Restaurante y marca del seed usan IDs fijos (`REST_ID`, `MARCA_ID`) definidos al principio de `seed.ts`. No hace falta memorizarlos: la API los devuelve en `GET /api/discovery`, que es lo que lista el home de web-cliente.
- Hay una segunda marca ("Marca Seed 2") con "Restaurante Seed 2" y una mesa (PIN `9995`), sin logo ni menú. Sirve para probar los permisos entre marcas y el caso de un restaurante sin logo.
- Los dos restaurantes tienen dirección cargada y ninguno tiene logo: se sube desde web-admin, en "Marca y sucursales" (solo OWNER). El seed solo carga la dirección si el restaurante todavía no tiene una.
- Dos ítems de "Restaurante Seed" vienen en descuento: **Milanesa Napo** ($4.200 → $3.360, 20 %) y **Cerveza Artesanal** ($2.600 → $1.950, 25 %). Los pedidos de esos ítems se cobran al precio con descuento. Solo se cargan si el ítem todavía no tiene un descuento, así que volver a correr el seed no pisa uno cargado a mano; se sacan o se cambian desde web-admin (Menú) con OWNER o GERENTE. ROOT no puede.
- En el home de web-cliente (`/`) se ven los dos restaurantes y las ofertas del seed (Milanesa Napo y Cerveza Artesanal; si se cargó otro descuento a mano, también ese). **Restaurante Seed 2 no tiene menú**: sirve para ver la carta vacía de `/restaurante/<id>/carta` (dice "Este restaurante todavía no cargó su carta"). Como ninguno tiene logo, el header y el menú lateral muestran el de MenYu hasta que se suba uno desde web-admin.
- Para probar el modo seguro (el anfitrión ve un código de 3 dígitos y los demás lo piden) hay que pasar el restaurante a modo `seguro`: desde web-admin, en Mesas (con OWNER o GERENTE), o con `modo_sesion` en la base. El seed lo deja en `abierto`.
- El seed no crea ningún `Comensal` — los comensales se crean en tiempo real cuando alguien entra a una mesa y elige su nombre.
