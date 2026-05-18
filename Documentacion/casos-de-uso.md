# Casos de Uso — MenYU (V1.0)

---

## CU1: El admin inicia sesión en el panel

**Estado:** Implementado y testeado

**Archivos:**
- `apps/backend/src/auth/auth.service.ts` / `auth.service.spec.ts`
- `apps/backend/src/auth/auth.controller.ts`
- `apps/admin/src/pages/login/LoginPage.tsx`
- `apps/admin/src/store/authStore.ts` / `authStore.spec.ts`
- `apps/admin/src/App.tsx` / `App.spec.tsx`
- `apps/admin/src/services/api.ts`

**Tests existentes:**

Backend — `auth.service.spec.ts` (7 casos para login y logout):
- `login()`: credenciales válidas de admin, credenciales válidas de mozo, usuario inexistente, contraseña incorrecta, invitado sin passwordHash, persistencia del refresh token en DB.
- `logout()`: revocación del refresh token en la DB.

Frontend — `authStore.spec.ts` (4 casos para logout):
- Llama a `api.auth.logout` con el refreshToken guardado en localStorage.
- Limpia localStorage aunque la llamada a la API falle.
- No llama a la API si no hay refreshToken en localStorage.
- Resetea todo el estado del store.

Frontend — `App.spec.tsx` (3 casos):
- Sin sesión activa → muestra LoginPage.
- Usuario logueado con tipo distinto de admin → muestra pantalla de acceso denegado.
- Usuario logueado con tipo admin → muestra el panel.

**Precondición:** Admin creado en la tabla `Admin` con email y passwordHash. El usuario debe tener `tipo: 'admin'` para acceder al panel.

**Flujo principal:**
1. Admin ingresa email y password en LoginPage
2. `POST /api/auth/login` recibe credenciales
3. `AuthService.login()` busca al usuario en `Admin`, `Mozo` o `Cliente` según email
4. Verifica password con `bcrypt.compare()`
5. Genera accessToken (JWT con payload: `sub`, `email`, `nombre`, `tipo`, `rol`) y refreshToken opaco; persiste el hash del refresh token en la tabla `RefreshToken` con expiración de 7 días
6. Devuelve el par de tokens; el panel guarda ambos tokens en localStorage (`TOKEN_KEY` y `REFRESH_KEY`)
7. El store decodifica el JWT y carga el perfil del usuario en memoria
8. Se ejecuta `loadContext()`: carga marcas y restaurantes accesibles para el usuario
9. La app verifica que `user.tipo === 'admin'`; si no lo es, muestra pantalla de acceso denegado
10. La app muestra el panel (MenuPage dentro de Layout)

**Flujos alternativos:**
- 2a. Email no registrado: AuthService devuelve 401 "Credenciales inválidas". LoginPage muestra el mensaje de error en rojo. El admin permanece en la pantalla de login.
- 4a. Contraseña incorrecta: Ídem 2a — mismo mensaje intencional para no revelar si el email existe.
- 8a. `loadContext()` falla con 401: El store ejecuta `logout()` automáticamente, limpia localStorage y vuelve a mostrar LoginPage.
- 9a. Usuario logueado no es admin: Se muestra pantalla de acceso denegado con botón para cerrar sesión.

**Postcondición:** El admin está autenticado. localStorage contiene accessToken y refreshToken. El store tiene usuario, marcas y restaurante seleccionado. La app muestra el panel administrativo.

**Actor:** Admin / OWNER

---

## CU2: El cliente se registra con email y contraseña

**Estado:** Implementado y testeado

**Archivos:**
- `apps/backend/src/auth/auth.service.ts` / `auth.service.spec.ts`
- `apps/backend/src/users/users.service.ts` / `users.service.spec.ts`
- `apps/cliente/src/app/(auth)/register.tsx`
- `apps/cliente/src/store/userStore.ts` / `userStore.spec.ts`

**Tests existentes:**

Backend — `auth.service.spec.ts` (2 casos para register):
- Creación exitosa: crea el cliente y devuelve tokens.
- 409 si el email ya está registrado.

Backend — `users.service.spec.ts` (2 casos para createCliente):
- Crea cliente registrado con email y passwordHash.
- Crea cliente invitado sin email ni passwordHash.

Frontend — `userStore.spec.ts` (5 casos para register):
- Llama a `POST /auth/register` con los datos correctos.
- Persiste ambos tokens en storage tras el registro exitoso.
- Guarda el usuario decodificado del JWT en el store.
- Relanza el error si la API falla, para que el componente lo maneje.
- Resetea `isLoading` a false aunque la API falle.

**Precondición:** Ninguna (flujo de onboarding).

**Flujo principal:**
1. Cliente completa nombre, email y contraseña en `register.tsx`
2. `register.tsx` valida localmente que los campos no estén vacíos y que la contraseña tenga al menos 6 caracteres
3. `POST /api/auth/register` con `{ nombre, email, password }`
4. `AuthService.register()` verifica que el email no exista en la tabla `Cliente`
5. Hashea la contraseña con `bcrypt.hash()`
6. `UsersService.createCliente()` persiste el registro
7. Retorna accessToken + refreshToken; el store persiste ambos tokens usando la abstracción storage (AsyncStorage en nativo, localStorage en web)
8. El store decodifica el JWT y guarda el perfil del usuario en memoria
9. La app navega a `/(session)`

**Flujos alternativos:**
- 2a. Campos vacíos: `register.tsx` muestra "Completá todos los campos" sin llamar al backend.
- 2b. Contraseña menor a 6 caracteres: `register.tsx` muestra "La contraseña debe tener al menos 6 caracteres" sin llamar al backend.
- 4a. Email ya registrado (409): `register.tsx` muestra "Ese email ya está registrado".
- 4b. Error genérico de red: `register.tsx` muestra "No se pudo crear la cuenta. Intentá de nuevo."

