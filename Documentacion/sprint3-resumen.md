# Sprint 3 — QR + Menú

**Sprint:** S3 · Issue épica #3  
**Equipo:** De Marcos (margarita0912) · Ojeda (lautiod) · Strumia Carrara (CotyStrumia)  
**Fecha:** Mayo 2026 (PRs #215 → #237)  
**Estado:** Done

---

## Índice

1. [Objetivo del sprint](#1-objetivo-del-sprint)
2. [Actividades y responsables](#2-actividades-y-responsables)
3. [#44 — Módulo SesionMesa: apertura por QR token y PIN alfanumérico](#3-44--módulo-sesionmesa-apertura-por-qr-token-y-pin-alfanumérico)
4. [#46 — Integrar html5-qrcode para versión web (sin app)](#4-46--integrar-html5-qrcode-para-versión-web-sin-app)
5. [#47 — Módulo Menú: categorías, ítems, fotos e ingredientes](#5-47--módulo-menú-categorías-ítems-fotos-e-ingredientes)
6. [#48 — Admin: gestión completa del catálogo](#6-48--admin-gestión-completa-del-catálogo)
7. [#50 — Swagger: endpoints de auth y menú documentados](#7-50--swagger-endpoints-de-auth-y-menú-documentados)
8. [#49 — Tests de sesión y menú](#8-49--tests-de-sesión-y-menú)
9. [Decisiones de diseño transversales](#9-decisiones-de-diseño-transversales)
10. [Problemas encontrados y resoluciones](#10-problemas-encontrados-y-resoluciones)

---

## 1. Objetivo del sprint

Implementar el flujo central de la plataforma: apertura de sesión de mesa vía QR o PIN, el módulo completo del menú (backend + panel admin), documentación de la API con Swagger, y tests de integración end-to-end para el módulo de sesiones. Al cierre del sprint el flujo QR → PIN → menú debía funcionar de punta a punta.

---

## 2. Actividades y responsables

| # | Actividad | Responsable |
|---|---|---|
| #44 | Módulo SesionMesa: apertura por QR token y PIN alfanumérico | De Marcos |
| #46 | Integrar html5-qrcode para versión web (sin app) | De Marcos |
| #47 | Módulo Menú: categorías, ítems, fotos (Supabase Storage), ingredientes | Strumia Carrara |
| #48 | Admin: gestión completa del catálogo | Strumia Carrara |
| #50 | Swagger: endpoints de auth y menú documentados | Ojeda |
| #49 | Tests de sesión y menú | De Marcos |

---

## 3. #44 — Módulo SesionMesa: apertura por QR token y PIN alfanumérico

**Responsable:** De Marcos  
**PR:** #224 (`feat/sesion_mesa_QRs_y_PINS`) · commit `feat de sesion de mesa por qr y pin` — mayo 2026  
**Tamaño:** 16 archivos, +822 líneas

### Decisiones previas a la implementación

Antes de escribir código se acordaron las siguientes definiciones de diseño:

- **Formato del QR:** URL completa `menyu.app/check-in?restaurantId=UUID&tableCode=UUID`. Token fijo por mesa (no cambia salvo regeneración manual).
- **PIN como alternativa:** código de 4 dígitos, único dentro del restaurante. Restricción compuesta `(restauranteId, pin)` en la DB.
- **Sesión compartida multi-cliente:** tabla intermedia `SesionMesaCliente` para que múltiples comensales se unan a la misma sesión de mesa sin crear sesiones duplicadas.
- **Modos de sesión:** campo `modoSesion` en `Restaurante` — `'abierto'` (cualquiera con el PIN puede unirse) o `'seguro'` (solo el primer cliente que abre, los demás deben ser invitados).
- **Identidad del cliente:** si el request incluye JWT válido → se reutiliza el `clienteId` existente en lugar de crear un cliente nuevo.

### Cambios en la base de datos

Dos migraciones aplicadas:

**`add_pin_to_mesa`:**
- `Mesa`: campo `pin String NOT NULL` con índice único compuesto `(restauranteId, pin)`.
- `SesionMesa`: campo `codigoSesion` para identificar la sesión del lado del cliente.

**`add_sesionmesacliente`:**
- Nueva tabla `SesionMesaCliente` — `sesionId`, `clienteId`, `orden`, `ingresadoEn`.
- `PedidoItem`: campo `clienteId` nullable (para atribuir qué cliente pidió qué ítem en sesión compartida).
- `Restaurante`: campo `modoSesion String @default("abierto")`.

### Backend

**Módulo `sessions/`** — nuevo:
- `sessions.module.ts`, `sessions.service.ts`, `sessions.controller.ts`
- Endpoint `POST /sessions/open` público (sin auth): recibe `restauranteId` + `qrToken` o `pin`, devuelve `{ sesionId, esAnfitrion, codigoSesion, jwt }`.
- El JWT de sesión es distinto del JWT de usuario — autentica la mesa, no al cliente.

**Módulo `mesas/`** — actualizado:
- `generatePin()` — genera un PIN de 4 dígitos aleatorio y único dentro del restaurante.
- `PATCH /mesas/:id/pin` — regenera el PIN de una mesa específica.
- Corrección de `generateQr()` — ahora usa `qrBaseUrl` del restaurante en lugar de una URL hardcodeada.

**Módulo `restaurante/`** — actualizado:
- `modoSesion` agregado al DTO de actualización (`UpdateRestauranteDto`).

### Frontend — `apps/cliente/`

**`src/app/check-in.tsx`** — pantalla de apertura de sesión con **tres modos**:
1. **URL directa:** el usuario llegó via deep link con `restaurantId` y `tableCode` en la URL — abre sesión automáticamente.
2. **Escaneo QR con html5-qrcode:** activa la cámara y decodifica el QR para extraer los parámetros.
3. **PIN manual:** input de 4 dígitos + `restauranteId`, para cuando no hay cámara o QR disponible.

**`src/store/sessionStore.ts`** — Zustand con persistencia:
- Campos: `sesionId`, `jwt`, `mesaId`, `restauranteId`, `codigoSesion`, `esAnfitrion`.
- Persiste en `sessionStorage` para sobrevivir recargas sin perder la sesión activa.

---

## 4. #46 — Integrar html5-qrcode para versión web (sin app)

**Responsable:** De Marcos  
**Implementación:** incluida en PR #224 · fix de dependencia por Ojeda en PR #237

### Qué se hizo

La app cliente de Expo corre también como web app. En la versión web no se puede usar el scanner nativo de Expo (`expo-camera`), por lo que se integró `html5-qrcode` — librería JavaScript que accede a la cámara del navegador y decodifica QRs.

**Implementación en `check-in.tsx`:**
- La pantalla detecta si está en modo web (`Platform.OS === 'web'`).
- En web: monta un div con id `qr-reader` y lanza `Html5QrcodeScanner`. Al decodificar un QR válido, extrae `restaurantId` y `tableCode`, llama a `openSession()` y navega al menú.
- En nativo: usa el scanner de Expo (implementado en sprints posteriores).

**Fix de dependencia (Ojeda — PR #237):**
- `html5-qrcode` no estaba declarado explícitamente en `apps/cliente/package.json`, solo como import en el código. Esto causaba que el build de Cloudflare Pages fallara. Se agregó como dependencia explícita y se actualizó el lockfile.
- Se alineó el script de export de Expo a `--platform web` para que Cloudflare Pages solo buildee la versión web (sin intentar compilar módulos nativos de iOS/Android).

---

## 5. #47 — Módulo Menú: categorías, ítems, fotos e ingredientes

**Responsable:** Strumia Carrara  
**PR:** #215 (`feat/menu`) · commit `modulo menu con carga de imagenes listo`  
**Documentación detallada:** `Documentacion/modulo-menu.md` (sección backend)

### Qué se hizo

Se implementaron cuatro módulos NestJS que forman el catálogo del menú:

**`ingredientes/`** — CRUD completo de ingredientes por restaurante. Validación de nombre duplicado (case-insensitive). Protección contra borrado si el ingrediente está asociado a ítems del menú.

**`categorias/`** — CRUD de categorías y subcategorías en un único módulo. Las subcategorías se exponen como rutas anidadas (`/categorias/:categoriaId/subcategorias`). El `findAll` devuelve categorías con sus subcategorías incluidas en un solo request.

**`items/`** — CRUD de ítems del menú. Los ítems pertenecen a la **marca** (compartido entre sucursales), no al restaurante. Validación cruzada de subcategoría, protección contra borrado con pedidos históricos, endpoints de upload/delete de imagen.

**`storage/`** — servicio compartido que encapsula el cliente de Supabase Storage. Operaciones `uploadFile` y `deleteFile`. Los errores de Supabase se convierten en `InternalServerErrorException`.

**Fotos de ítems (Supabase Storage):**
- Bucket `menu-items` (público).
- Path: `{marcaId}/{itemId}` — sin extensión, se sobreescribe en cada upload.
- Validación en controller: tipo (`image/jpeg`, `image/png`, `image/webp`) y tamaño máximo (5 MB) con `ParseFilePipe`.

**Endpoints de imagen:**
- `POST /api/items/:id/imagen` — sube o reemplaza la imagen.
- `DELETE /api/items/:id/imagen` — elimina la imagen y limpia `imagenUrl`.

### Decisiones

**Ingredientes sin soft delete:** a diferencia de Marca o Restaurante, un ingrediente sin referencias no tiene historial que preservar. La FK de los pedidos apunta a `ItemIngrediente`, no a `Ingrediente`. Hard delete con validación de uso.

**Ingredientes scoped al restaurante, ítems scoped a la marca:** un ingrediente puede variar entre sucursales. El catálogo de platos es el mismo para toda la cadena.

**Comparación case-insensitive para nombres:** Prisma soporta `mode: 'insensitive'` en queries. Evita tener "Tomate" y "tomate" como ingredientes distintos.

**Path fijo en Supabase Storage:** usar `marcaId/itemId` como path hace que la URL pública no cambie entre uploads. El panel admin y la app cliente no necesitan actualizar nada cuando se reemplaza una imagen.

---

## 6. #48 — Admin: gestión completa del catálogo

**Responsable:** Strumia Carrara  
**PR:** #216 (`feat/front-menu`) · commit `feat(admin): gestión completa del catálogo de menú`  
**Documentación detallada:** `Documentacion/modulo-menu.md` (sección frontend)

### Qué se hizo

Se implementó la interfaz completa de gestión del catálogo en `apps/admin/` (ahora renombrado a `apps/web-admin/`):

**Autenticación:** login con email/password, JWT en `localStorage`, decode local del payload. `authStore` con carga de contexto (marcas + restaurantes), selector activo en el header.

**`MenuPage`** — tres tabs:
- **Ítems del menú:** tabla con thumbnail, precio, badge de disponibilidad, upload de imagen, modal de create/edit.
- **Categorías:** árbol expandible con subcategorías. Inline edit sin modal para ambos niveles.
- **Ingredientes:** lista plana con inline edit por fila.

**Componentes UI** propios: `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Modal`, `Spinner` — todos con Tailwind, sin librerías de UI externas.

**Actualizaciones optimistas en `menuStore`:** después de cada operación exitosa, el array local se actualiza sin refetch. Esto hace la UI inmediatamente reactiva.

**`services/api.ts`:**
- Base URL desde `VITE_API_URL`.
- Clase `ApiError` que extiende `Error` con campo `status: number`.
- Upload de imagen con `FormData` — sin `Content-Type` manual para que el browser agregue el boundary correcto.

**Fix adicional (Ojeda — PR #214):** proxy de Vite para redirigir requests al backend en dev. Sin el proxy, el browser bloqueaba los requests cross-origin durante el desarrollo local.

---

## 7. #50 — Swagger: endpoints de auth y menú documentados

**Responsable:** Ojeda  
**PRs:** #217 al #222 (`feat/inicializacion-railway` y `feat/swagger-auth&menu`)

### Qué se hizo

Se configuró Swagger UI y se documentaron todos los endpoints de auth y menú:

**Setup de Swagger (`main.ts`):**
```typescript
const config = new DocumentBuilder()
  .setTitle('MenYU API')
  .setVersion('1.0')
  .addBearerAuth()
  .build()
const document = SwaggerModule.createDocument(app, config)
SwaggerModule.setup('/docs', app, document)
```

**Decoradores agregados a los controllers:**
- `@ApiOperation({ summary: '...' })` — descripción de cada endpoint.
- `@ApiResponse({ status: 200|201|400|401|403|404 })` — respuestas documentadas.
- `@ApiBody({ type: ... })` — body tipado para los POST.
- `@ApiParam({ name: '...' })` — params de ruta.
- `@ApiBearerAuth()` — indica qué endpoints requieren JWT. Permite enviar el token directamente desde la UI de Swagger.

**DTOs para Swagger** creados:
- `auth/dto/guest.dto.ts` — `GuestDto` con `@ApiProperty`.
- `auth/dto/refresh-token.dto.ts` — `RefreshTokenDto`.
- DTOs de categorías, ingredientes e ítems actualizados con `@ApiProperty`.

**Plugin de Swagger en `nest-cli.json`:** auto-generación de metadata desde los decoradores de class-validator, evitando duplicar las anotaciones de tipo.

**Mejoras al Dockerfile en el mismo sprint:**
- Stage `runner` actualizado para incluir corepack/pnpm.
- `prisma generate` antes del `nest build`.
- SSL habilitado para la conexión PostgreSQL en producción (Supabase requiere SSL).
- Health endpoint `GET /api/health` para Railway.

### Decisiones

**Swagger en `/docs`:** accesible en desarrollo y staging para que el equipo pueda probar endpoints sin Postman. Se puede desactivar en producción con una variable de entorno si fuera necesario.

**`@ApiBearerAuth()` explícito en cada ruta protegida:** Swagger no infiere automáticamente qué rutas requieren auth. El decorador permite que la UI de Swagger incluya el header `Authorization` en esas llamadas.

---

## 8. #49 — Tests de sesión y menú

**Responsable:** De Marcos  
**PR:** #229 (`test/sesion-de-mesa`) · commit `test: agrega tests unitarios y e2e para el módulo sessions`

### Qué se hizo

Se agregó la suite de tests para el módulo de sesiones y se complementaron los tests existentes:

**Nuevos archivos:**

| Archivo | Tests | Tipo |
|---|---|---|
| `sessions.service.spec.ts` | ~30 | Unitarios |
| `sessions.e2e-spec.ts` | 9 | E2E (integración con DB real) |
| `test/setup-e2e.ts` | — | Setup compartido para e2e |
| `jest.e2e.config.js` | — | Configuración separada para tests e2e |

**`sessions.service.spec.ts`** cubre:
- Apertura de sesión con QR token válido.
- Apertura con PIN válido.
- Rechazo de QR token inválido o mesa inexistente.
- Rechazo de PIN incorrecto.
- Reutilización de clienteId cuando el request incluye JWT válido.
- Comportamiento en modo `'seguro'` vs `'abierto'`.
- Creación de `SesionMesaCliente` al unirse a sesión existente.

**`sessions.e2e-spec.ts`** (integración con DB real de Supabase):
- 9 tests que hacen requests HTTP reales al servidor de testing.
- Verifican el flujo completo de apertura de sesión end-to-end.

**Actualizaciones de tests existentes:**
- `mesas.service.spec.ts` — +51 líneas cubriendo `generatePin()` y `PATCH /mesas/:id/pin`.
- `marca.service.spec.ts` — corrección menor de alineación con cambios del sprint.

**Estrategia de limpieza para tests e2e:** los tests crean datos con un prefijo `e2e-test-*` y los eliminan al finalizar. Esto permite correr los tests e2e contra la DB compartida sin afectar datos de desarrollo.

**Scripts agregados a `package.json`:**
```json
"test:e2e": "jest --config jest.e2e.config.js"
```

### Estado al cierre

81/81 tests unitarios en verde. 9/9 tests de integración en verde.

---

## 9. Decisiones de diseño transversales

| Decisión | Contexto |
|---|---|
| JWT de sesión separado del JWT de usuario | La sesión de mesa autentica una mesa, no un cliente. Permite que invitados sin cuenta usen el sistema |
| Sesión multi-cliente con `SesionMesaCliente` | Varias personas en la misma mesa pueden unirse con sus propios dispositivos sin crear sesiones paralelas |
| `modoSesion` en el Restaurante | Cada restaurante decide si la mesa es "abierta" (cualquiera con el PIN) o "segura" (solo quien la abre puede agregar participantes) |
| PIN generado server-side | El backend garantiza unicidad dentro del restaurante. El admin puede regenerarlo en cualquier momento |
| Tests e2e con prefijo de limpieza | Permite correr integración contra la DB compartida sin necesitar una DB dedicada solo para tests |
| html5-qrcode solo en web | En la app nativa se usa el scanner de Expo que tiene mejor acceso a la cámara y permisos del SO |

---

## 10. Problemas encontrados y resoluciones

### TS4053: `OpenSessionResult` no exportada

**Síntoma:** build fallido con error `TS4053: Return type of public method from exported class has or is using private name 'OpenSessionResult'`.

**Causa:** `OpenSessionResult` era una interface interna del service sin `export`.

**Resolución:** se agregó `export` a la interface. Como es un tipo de retorno de un método público, TypeScript require que sea exportado.

### `pnpm-lock.yaml` corrupto — SDK 53 y 55 mezclados

**Síntoma:** la app de Expo no levantaba. Error de incompatibilidad de versiones de paquetes.

**Causa:** durante el desarrollo, la versión de Expo SDK en el lockfile tenía dependencias de SDK 53 y SDK 55 mezcladas por instalaciones manuales parciales.

**Resolución:**
```bash
git checkout pnpm-lock.yaml   # revertir el lockfile al último estado válido
npx expo install --fix        # alinear todas las dependencias a la versión correcta del SDK
# + overrides en package.json para forzar versiones específicas que Expo requiere
```

### Conflicto de limpieza en tests e2e con DB compartida

**Síntoma:** los tests e2e dejaban datos basura en la DB de desarrollo. Si un test fallaba a la mitad, los datos no se limpiaban y corrompían tests posteriores.

**Resolución:** se implementó una estrategia de prefijo: todos los registros creados por tests e2e usan `e2e-test-` como prefijo en nombre/email. El setup (`test/setup-e2e.ts`) hace un `deleteMany` de registros con ese prefijo antes y después de cada suite.

---

*MenYU · De Marcos · Ojeda · Strumia Carrara · 2026*
