# Datos de prueba y credenciales — entorno local (seed)

**Fuente de verdad:** `apps/backend/prisma/seed.ts`. Todo lo de este documento sale de ahí — si algo no coincide, el seed manda. Para regenerar los datos (o crearlos si la base está vacía):

```bash
pnpm --filter @menyu/api seed
```

---

## Usuarios (login email + password)

| Rol | Email | Password | App / URL |
|---|---|---|---|
| ROOT (bypass total) | `root@menyu.com` | `root1234` | web-admin |
| OWNER (dueño de marca) | `owner@menyu.com` | `owner1234` | web-admin |
| Mozo | `mozo@menyu.com` | `mozo1234` | web-staff |
| Cliente 1 (cuenta registrada) | `cliente1@menyu.com` | `cliente1234` | web-cliente (login, no PIN) |
| Cliente 2 (cuenta registrada) | `cliente2@menyu.com` | `cliente1234` | web-cliente (login, no PIN) |

## Mesas (PIN de ingreso del comensal)

| Mesa | PIN | qrToken |
|---|---|---|
| 99 | `9998` | `TEST-QR-SEED-002` |
| 100 | `9997` | `TEST-QR-SEED-100` |
| 101 | `9996` | `TEST-QR-SEED-101` |

El comensal entra por **web-cliente → Ingresar con PIN**, elige el restaurante del seed y pone el PIN de la mesa (no hace falta escanear el QR real en local).

## Puertos en desarrollo local

| App | Puerto | Notas |
|---|---|---|
| Backend (`@menyu/api`) | `3000` | `http://localhost:3000/api`, Swagger en `/docs` |
| web-cliente | `5176` | Vite asigna el puerto libre más alto de este rango si está ocupado |
| web-staff | `5175` | mozo + cocina |
| web-admin | `5174` | dueño / gerente |

Para levantar todo: `pnpm dev` desde la raíz (turbo corre las 4 apps en paralelo). Ver nota técnica en `modulo-pagos-divididos-sesion5.md` si `pnpm dev` se cuelga mostrando solo el banner de `cmd.exe` sin logs — es un problema puntual de cómo Windows/este entorno lanza el script-shell, no del código.

## Otros datos del seed

- Restaurante y marca del seed usan IDs fijos (`REST_ID`, `MARCA_ID`) definidos al principio de `seed.ts` — no hace falta memorizarlos, los devuelve la API (`/api/marca/publicas`) al elegir restaurante desde el login con PIN.
- El seed no crea ningún `Comensal` — los comensales se crean en tiempo real cuando alguien entra a una mesa y elige su nombre.