**Postcondición:** Cliente autenticado. Tokens persistidos en storage. El store tiene el perfil del usuario en memoria. La app muestra la pantalla de sesión.

**Notas:**
- El campo `telefono` es opcional y existe en el backend y en el store, pero el formulario de `register.tsx` no lo expone.

**Actor:** Cliente

---

## CU3: El cliente entra como invitado (sin cuenta)

**Estado:** Implementado y testeado

**Archivos:**
- `apps/backend/src/auth/auth.service.ts` / `auth.service.spec.ts`
- `apps/cliente/src/app/(auth)/guest.tsx`
- `apps/cliente/src/store/userStore.ts` / `userStore.spec.ts`

**Tests existentes:**

Backend — `auth.service.spec.ts` (3 casos para loginAsGuest):
- Crea cliente sin contraseña y devuelve tokens.
- Usa "Invitado" como nombre por defecto si no se pasa ninguno.
- Incluye el nombre en el payload del JWT.

Frontend — `userStore.spec.ts` (6 casos para loginAsGuest):
- Llama a `POST /auth/guest` con el nombre proporcionado.
- Llama a `POST /auth/guest` con undefined si no se pasa nombre.
- Persiste ambos tokens en storage tras el login exitoso.
- Guarda el usuario decodificado del JWT en el store.
- Relanza el error si la API falla.
- Resetea `isLoading` a false aunque la API falle.

**Precondición:** Ninguna.

**Flujo principal:**
1. Cliente toca "Entrar sin cuenta" en `guest.tsx`
2. Opcionalmente ingresa su nombre (campo de texto, máximo 40 caracteres). Si lo deja vacío se envía undefined y el backend asigna "Invitado"
3. `POST /api/auth/guest` con `{ nombre? }`
4. `AuthService.loginAsGuest()` crea un `Cliente` sin email ni passwordHash
5. Genera JWT con `tipo: 'cliente'` y nombre
6. Retorna accessToken + refreshToken; el store persiste ambos tokens usando la abstracción storage (AsyncStorage en nativo, localStorage en web)
7. El store decodifica el JWT y guarda el perfil del usuario en memoria
8. La app navega a `/(session)`

**Flujos alternativos:**
- 3a. Error de red: `guest.tsx` muestra "No se pudo conectar. Intentá de nuevo."

**Postcondición:** Cliente autenticado como invitado. Tokens persistidos en storage. El store tiene el perfil del usuario en memoria. La app muestra la pantalla de sesión.

**Actor:** Cliente

---

## CU4: El cliente renueva su token de acceso

**Estado:** Implementado y testeado

**Archivos:**
- `apps/backend/src/auth/auth.service.ts` / `auth.service.spec.ts`
- `apps/backend/src/auth/auth.controller.ts`
- `apps/cliente/src/services/api.ts`
- `apps/cliente/src/store/userStore.ts` / `userStore.spec.ts`

**Tests existentes:**

Backend — `auth.service.spec.ts` (5 casos para refresh):
- Devuelve tokens nuevos con un refresh token válido.
- Lanza 401 si el token no existe en la DB.
- Lanza 401 si el token fue revocado.
- Lanza 401 si el token expiró.
- Lanza 401 si el usuario ya no existe en la DB.

Frontend — `userStore.spec.ts` (6 casos para refresh):
- Llama a `POST /auth/refresh` con el refreshToken del store.
- Persiste los tokens nuevos en storage.
- Actualiza el store con los tokens nuevos y el usuario decodificado.
- Retorna el nuevo accessToken.
- Lanza si no hay refreshToken en el store.
- Relanza el error si la API falla.

**Precondición:** Cliente autenticado con refresh token vigente en el store.

**Flujo principal:**
1. Cualquier request de la app recibe una respuesta 401 (access token expirado)
2. El interceptor de Axios en `api.ts` captura el error y marca el request como `_retried`
3. El interceptor llama a `userStore.refresh()`, que hace `POST /api/auth/refresh` con el refreshToken del store
4. `AuthService.refresh()` valida el hash del token en la DB, verifica que no esté revocado ni expirado
5. Revoca el refresh token anterior (rotación) y genera un par nuevo
6. El store persiste los tokens nuevos en storage y actualiza el usuario decodificado en memoria
7. El interceptor reintenta el request original con el nuevo accessToken en el header
8. La app recibe la respuesta original sin que el usuario se entere del proceso

**Flujos alternativos:**
- 3a. Refresh token inválido, revocado o expirado: `userStore.refresh()` lanza un error. El interceptor captura la excepción, llama a `userStore.logout()` automáticamente y rechaza el request original. La app vuelve a la pantalla de login.

**Postcondición:** Tokens rotados. Nuevos accessToken y refreshToken persistidos en storage y en el store. El request original completado exitosamente.

**Actor:** Sistema (llamado automáticamente por el interceptor de Axios, transparente para el usuario)

---

## CU5: El cliente abre una sesión de mesa por QR o PIN

**Estado:** Implementado y testeado

**Archivos:**
- `apps/backend/src/sessions/sessions.service.ts` / `sessions.service.spec.ts`
- `apps/backend/src/sessions/sessions.controller.ts`
- `apps/backend/src/sessions/sessions.module.ts`
- `apps/backend/src/sessions/dto/open-session.dto.ts`
- `apps/backend/src/users/users.service.ts`
- `apps/cliente/src/app/check-in.tsx`
- `apps/cliente/src/store/sessionStore.ts`
- `apps/cliente/src/services/api.ts`
- `apps/cliente/src/app/(session)/index.tsx`

**Tests existentes:**

