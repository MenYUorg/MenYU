# @menyu/api

Backend NestJS + Prisma de MenYu.

## Base de datos local (Docker)

Para desarrollar migraciones sin tocar el Supabase de QA, el backend trae un
Postgres local en Docker. El `.env` (no versionado) apunta por defecto a esa
base local: un olvido pega en local, nunca en QA.

### Levantar la base

```bash
cd apps/backend
docker compose up -d          # postgres 17.6 en localhost:5433
docker compose ps             # esperar STATUS = healthy
```

El contenedor es `menyu-postgres` y persiste en el volumen `menyu-pgdata`.
Para borrar todo y arrancar de cero: `docker compose down -v`.

### Bootstrap en dos comandos

Con la base en healthy, desde `apps/backend`:

```bash
npx prisma migrate deploy     # aplica las migraciones existentes
pnpm prisma db seed           # carga los datos de prueba
```

Usar `migrate deploy`, no `migrate dev`: `dev` genera migraciones nuevas a
partir del schema, que no es lo que se busca al inicializar un entorno.

### Credenciales del seed

Solo para el entorno local.

| Rol | Email | Password |
|---|---|---|
| Admin ROOT | root@menyu.com | root1234 |
| Admin OWNER | owner@menyu.com | owner1234 |
| Mozo | mozo@menyu.com | mozo1234 |
| Cliente 1 | cliente1@menyu.com | cliente1234 |
| Cliente 2 | cliente2@menyu.com | cliente1234 |

Mesas: número 99 (pin 9998), 100 (pin 9997), 101 (pin 9996).
Menú: 3 categorías (Entradas, Principales, Bebidas) con 9 ítems de precios
distintos entre sí, pensados para testear división de cuenta por consumo.

El seed es idempotente (upserts con IDs fijos), se puede correr las veces que
haga falta. No siembra sesiones ni pedidos.

### Apuntar a QA puntualmente

Las credenciales de QA viven en `.env.qa` (ignorado por git). No se pisa el
`.env`: se pasan las variables en línea, válidas solo para ese comando.

**Hay que pisar `DATABASE_URL` _y_ `DIRECT_URL`.** El datasource de
`schema.prisma` declara las dos, y los comandos de `migrate` usan `directUrl`.
Pisando solo `DATABASE_URL`, `migrate status` sigue leyendo la base **local**
del `.env` mientras aparenta reportar QA: no falla, miente.

Git Bash:

```bash
DATABASE_URL="$(grep '^DATABASE_URL=' .env.qa | cut -d= -f2- | tr -d '"')" \
DIRECT_URL="$(grep '^DIRECT_URL=' .env.qa | cut -d= -f2- | tr -d '"')" \
  npx prisma migrate status
```

PowerShell:

```powershell
$env:DATABASE_URL = ((Select-String '^DATABASE_URL=' .env.qa).Line -replace '^DATABASE_URL=', '' -replace '"', '')
$env:DIRECT_URL   = ((Select-String '^DIRECT_URL=' .env.qa).Line -replace '^DIRECT_URL=', '' -replace '"', '')
npx prisma migrate status
Remove-Item Env:\DATABASE_URL
Remove-Item Env:\DIRECT_URL
```

Las dos recetas toleran passwords con caracteres especiales (`@`, `#`, `?`):
el valor se toma entero desde el primer `=` en adelante y nunca se expande en
el shell sin comillas.

Verificar el host antes de creerle al resultado — tiene que decir
`...supabase.com`, no `localhost:5433`:

```
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-1-...pooler.supabase.com:5432"
```

`dotenv` no pisa variables ya presentes en el entorno, así que el valor en
línea gana sobre el del `.env`.

Contra QA, correr solo comandos de lectura (`migrate status`). Un
`migrate deploy` o un `db seed` contra QA impacta a todo el equipo.

### Cómo verificar contra qué base vas a correr

`prisma db execute` no devuelve filas, así que no sirve para confirmar el
destino. Este comando sí, y no imprime credenciales:

```bash
npx prisma migrate status
# → Datasource "db": PostgreSQL database "menyu", schema "public" at "localhost:5433"
```

El host que imprime es el de `DIRECT_URL`, no el de `DATABASE_URL`: es el que
`migrate` va a usar de verdad.

### Notas

- `NODE_ENV` debe ser `development` en local: con `production`,
  `prisma.service.ts` fuerza SSL y la conexión al contenedor falla.
- `prisma.config.ts` pisa la config de `package.json#prisma`. El `seed` sigue
  tomándose de `package.json` (Prisma lo resuelve igual), pero de cara a
  Prisma 7 conviene migrarlo a `migrations.seed` en `prisma.config.ts`.
- En Windows, `pnpm dev` (`nest start --watch`) puede abrir una shell
  interactiva en vez de arrancar cuando se lo ejecuta sin TTY (background,
  CI). `npx nest start` funciona en ese caso.
