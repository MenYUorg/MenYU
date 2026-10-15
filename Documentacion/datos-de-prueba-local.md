# Datos de prueba y credenciales — entorno local (seed)

**Fuente de verdad:** `apps/backend/prisma/seed.ts`. Todo lo de este documento sale de ahí — si algo no coincide, el seed manda. Para regenerar los datos (o crearlos si la base está vacía):

```bash
pnpm --filter @menyu/api seed
```

---

## Usuarios (login email + password)

| Rol | Email | Password | App / URL |
|---|---|---|---|
| ROOT (administración general) | `root@menyu.com` | `root1234` | web-admin |
| OWNER (dueño de marca) | `owner@menyu.com` | `owner1234` | web-admin |
| GERENTE (de Restaurante Seed) | `gerente@menyu.com` | `gerente1234` | web-admin |
| OWNER de Marca Seed 2 | `owner2@menyu.com` | `owner21234` | web-admin |
| Mozo | `mozo@menyu.com` | `mozo1234` | web-staff |
| Cliente 1 (cuenta registrada) | `cliente1@menyu.com` | `cliente1234` | web-cliente (login, no PIN) |
| Cliente 2 (cuenta registrada) | `cliente2@menyu.com` | `cliente1234` | web-cliente (login, no PIN) |

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

Para levantar todo: `pnpm dev` desde la raíz (turbo corre las 4 apps en paralelo). Ver nota técnica en `modulo-pagos-divididos-sesion5.md` si `pnpm dev` se cuelga mostrando solo el banner de `cmd.exe` sin logs — es un problema puntual de cómo Windows/este entorno lanza el script-shell, no del código.

## Otros datos del seed

- Restaurante y marca del seed usan IDs fijos (`REST_ID`, `MARCA_ID`) definidos al principio de `seed.ts`. No hace falta memorizarlos: la API los devuelve en `GET /api/discovery`, que es lo que lista el home de web-cliente.
- Hay una segunda marca ("Marca Seed 2") con "Restaurante Seed 2" y una mesa (PIN `9995`), sin logo ni menú. Sirve para probar los permisos entre marcas y el caso de un restaurante sin logo.
- Los dos restaurantes tienen dirección cargada y ninguno tiene logo: se sube desde web-admin, en "Marca y sucursales" (solo OWNER). El seed solo carga la dirección si el restaurante todavía no tiene una.
- Dos ítems de "Restaurante Seed" vienen en descuento: **Milanesa Napo** ($4.200 → $3.360, 20 %) y **Cerveza Artesanal** ($2.600 → $1.950, 25 %). Los pedidos de esos ítems se cobran al precio con descuento. Solo se cargan si el ítem todavía no tiene un descuento, así que volver a correr el seed no pisa uno cargado a mano; se sacan o se cambian desde web-admin (Menú) con OWNER o GERENTE. ROOT no puede.
- En el home de web-cliente (`/`) se ven los dos restaurantes y las ofertas del seed (Milanesa Napo y Cerveza Artesanal; si se cargó otro descuento a mano, también ese). **Restaurante Seed 2 no tiene menú**: sirve para ver la carta vacía de `/restaurante/<id>/carta` (dice "Este restaurante todavía no cargó su carta"). Como ninguno tiene logo, el header y el menú lateral muestran el de MenYu hasta que se suba uno desde web-admin.
- Para probar el modo seguro (el anfitrión ve un código de 3 dígitos y los demás lo piden) hay que pasar el restaurante a modo `seguro`: desde web-admin, en Mesas (con OWNER o GERENTE), o con `modo_sesion` en la base. El seed lo deja en `abierto`.
- El seed no crea ningún `Comensal` — los comensales se crean en tiempo real cuando alguien entra a una mesa y elige su nombre.