Backend — `sessions.service.spec.ts` (18 casos):
- `generateCodigoSesion()`: genera string de exactamente 3 caracteres; valor entre "001" y "999", nunca "000"; aplica padding con ceros ("001" no "1").
- `resolveClienteId()`: JWT válido con cliente en BD → devuelve clienteId del JWT; JWT válido pero cliente inexistente → crea invitado; JWT expirado → crea invitado; JWT malformado → crea invitado; sin header → crea invitado.
- `open()`: sin tableCode ni pin/restaurantId → 400; tableCode inexistente → 404; pin inexistente para ese restaurante → 404; mesa sin sesión activa → crea SesionMesa con participante orden:1, devuelve esAnfitrion:true; sesión activa modo "abierto" → devuelve mismo sesionId, esAnfitrion:false; modo "seguro" sin codigoSesion → 403 con mensaje específico; modo "seguro" código incorrecto → 403; modo "seguro" código correcto → mismo sesionId, esAnfitrion:false; cliente que ya participa → idempotente, no duplica SesionMesaCliente; JWT válido en header → reutiliza clienteId existente, no crea invitado.

Backend — `sessions.e2e-spec.ts` (9 casos sobre `POST /api/sessions/open`):
- tableCode válido → 200, sesión creada, esAnfitrion:true, codigoSesion de 3 dígitos.
- pin válido con sesión activa preexistente → 200, mismo sesionId, esAnfitrion:false.
- sin parámetros → 400.
- tableCode inexistente → 404.
- modo seguro sin código → 403 con mensaje "Esta mesa requiere código de sesión para unirse".
- modo seguro con código incorrecto → 403.
- modo seguro con código correcto → 200, mismo sesionId.
- mismo cliente llama open dos veces → no duplica SesionMesaCliente.
- JWT válido en header → reutiliza clienteId, no crea invitado.

**Precondición:** Mesa existente y activa (`activo: true`) en la BD con `qrToken` y `pin` asignados. El restaurante tiene configurado `modoSesion` ("abierto" o "seguro").

**Flujo principal:**
1. El cliente abre la app MenYu (Expo) y navega a `check-in.tsx`; puede llegar con `tableCode` como parámetro de ruta (desde un deeplink) o sin parámetros
2. El cliente elige su modo de ingreso:
   - **Modo QR** (web móvil): toca "Escanear QR"; la pantalla inicializa `html5-qrcode` sobre el div `#qr-reader` con `facingMode: 'environment'` a 10 fps; al detectar un código QR extrae el `tableCode` del texto (intenta parsearlo como URL con `searchParams.get('tableCode')` o usa el texto crudo como fallback)
   - **Modo PIN**: ingresa los 4 dígitos del PIN y el `restaurantId` del establecimiento en los campos de texto
3. `check-in.tsx` valida localmente: en modo PIN verifica que el campo tenga exactamente 4 dígitos y que `restaurantId` no esté vacío; si falla muestra error sin llamar al backend
4. `check-in.tsx` llama a `POST /api/sessions/open` con body `{ tableCode }` (QR) o `{ restaurantId, pin }` (PIN); el header `Authorization: Bearer <token>` se adjunta si hay JWT en storage
5. `SessionsController.open()` recibe el `OpenSessionDto` y el header `authorization`; delega a `SessionsService.open(dto, authHeader)`
6. `SessionsService.resolveClienteId(authHeader)`: si el header contiene un JWT válido y el `clienteId` del payload existe en la tabla `Cliente`, reutiliza ese id; en cualquier otro caso (sin header, JWT expirado, malformado, o cliente inexistente en BD) crea un `Cliente` invitado con `{ nombre: 'Invitado' }` via `UsersService.createCliente()`
7. El servicio busca la `Mesa` activa: por `qrToken` (si se recibió `tableCode`) o por `(restauranteId, pin)` (si se recibió `pin`); si la mesa no existe o está inactiva, lanza NotFoundException (404)
8. Si la mesa **no tiene sesión activa**: el servicio genera un `codigoSesion` de 3 dígitos (001–999 con padding), crea el registro `SesionMesa { mesaId, clienteId, codigoSesion, estado: 'activa' }` junto con el primer `SesionMesaCliente { clienteId, orden: 1 }` en una sola operación anidada de Prisma; devuelve `esAnfitrion: true`
9. Si la mesa tiene sesión activa en modo **`"abierto"`**: verifica via `SesionMesaCliente.findUnique` si el cliente ya participa; si no, lo agrega con `orden` = count actual + 1; si ya participa, devuelve la sesión sin duplicar el registro (idempotente); devuelve `esAnfitrion: false`
10. Si la mesa tiene sesión activa en modo **`"seguro"`**: el primer cliente que abrió la sesión ya conoce el `codigoSesion`; si el nuevo cliente no envía `codigoSesion` en el body → ForbiddenException "Esta mesa requiere código de sesión para unirse"; si lo envía pero no coincide con `SesionMesa.codigoSesion` → ForbiddenException (403); si coincide, el cliente se une normalmente
11. El servicio retorna `{ sesionId, mesaId, codigoSesion, clienteId, jwt, esAnfitrion }`
12. `check-in.tsx` llama a `sessionStore.setSession(data)`, que persiste el objeto en storage bajo la clave `menyu_session` (AsyncStorage nativo / localStorage web) y actualiza el estado Zustand; la pantalla navega a `/(session)` con `router.replace`

