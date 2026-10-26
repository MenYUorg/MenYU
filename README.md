# MenYU  

Repositorio del proyecto integrador de la carrera de Ingeniería en Sistemas de la Universidad Católica de Córdoba.

**Integrantes:**
- Margarita De Marcos  
- Dante Ojeda  
- Constanza Strumia  

---

> CI/CD configurado con GitHub Actions.

## Pruebas: un comando por tipo

Desde la raíz, después de `pnpm install`.

| Tipo | Comando | Qué necesita |
|---|---|---|
| Unitarias | `pnpm test:unitarias` | Nada. Los mismos paquetes que el paso Test de `ci.yml`, más los tests de `scripts/` |
| Integración | `pnpm test:integracion` | Docker levantado. Crea un Postgres 17.6 descartable en el puerto 5434 (`E2E_PG_PORT` para cambiarlo), aplica las migraciones, revisa el drift, corre los e2e del backend y borra el contenedor (`apps/backend/scripts/e2e-local.mjs`) |
| Smoke | `pnpm test:smoke` | Un `.env.smoke` en la raíz (no se commitea) con `SMOKE_API_URL`, `WEB_ADMIN_URL`, `WEB_CLIENTE_URL`, `WEB_STAFF_URL` y `WEB_AUTH_URL`. Solo lectura |
| Stress (k6) | `pnpm carga:stress -f confirmar=si` | `gh` con permiso para disparar workflows. Corre `carga-k6.yml` contra staging (unos 12 min). Sin `-f confirmar=si` no carga staging: el primer paso del workflow corta (`carga-k6.yml:38-43`) |
| Soak (k6) | `pnpm carga:soak -f confirmar=si` | Igual que stress (unos 33 min) |

`pnpm test:todo` corre unitarias, integración y smoke, en ese orden, y corta en la primera que falla. La carga queda afuera: es larga y le pega a staging. Para el humo de k6: `pnpm carga:humo -f confirmar=si`. Proceso y umbrales de k6: `docs/calidad/k6.md`.