**Flujos alternativos:**
- 3a. PIN con menos de 4 dígitos: `check-in.tsx` muestra "El PIN tiene exactamente 4 dígitos" sin llamar al backend.
- 3b. `restaurantId` vacío en modo PIN: `check-in.tsx` muestra "Ingresá el ID del restaurante" sin llamar al backend.
- 7a. Mesa no encontrada (404): `check-in.tsx` detecta `status === 404` y muestra "Mesa no encontrada. Verificá el QR o el PIN."; vuelve al modo `idle`.
- 10a. Modo "seguro" sin codigoSesion (403): `check-in.tsx` detecta el mensaje "código de sesión para unirse", guarda el payload original en `pendingPayload.current` y cambia al modo `awaiting-code`; el cliente debe pedirle el código de 3 dígitos al anfitrión de la mesa.
- 10b. Código de sesión incorrecto (403): `check-in.tsx` muestra "Código de sesión incorrecto" dentro del modo `awaiting-code` sin salir de la pantalla.
- 2a. Cámara no disponible (modo QR web): `html5-qrcode` falla al inicializar; `check-in.tsx` muestra "No se pudo acceder a la cámara. Usá el PIN en cambio." y vuelve al modo `idle`.
- Genérico. Error de red: `check-in.tsx` muestra "No se pudo conectar. Intentá de nuevo." y vuelve al modo `idle`.

**Postcondición:** `SesionMesa` activa en BD con `estado: 'activa'` y `codigoSesion` de 3 dígitos. `SesionMesaCliente` creado (o ya existente) para este cliente. `sessionStore` hidratado con `{ sesionId, mesaId, codigoSesion, clienteId, esAnfitrion, jwt }`. La sesión está persistida en storage. La app muestra la pantalla `/(session)`.

**Notas:**
- El `codigoSesion` solo tiene valor de seguridad en modo "seguro"; en modo "abierto" cualquier cliente puede unirse sin necesidad de conocerlo.
- El anfitrión (`esAnfitrion: true`) es siempre el primer cliente que abre la sesión; los demás son participantes secundarios (`esAnfitrion: false`).
- La app cliente en nativo (iOS/Android) no muestra el botón "Escanear QR" ya que Expo Router maneja el QR internamente; el botón aparece solo en web móvil.

**Actor:** Cliente

---

## CU6: El admin crea una mesa con QR y PIN

**Estado:** Implementado y testeado

**Archivos:**
- `apps/backend/src/mesas/mesas.service.ts` / `mesas.service.spec.ts`
- `apps/backend/src/mesas/mesas.controller.ts`
- `apps/backend/src/mesas/mesas.module.ts`
- `apps/backend/src/mesas/dto/create-mesa.dto.ts`
- `apps/backend/src/mesas/dto/update-mesa.dto.ts`
- `apps/backend/src/mesas/dto/cambiar-pin.dto.ts`
- `apps/admin/src/pages/tables/index.ts`
- `apps/admin/src/store/tablesStore.ts`

**Tests existentes:**

Backend — `mesas.service.spec.ts` (20 casos):
- `create()`: crea la mesa con qrToken generado y devuelve imagen QR; lanza 409 si el número de mesa ya existe en ese restaurante; lanza 404 si el restaurante no existe.
- `findAll()`: ROOT puede listar mesas de cualquier restaurante con imagen QR; OWNER solo puede listar mesas de su propio restaurante; OWNER lanza 403 si intenta listar mesas de otro restaurante.
- `findOne()`: devuelve la mesa con imagen QR; lanza 404 si la mesa no existe; lanza 404 si la mesa está inactiva (`activo: false`).
- `update()`: actualiza el número y devuelve imagen QR actualizada; lanza 409 si el nuevo número ya lo usa otra mesa del mismo restaurante; actualiza el estado de la mesa.
- `remove()`: realiza soft delete (`activo: false`); lanza 404 si la mesa no existe.
- `generatePin()`: genera string de exactamente 4 caracteres; valor entre "0001" y "9999"; aplica padding con ceros ("0001" no "1"); lanza ConflictException tras 100 intentos de colisión consecutivos.
- `regenerarQr()`: genera nuevo token UUID y devuelve nueva imagen QR; OWNER lanza 403 si intenta regenerar el QR de una mesa de otro restaurante.

**Precondición:** Admin autenticado con rol ROOT o OWNER. Restaurante existente en la BD para el que se creará la mesa.

**Flujo principal:**
1. Admin OWNER navega al módulo de mesas del panel admin y abre el formulario de alta
2. Completa el campo `numero` (identificador legible de la mesa, ej. "12") y selecciona el `restauranteId` de destino
3. El panel envía `POST /api/mesas` con `CreateMesaDto { numero, restauranteId }` y header `Authorization: Bearer <token>`
4. `JwtAuthGuard` valida el JWT; `RolesGuard` verifica que el rol sea ROOT o OWNER; si el rol es OWNER, `assertRestauranteOwnership` compara `admin.marcaId` con `restaurante.marcaId` para garantizar que el admin solo gestione su propio restaurante (403 si no coincide)
5. `MesasService.create()` consulta `prisma.restaurante.findUnique({ where: { id: restauranteId } })`; si no existe lanza NotFoundException (404)
6. Verifica via `prisma.mesa.findFirst({ where: { restauranteId, numero } })` que no exista otra mesa activa con el mismo número en ese restaurante; si colisiona lanza ConflictException (409)
7. Genera el `qrToken` único via `crypto.randomUUID()` — un UUID v4 que actúa como identificador opaco del QR
8. Genera el PIN de 4 dígitos via `generatePin(restauranteId)`: sortea aleatoriamente entre 1 y 9999 con padding a 4 dígitos y verifica unicidad por restaurante en la tabla `Mesa`; reintenta hasta 100 veces ante colisiones (ConflictException si se agotan los intentos)
9. Persiste la `Mesa` en BD: `{ numero, restauranteId, qrToken, pin, estado: 'libre', activo: true }`
10. Genera la imagen QR a partir del `qrToken` usando `qrcode.toDataURL()` y retorna `{ ...mesa, qrImage: 'data:image/png;base64,...' }`
11. El panel muestra la mesa creada con su imagen QR lista para imprimir y el PIN numérico para comunicar verbalmente

**Flujos alternativos:**
- 4a. Token inválido o ausente (401): JwtAuthGuard rechaza la request; el panel redirige al login.
- 4b. Rol insuficiente (403): RolesGuard rechaza; el panel muestra mensaje de permisos insuficientes.
- 4c. OWNER intenta crear mesa en restaurante de otra marca (403): `assertRestauranteOwnership` lanza ForbiddenException.
- 5a. Restaurante no encontrado (404): `MesasService` lanza NotFoundException; el panel muestra "Restaurante no encontrado."
- 6a. Número de mesa duplicado (409): `MesasService` lanza ConflictException; el panel muestra "Ya existe una mesa con ese número en este restaurante."
- 8a. Sin PINs disponibles (409 tras 100 colisiones): situación extrema indicativa de que el restaurante ya tiene 9999 mesas activas.
- Edición posterior — `PATCH /api/mesas/:id`: permite actualizar `numero` o `estado` con las mismas validaciones de unicidad y propiedad.
- Cambio de PIN — `PATCH /api/mesas/:id/pin`: genera y asigna un nuevo PIN único al restaurante; invalida el PIN anterior.
- Regeneración de QR — `POST /api/mesas/:id/regenerar-qr`: genera nuevo `qrToken` UUID; invalida todos los QR físicos previamente impresos.
- Baja — `DELETE /api/mesas/:id`: soft delete (`activo: false`); la mesa desaparece del listado pero conserva el historial de sesiones.

**Postcondición:** Mesa registrada en BD con `qrToken` UUID único global, PIN de 4 dígitos único por restaurante, `estado: 'libre'` y `activo: true`. El panel muestra la imagen QR (data URI base64) y el PIN listos para distribuir físicamente.

**Notas:**
- El QR embebe el `qrToken` como texto plano; la app cliente lo interpreta directamente como `tableCode` en el body de `POST /api/sessions/open`.
- El PIN es la alternativa al QR para entornos con mala iluminación o dispositivos sin cámara; se comunica verbalmente junto con el `restauranteId`.
- La restricción `@@unique([restauranteId, pin])` en el schema de Prisma garantiza la unicidad del PIN a nivel de BD como segunda línea de defensa.

**Actor:** Admin / OWNER

---

## CU7: El admin gestiona marcas del sistema

**Estado:** Implementado y testeado

**Archivos:**
- `apps/backend/src/marca/marca.service.ts` / `marca.service.spec.ts`
- `apps/backend/src/marca/marca.controller.ts`
- `apps/backend/src/marca/marca.module.ts`
- `apps/backend/src/marca/dto/create-marca.dto.ts`
- `apps/backend/src/marca/dto/update-marca.dto.ts`
- `apps/admin/src/pages/dashboard/index.ts`
- `apps/admin/src/store/authStore.ts`

**Tests existentes:**

Backend — `marca.service.spec.ts` (13 casos):
- `create()`: crea y devuelve la marca; lanza 409 si el slug ya existe.
- `findAll()`: ROOT devuelve todas las marcas activas; OWNER solo ve su propia marca (filtrada por `admin.marcaId`).
- `findOne()`: devuelve la marca con sus relaciones; lanza 404 si la marca no existe; lanza 404 si la marca está inactiva; OWNER lanza 403 antes de consultar la BD si intenta acceder a una marca que no es la suya.
- `update()`: actualiza y devuelve la marca; lanza 409 si el nuevo slug ya lo usa otra marca; lanza 404 si la marca no existe.
- `remove()`: realiza soft delete (`activo: false`); lanza 404 si la marca no existe.

**Precondición:** Admin autenticado. Para crear o eliminar marcas: rol ROOT. Para listar o editar: rol ROOT o OWNER.

**Flujo principal:**
1. Admin ROOT autenticado navega al módulo de marcas del panel admin
2. Completa el formulario de alta con `nombre` (ej. "La Parrilla") y `slug` (ej. "la-parrilla", identificador URL-friendly único en el sistema)
3. El panel envía `POST /api/marcas` con `CreateMarcaDto { nombre, slug }` y header `Authorization: Bearer <token>`
4. `JwtAuthGuard` valida el JWT; `RolesGuard` verifica que el rol sea ROOT (único rol autorizado para crear marcas)
5. `MarcaService.create()` consulta `prisma.marca.findUnique({ where: { slug } })` para verificar unicidad del slug; si ya existe lanza ConflictException (409)
6. Persiste `{ nombre, slug, activo: true }` en la tabla `Marca` con UUID como PK
7. Retorna la marca creada; el panel actualiza el listado de marcas
8. Para listar: ROOT llama `GET /api/marcas` y recibe todas las marcas activas; OWNER recibe solo su marca (`prisma.marca.findMany({ where: { id: admin.marcaId } })`)
9. Para editar: ROOT o OWNER llama `PATCH /api/marcas/:id` con `UpdateMarcaDto { nombre?, slug? }`; el servicio verifica existencia, verifica unicidad del nuevo slug si se modifica, actualiza con `prisma.marca.update()` y devuelve la marca actualizada
10. Para dar de baja: ROOT llama `DELETE /api/marcas/:id`; el servicio verifica existencia y realiza soft delete (`prisma.marca.update({ data: { activo: false } })`); la marca desaparece de los listados pero conserva historial en BD

**Flujos alternativos:**
- 4a. Token inválido (401): JwtAuthGuard rechaza la request.
- 4b. OWNER intenta crear marca (403): RolesGuard rechaza; solo ROOT puede ejecutar `POST /api/marcas`.
- 4c. OWNER intenta eliminar marca (403): RolesGuard rechaza; solo ROOT puede ejecutar `DELETE /api/marcas/:id`.
- 5a. Slug ya existe (409): `MarcaService` lanza ConflictException; el panel muestra "Ese slug ya está en uso."
- 9a. OWNER intenta acceder a una marca que no es la suya (403): `findOne()` compara el id solicitado con `admin.marcaId` y lanza ForbiddenException antes de consultar la BD.
- 9b. Nuevo slug ya usado por otra marca (409): `update()` consulta `prisma.marca.findFirst({ where: { slug, NOT: { id } } })` y lanza ConflictException.
- 9c. Marca no encontrada o inactiva (404): `findOne()` lanza NotFoundException.

**Postcondición:** (alta) Marca registrada en BD con `id` UUID, `nombre`, `slug` único, `activo: true` y `createdAt`. El panel muestra la nueva marca en el listado. (baja) `activo: false` en la BD; la marca desaparece de todos los listados sin perder el historial de restaurantes y pedidos asociados.

**Notas:**
- Una `Marca` es la entidad raíz del árbol: agrupa múltiples `Restaurante`s (sucursales) y sus `ItemMenu`s. Un `Admin` con rol OWNER pertenece a exactamente una marca; ROOT no tiene marcaId.
- OWNER solo puede ver y editar su propia marca; ROOT tiene visibilidad global.
- Solo ROOT puede crear y eliminar marcas; la creación de una marca implica la configuración posterior del primer restaurante y admin OWNER asociado.

**Actor:** Admin / ROOT

---

## CU8: El sistema gestiona usuarios (admin, mozo, cliente)

**Estado:** Implementado y testeado

**Archivos:**
- `apps/backend/src/users/users.service.ts` / `users.service.spec.ts`
- `apps/backend/src/users/users.module.ts`
- `apps/backend/src/auth/auth.service.ts` / `auth.service.spec.ts`
- `apps/backend/src/auth/auth.controller.ts`
- `apps/backend/src/auth/auth.module.ts`
- `apps/backend/src/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/auth/strategies/jwt.strategy.ts`
- `apps/backend/src/auth/dto/login.dto.ts`
- `apps/backend/src/auth/dto/register.dto.ts`
- `apps/backend/src/auth/dto/guest.dto.ts`
- `apps/backend/src/auth/dto/refresh-token.dto.ts`
- `apps/backend/src/common/guards/roles.guard.ts`
- `apps/backend/src/common/decorators/current-user.decorator.ts`
- `apps/admin/src/pages/staff/index.ts`
- `apps/mozo/src/app/(auth)/login.tsx`
- `apps/cliente/src/app/(auth)/login.tsx`

**Tests existentes:**

Backend — `users.service.spec.ts` (15 casos):
- `findAdminByEmail()`: devuelve el admin si existe; devuelve null si no existe.
- `findAdminById()`: devuelve el admin si existe; devuelve null si no existe.
- `createAdmin()`: crea y devuelve el admin; crea admin ROOT sin marcaId (`marcaId: null`).
- `findMozoByEmail()`: devuelve el mozo si existe; devuelve null si no existe.
- `findMozoById()`: devuelve el mozo si existe.
- `createMozo()`: crea y devuelve el mozo con los datos completos.
- `findClienteByEmail()`: devuelve el cliente si existe; devuelve null si no existe.
- `findClienteById()`: devuelve el cliente si existe.
- `createCliente()`: crea cliente registrado con email y passwordHash; crea cliente invitado sin email ni passwordHash (`passwordHash: null`).

Backend — `auth.service.spec.ts` (15 casos, relevantes a este CU: creación y autenticación unificada):
- `login()`: devuelve tokens con credenciales válidas de admin; lanza 401 si el usuario no existe; lanza 401 si la contraseña es incorrecta; lanza 401 si el usuario es invitado (sin passwordHash); persiste el refresh token en la BD.
- `register()`: crea cliente y devuelve tokens; lanza 409 si el email ya está registrado.
- `loginAsGuest()`: crea cliente sin contraseña y devuelve tokens; usa "Invitado" por defecto; incluye el nombre en el payload del JWT.
- `refresh()`: devuelve tokens nuevos con refresh token válido; lanza 401 si no existe, fue revocado o expiró.
- `logout()`: revoca el refresh token en la BD.

**Precondición:** Sistema operativo con acceso a la BD. Para crear admins y mozos: admin ROOT autenticado. Para registrar clientes: ninguna.

**Flujo principal:**
1. Admin ROOT necesita dar de alta un admin OWNER para una marca existente; llama `POST /api/auth/dev/admin` con `{ email, password, rol: 'OWNER', marcaId }`
2. `AuthService.devCreateAdmin()` verifica que no exista otro admin con ese email en la tabla `Admin`
3. Hashea la contraseña con `bcrypt.hash(password, 10)` via `bcryptjs`
4. Llama a `UsersService.createAdmin({ email, passwordHash, rol: 'OWNER', marcaId })` que ejecuta `prisma.admin.create({ data })`; el OWNER queda registrado con `marcaId` asociado
5. ROOT también puede crear mozos con `POST /api/auth/dev/mozo` con `{ nombre, email, password, restauranteId }`; el sistema hashea la contraseña y llama a `UsersService.createMozo()`; el mozo queda en la tabla `Mozo` con `activo: true`, `esJefeSalon: false`
6. Los clientes se crean autónomamente: via `register()` con email+password (CU2) o via `loginAsGuest()` sin credenciales (CU3); `UsersService.createCliente()` ejecuta `prisma.cliente.create({ data })`; el campo `passwordHash` es nullable para invitados
7. Cualquier usuario con credenciales llama `POST /api/auth/login` con `{ email, password }`
8. `AuthService.login()` busca al usuario por email en orden: `UsersService.findAdminByEmail()` → `findMozoByEmail()` → `findClienteByEmail()`; si no se encuentra en ninguna tabla lanza UnauthorizedException (401)
9. Verifica la contraseña con `bcrypt.compare(password, user.passwordHash)`; si `passwordHash` es null (invitado) o no coincide, lanza 401 con mensaje genérico "Credenciales inválidas"
10. Genera JWT con payload `{ sub, email, nombre, tipo: 'admin'|'mozo'|'cliente', rol? }`, persiste el hash del refresh token en la tabla `RefreshToken` con 7 días de vigencia y devuelve el par `{ accessToken, refreshToken }`

**Flujos alternativos:**
- 2a. Email ya registrado al crear admin o mozo (409): `AuthService` lanza ConflictException; el endpoint devuelve 409.
- 8a. Usuario no encontrado en ninguna tabla (401): `login()` lanza UnauthorizedException "Credenciales inválidas". El mensaje no revela si el email existe o no.
- 9a. Contraseña incorrecta (401): mismo mensaje que 8a para no revelar información.
- 9b. Cliente invitado intenta hacer login (401): `passwordHash` es null; el servicio lanza 401 antes de intentar el compare.
- Refresh: `POST /api/auth/refresh` con `{ refreshToken }` → `AuthService.refresh()` busca el hash en `RefreshToken`, verifica `revokedAt === null` y `expiresAt > now()`; si cualquier condición falla lanza 401; si pasa, revoca el token anterior y genera un par nuevo (rotación).
- Logout: `POST /api/auth/logout` con `{ refreshToken }` → `prisma.refreshToken.updateMany()` pone `revokedAt: new Date()` en todos los registros con ese hash y sin revocar.

**Postcondición:** Usuario creado en la tabla correspondiente (`Admin`, `Mozo` o `Cliente`) con passwordHash bcrypt. En el login: par de tokens generado, `RefreshToken` persistido en BD. La app del actor correspondiente muestra la vista autenticada.

**Notas:**
- Los tres tipos de usuario (`admin`, `mozo`, `cliente`) comparten el mismo sistema de tokens JWT y refresh token pero tienen tablas separadas en la BD. El campo `tipo` en el JWT permite a los guards distinguirlos.
- El `rol` del admin (`ROOT` u `OWNER`) es irrelevante para mozos y clientes; solo los admins tienen campo `rol`.
- Los endpoints `POST /api/auth/dev/*` son endpoints de desarrollo para facilitar la creación de usuarios en etapas previas a que exista un panel de administración de usuarios completo. Deben eliminarse antes de producción.
- `GET /api/auth/me` con JWT válido devuelve el payload completo del token en memoria; útil para que las apps verifiquen su propio tipo y rol.

**Actor:** Sistema / Admin ROOT (para crear admins y mozos) / Cliente (para registrarse o acceder como invitado)

---

## CU9: El cliente navega el menú público

**Estado:** En desarrollo

**Archivos:**
- `apps/backend/src/items/items.service.ts`
- `apps/backend/src/items/items.controller.ts`
- `apps/backend/src/items/items.module.ts`
- `apps/backend/src/categorias/categorias.service.ts`
- `apps/backend/src/categorias/categorias.controller.ts`
- `apps/backend/src/ingredientes/ingredientes.service.ts`
- `apps/backend/src/ingredientes/ingredientes.controller.ts`
- `apps/cliente/src/features/menu/index.ts`
- `apps/cliente/src/features/cart/index.ts`
- `apps/cliente/src/store/cartStore.ts`
- `apps/cliente/src/components/menu/index.ts`
- `apps/cliente/src/components/order/index.ts`
- `apps/cliente/src/app/(session)/index.tsx`

**Tests existentes:**

Ninguno — el endpoint público de menú para clientes aún no está implementado; los tests del módulo admin de ítems y categorías están pendientes.

**Precondición:** Cliente con sesión de mesa activa (`sesionId`, `mesaId` en `sessionStore`). El restaurante tiene ítems de menú configurados y disponibles.

**Flujo principal:**
1. El cliente tiene una sesión activa y abre la vista de menú en `/(session)`; el `sessionStore` provee `mesaId` y `restauranteId`
2. La app cliente realiza `GET /api/menu/restaurante/:restauranteId` (endpoint pendiente de implementación); el backend consulta el `Menu` activo para el restaurante según día de la semana y horario (`dias`, `horaInicio`, `horaFin`)
3. El backend retorna las `CategoriaMenu[]` del restaurante con sus `SubcategoriaMenu[]` anidadas; por cada subcategoría incluye los `ItemMenu[]` con `disponible: true`, `precioBase` (o `precioOverride` de `ItemSucursal` si aplica para esa sucursal), `descripcion` e `imagenUrl`
4. La app renderiza el menú agrupado visualmente por categoría y subcategoría, con un indicador de "No disponible" para ítems con `disponible: false`
5. El cliente toca un ítem para ver su detalle: nombre, descripción, precio, imagen y lista de `ItemIngrediente[]` con campos `esOriginal`, `removible` y `cantidad`
6. El cliente puede personalizar el ítem: quitar ingredientes con `removible: true` o agregar ingredientes opcionales disponibles para ese ítem; cada modificación genera un `PedidoItemMod { accion: 'QUITAR'|'AGREGAR', itemIngredienteId, cantidad }`
7. El cliente define la cantidad de unidades del ítem y toca "Agregar al carrito"
8. `cartStore` (Zustand) guarda el `PedidoItem { itemId, cantidad, precioUnitario, mods: PedidoItemMod[] }` en memoria local; el carrito acumula ítems sin enviarlos aún al backend
9. El cliente puede continuar navegando el menú y agregando más ítems al carrito, o proceder a confirmar el pedido (flujo de órdenes)

**Flujos alternativos:**
- 1a. `sessionStore` sin sesión activa: la app redirige a `check-in.tsx`.
- 2a. Error de red al cargar el menú: la app muestra mensaje de error con botón "Reintentar".
- 3a. Menú sin ítems disponibles: la app muestra "No hay ítems disponibles en este momento."
- 4a. Ítem con `disponible: false`: se muestra en la lista con indicador visual pero el botón "Agregar al carrito" está deshabilitado.
- 5a. Ítem sin imagen (`imagenUrl: null`): la app muestra un placeholder visual.

**Postcondición:** Los ítems seleccionados con sus modificaciones están en `cartStore` (memoria local) listos para confirmarse como pedido. El menú sigue visible para continuar agregando ítems.

**Notas:**
- Los `ItemMenu` pertenecen a una `Marca` (`marcaId`) y son compartidos entre sucursales; la tabla `ItemSucursal` permite override de `disponible` y `precioBase` por restaurante específico.
- La pantalla `/(session)/index.tsx` actual es un placeholder que muestra el nombre del usuario; la implementación del menú y carrito está planificada para el sprint correspondiente.
- Los campos `dias`, `horaInicio` y `horaFin` del modelo `Menu` permiten configurar menús diferenciados por día/horario (almuerzo, cena, fin de semana); el filtrado activo es responsabilidad del backend.
- `ClasificacionDieta` permite etiquetar ítems (ej. vegano, sin gluten); está en el schema pero pendiente de exponer en la API pública.

**Actor:** Cliente

---

## CU10: El mozo recibe llamadas de mesa en tiempo real

**Estado:** Pendiente

**Archivos:**
- `apps/backend/prisma/schema.prisma` (modelos `LlamadoMozo`, `AsignacionMesa`)
- `apps/backend/src/sessions/sessions.service.ts`
- `apps/mozo/src/features/waiter-calls/index.ts`
- `apps/mozo/src/features/notifications/index.ts`
- `apps/mozo/src/services/notifications.ts`
- `apps/mozo/src/services/socket.ts`
- `apps/mozo/src/store/mozoStore.ts`
- `apps/mozo/src/app/(panel)/index.tsx`
- `apps/cliente/src/features/waiter-call/index.ts`
- `apps/cliente/src/services/socket.ts`

**Tests existentes:**

Ninguno — el módulo `waiter-calls` (controller, service, gateway) aún no está implementado; los stores y servicios del mozo son stubs pendientes.

**Precondición:** Cliente con sesión de mesa activa. Mozo autenticado con la app mozo abierta y conectado al socket del restaurante. Módulo `waiter-calls` implementado en el backend (pendiente).

**Flujo principal:**
1. El cliente tiene una sesión activa y toca el botón "Llamar al mozo" en la app cliente
2. La app cliente emite el evento Socket.io `'waiter:call'` con `{ sesionId }` al servidor a través de la conexión socket establecida en `socket.ts`
3. El gateway de `waiter-calls` en el backend recibe el evento; crea un registro `LlamadoMozo { sesionId, estado: 'pendiente', mozoId: null }` en la BD con `prisma.llamadoMozo.create()`
4. El backend emite el evento `'waiter:called'` al room de Socket.io correspondiente al `restauranteId` de la mesa; todos los mozos conectados a ese room reciben el evento con `{ sesionId, mesaId, numeroMesa }`
5. La app mozo, suscrita al room de su restaurante, recibe el evento en el handler del socket
6. Si la app mozo está en background o la pantalla bloqueada: `notifications.ts` (Expo Notifications) dispara una push notification nativa con título "Llamado de mesa" y el número de mesa; el mozo recibe la alerta sin necesidad de tener la app abierta
7. Si la app mozo está en primer plano: la pantalla principal `(panel)/index.tsx` actualiza la lista de llamados pendientes mostrando el número de mesa con estado "Pendiente" y timestamp
8. El mozo se desplaza a la mesa; una vez atendido, toca "Atendido" en la app mozo
9. La app mozo emite el evento de confirmación al servidor (o llama a `PATCH /api/waiter-calls/:id/atender`)
10. El backend actualiza `LlamadoMozo.estado = 'atendido'`; emite confirmación al cliente via `'waiter:answered'`; la app cliente muestra "El mozo está en camino"

**Flujos alternativos:**
- 1a. El cliente no tiene sesión activa: el botón "Llamar al mozo" está deshabilitado en la app cliente.
- 4a. Ningún mozo conectado al room en el momento del llamado: el registro `LlamadoMozo` queda con `estado: 'pendiente'` en la BD; al reconectar, la app mozo carga los llamados pendientes mediante una consulta inicial al backend.
- 6a. El token de push notifications del mozo no está registrado: la notificación no se entrega; el llamado sigue visible al abrir la app.
- 8a. El mozo ignora el llamado o cierra la app: el `LlamadoMozo` permanece en estado "pendiente"; cualquier otro mozo del restaurante conectado puede atenderlo.
- 8b. El cliente llama al mozo múltiples veces seguidas: el backend puede implementar un debounce por `sesionId` para evitar llamados duplicados en ventana de tiempo corta.

**Postcondición:** `LlamadoMozo` con `estado: 'atendido'` en BD. El mozo se desplaza a la mesa. La app cliente muestra confirmación. El llamado desaparece de la lista de pendientes en la app mozo.

**Notas:**
- La tabla `AsignacionMesa` permite vincular un mozo específico a una sesión de mesa (`origen: 'manual'|'automatico'`); puede usarse para enrutar llamados al mozo asignado antes de broadcast al room completo.
- Las push notifications del mozo requieren registro del token Expo Push al iniciar sesión en la app mozo; este registro se implementará en el sprint del módulo mozo.
- El módulo backend `waiter-calls` (controller, service, gateway Socket.io) está listado en la arquitectura del CLAUDE.md pero aún no tiene implementación; la estructura de datos en Prisma ya está definida.
- El canal Socket.io del cliente ya existe en el tipo compartido `ClientToServerEvents { 'waiter:call': (sesionId: string) => void }` de `@menyu/types`.

**Actor:** Mozo (receptor) / Cliente (iniciador)
