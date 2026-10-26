import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// IDs UUID v4 válidos (version=4, variant=a)
const MARCA_ID  = '11111111-1111-4111-a111-111111111111'
const REST_ID   = '22222222-2222-4222-a222-222222222222'
const MESA_ID   = '33333333-3333-4333-a333-333333333333'
const ING1_ID   = '44444444-4444-4444-a444-444444444444'
const ING2_ID   = '55555555-5555-4555-a555-555555555555'
const ITEM_ID   = '66666666-6666-4666-a666-666666666666'
const IING1_ID  = '77777777-7777-4777-a777-777777777777'
const IING2_ID  = '88888888-8888-4888-a888-888888888888'

// Categorías
const CAT_ENTRADAS_ID    = 'aaaaaaaa-0001-4001-a001-000000000001'
const CAT_PRINCIPALES_ID = 'aaaaaaaa-0002-4002-a002-000000000002'
const CAT_BEBIDAS_ID     = 'aaaaaaaa-0003-4003-a003-000000000003'

// Ítems adicionales (sin ItemIngrediente, solo precioBase)
const ITEM_EMPANADA_ID  = 'bbbbbbbb-0001-4001-a001-000000000001'
const ITEM_PROVOLETA_ID = 'bbbbbbbb-0002-4002-a002-000000000002'
const ITEM_RABAS_ID     = 'bbbbbbbb-0003-4003-a003-000000000003'
const ITEM_MILANESA_ID  = 'bbbbbbbb-0004-4004-a004-000000000004'
const ITEM_BIFE_ID      = 'bbbbbbbb-0005-4005-a005-000000000005'
const ITEM_AGUA_ID      = 'bbbbbbbb-0006-4006-a006-000000000006'
const ITEM_CERVEZA_ID   = 'bbbbbbbb-0007-4007-a007-000000000007'
const ITEM_VINO_ID      = 'bbbbbbbb-0008-4008-a008-000000000008'

// Mesas adicionales
const MESA2_ID = 'cccccccc-0001-4001-a001-000000000001'
const MESA3_ID = 'cccccccc-0002-4002-a002-000000000002'

// Segunda marca con su restaurante y una mesa: sirve para probar los permisos entre marcas
// y el caso de un restaurante sin logo propio ni de marca.
const MARCA2_ID = 'eeeeeeee-0001-4001-a001-000000000001'
const REST2_ID  = 'eeeeeeee-0002-4002-a002-000000000002'
const MESA4_ID  = 'eeeeeeee-0003-4003-a003-000000000003'

// Usuarios. Las cuentas con contraseña propia (`admin`, y los `password_hash` de `mozo` y `cliente`) se
// retiraron en la Fase 5 de docs/auth/specs/auth.md: el personal entra por Supabase y el cliente, si quiere.
const MOZO_ID     = 'dddddddd-0003-4003-a003-000000000003'
const CLIENTE1_ID = 'dddddddd-0004-4004-a004-000000000004'
const CLIENTE2_ID = 'dddddddd-0005-4005-a005-000000000005'

// Usuarios de Supabase Auth (docs/auth/specs/auth.md). En local no hay Supabase Auth: el supabaseUserId
// es un UUID fijo que no existe en ningún proyecto. Para iniciar sesión hay que reemplazarlo por el
// id de un usuario real del Supabase de staging (el upsert no lo pisa).
const USUARIO_OWNER_ID       = 'ffffffff-0001-4001-a001-000000000001'
const OWNER_SUPABASE_USER_ID = 'ffffffff-0002-4002-a002-000000000002'

// Emails del seed (entorno local). Ya no hay contraseñas: la sesión la da Supabase.
// Los de `mozo` y `cliente` siguen sirviendo para probar los vínculos por email: invitar a `mozo@menyu.com`
// como MOZO engancha ese perfil, y registrar `cliente1@menyu.com` en web-auth recupera su historial de mesas.
const EMAIL_OWNER    = 'owner@menyu.com'
const EMAIL_MOZO     = 'mozo@menyu.com'
const EMAIL_CLIENTE1 = 'cliente1@menyu.com'
const EMAIL_CLIENTE2 = 'cliente2@menyu.com'

async function main() {
  await prisma.marca.upsert({
    where: { id: MARCA_ID },
    update: {},
    create: { id: MARCA_ID, nombre: 'Marca Seed', slug: 'seed-test-v2' },
  })

  await prisma.restaurante.upsert({
    where: { id: REST_ID },
    update: {},
    create: {
      id: REST_ID,
      marcaId: MARCA_ID,
      nombre: 'Restaurante Seed',
      modoSesion: 'abierto',
    },
  })

  await prisma.marca.upsert({
    where: { id: MARCA2_ID },
    update: {},
    create: { id: MARCA2_ID, nombre: 'Marca Seed 2', slug: 'seed-test-2' },
  })

  await prisma.restaurante.upsert({
    where: { id: REST2_ID },
    update: {},
    create: {
      id: REST2_ID,
      marcaId: MARCA2_ID,
      nombre: 'Restaurante Seed 2',
      modoSesion: 'abierto',
    },
  })

  // Direcciones: solo se cargan si el restaurante todavía no tiene una,
  // así re-seedear no pisa lo que se edite desde el panel de admin.
  await prisma.restaurante.updateMany({
    where: { id: REST_ID, direccion: null },
    data: { direccion: 'Av. Colón 1234, Córdoba' },
  })
  await prisma.restaurante.updateMany({
    where: { id: REST2_ID, direccion: null },
    data: { direccion: 'San Martín 456, Rosario' },
  })

  // ── Categorías ───────────────────────────────────────────────
  await prisma.categoriaMenu.upsert({
    where: { id: CAT_ENTRADAS_ID },
    update: {},
    create: { id: CAT_ENTRADAS_ID, restauranteId: REST_ID, nombre: 'Entradas', orden: 1 },
  })

  await prisma.categoriaMenu.upsert({
    where: { id: CAT_PRINCIPALES_ID },
    update: {},
    create: { id: CAT_PRINCIPALES_ID, restauranteId: REST_ID, nombre: 'Principales', orden: 2 },
  })

  await prisma.categoriaMenu.upsert({
    where: { id: CAT_BEBIDAS_ID },
    update: {},
    create: { id: CAT_BEBIDAS_ID, restauranteId: REST_ID, nombre: 'Bebidas', orden: 3 },
  })

  // ── Mesas ────────────────────────────────────────────────────
  const mesa = await prisma.mesa.upsert({
    where: { id: MESA_ID },
    update: {},
    create: {
      id: MESA_ID,
      restauranteId: REST_ID,
      numero: '99',
      qrToken: 'TEST-QR-SEED-002',
      pin: '9998',
      estado: 'libre',
      activo: true,
    },
  })

  const mesa2 = await prisma.mesa.upsert({
    where: { id: MESA2_ID },
    update: {},
    create: {
      id: MESA2_ID,
      restauranteId: REST_ID,
      numero: '100',
      qrToken: 'TEST-QR-SEED-100',
      pin: '9997',
      estado: 'libre',
      activo: true,
    },
  })

  const mesa3 = await prisma.mesa.upsert({
    where: { id: MESA3_ID },
    update: {},
    create: {
      id: MESA3_ID,
      restauranteId: REST_ID,
      numero: '101',
      qrToken: 'TEST-QR-SEED-101',
      pin: '9996',
      estado: 'libre',
      activo: true,
    },
  })

  const mesa4 = await prisma.mesa.upsert({
    where: { id: MESA4_ID },
    update: {},
    create: {
      id: MESA4_ID,
      restauranteId: REST2_ID,
      numero: '1',
      qrToken: 'TEST-QR-SEED-201',
      pin: '9995',
      estado: 'libre',
      activo: true,
    },
  })

  // ── Ingredientes ─────────────────────────────────────────────
  await prisma.ingrediente.upsert({
    where: { id: ING1_ID },
    update: {},
    create: {
      id: ING1_ID,
      restauranteId: REST_ID,
      nombre: 'Queso Extra',
      esAlergeno: false,
    },
  })

  await prisma.ingrediente.upsert({
    where: { id: ING2_ID },
    update: {},
    create: {
      id: ING2_ID,
      restauranteId: REST_ID,
      nombre: 'Cebolla',
      esAlergeno: false,
    },
  })

  // ── Ítem con modificaciones (casos de prueba existentes) ──────
  // Único upsert con update no vacío: asocia el ítem preexistente a
  // Principales. Precio, ingredientes e IDs quedan sin tocar.
  const item = await prisma.itemMenu.upsert({
    where: { id: ITEM_ID },
    update: { categoriaId: CAT_PRINCIPALES_ID },
    create: {
      id: ITEM_ID,
      restauranteId: REST_ID,
      categoriaId: CAT_PRINCIPALES_ID,
      nombre: 'Hamburguesa Seed',
      precioBase: 1500.0,
      disponible: true,
    },
  })

  // Queso Extra: solo agregable, precioExtra=200
  const iing1 = await prisma.itemIngrediente.upsert({
    where: { id: IING1_ID },
    update: {},
    create: {
      id: IING1_ID,
      itemId: ITEM_ID,
      ingredienteId: ING1_ID,
      esOriginal: false,
      cantidad: 1,
      esAgregable: true,
      esRemovible: false,
      precioExtra: 200.0,
    },
  })

  // Cebolla: solo removible, precioExtra=50
  const iing2 = await prisma.itemIngrediente.upsert({
    where: { id: IING2_ID },
    update: {},
    create: {
      id: IING2_ID,
      itemId: ITEM_ID,
      ingredienteId: ING2_ID,
      esOriginal: true,
      cantidad: 1,
      esAgregable: false,
      esRemovible: true,
      precioExtra: 50.0,
    },
  })

  // ── Ítems simples (precios distintos para testear división) ───
  const itemsSimples = [
    { id: ITEM_EMPANADA_ID,  categoriaId: CAT_ENTRADAS_ID,    nombre: 'Empanada de Carne', precioBase:  800.0 },
    { id: ITEM_PROVOLETA_ID, categoriaId: CAT_ENTRADAS_ID,    nombre: 'Provoleta',         precioBase: 2300.0 },
    { id: ITEM_RABAS_ID,     categoriaId: CAT_ENTRADAS_ID,    nombre: 'Rabas',             precioBase: 3100.0 },
    { id: ITEM_MILANESA_ID,  categoriaId: CAT_PRINCIPALES_ID, nombre: 'Milanesa Napo',     precioBase: 4200.0 },
    { id: ITEM_BIFE_ID,      categoriaId: CAT_PRINCIPALES_ID, nombre: 'Bife de Chorizo',   precioBase: 6800.0 },
    { id: ITEM_AGUA_ID,      categoriaId: CAT_BEBIDAS_ID,     nombre: 'Agua Mineral',      precioBase:  900.0 },
    { id: ITEM_CERVEZA_ID,   categoriaId: CAT_BEBIDAS_ID,     nombre: 'Cerveza Artesanal', precioBase: 2600.0 },
    { id: ITEM_VINO_ID,      categoriaId: CAT_BEBIDAS_ID,     nombre: 'Vino Malbec',       precioBase: 5400.0 },
  ]

  for (const it of itemsSimples) {
    await prisma.itemMenu.upsert({
      where: { id: it.id },
      update: {},
      create: { ...it, restauranteId: REST_ID, disponible: true },
    })
  }

  // ── Ítems en descuento (ejemplo) ──────────────────────────────
  // Milanesa Napo (4200) al 20 % y Cerveza Artesanal (2600) al 25 %. Se cargan solo si el ítem todavía no
  // tiene descuento, así re-seedear no pisa uno cargado a mano. El porcentaje no se guarda: se calcula.
  const descuentosDeEjemplo = [
    { id: ITEM_MILANESA_ID, precioDescuento: 3360 },
    { id: ITEM_CERVEZA_ID,  precioDescuento: 1950 },
  ]
  for (const d of descuentosDeEjemplo) {
    await prisma.itemMenu.updateMany({
      where: { id: d.id, precioDescuento: null },
      data: { precioDescuento: d.precioDescuento },
    })
  }

  // ── Usuarios ─────────────────────────────────────────────────
  // Cliente tiene email @unique → se upsertea por email.
  // Mozo.email es String? sin @unique → se upsertea por id.
  // `update: {}` en todos: re-seedear no pisa lo que ya haya en la base.

  await prisma.mozo.upsert({
    where: { id: MOZO_ID },
    update: {},
    create: {
      id: MOZO_ID,
      restauranteId: REST_ID,
      nombre: 'Mozo Seed',
      email: EMAIL_MOZO,
      activo: true,
    },
  })

  await prisma.cliente.upsert({
    where: { email: EMAIL_CLIENTE1 },
    update: {},
    create: { id: CLIENTE1_ID, nombre: 'Cliente Uno', email: EMAIL_CLIENTE1 },
  })

  await prisma.cliente.upsert({
    where: { email: EMAIL_CLIENTE2 },
    update: {},
    create: { id: CLIENTE2_ID, nombre: 'Cliente Dos', email: EMAIL_CLIENTE2 },
  })

  // ── Usuarios de Supabase Auth y membresías ───────────────────
  // OWNER de Marca Seed, la marca de Restaurante Seed. La membresía de OWNER va por marca.
  const usuarioOwner = await prisma.usuario.upsert({
    where: { email: EMAIL_OWNER },
    update: {},
    create: {
      id: USUARIO_OWNER_ID,
      supabaseUserId: OWNER_SUPABASE_USER_ID,
      email: EMAIL_OWNER,
      nombre: 'Owner Seed',
    },
  })

  await prisma.membresia.upsert({
    where: { usuarioId_marcaId: { usuarioId: usuarioOwner.id, marcaId: MARCA_ID } },
    update: {},
    create: { usuarioId: usuarioOwner.id, marcaId: MARCA_ID, rol: 'OWNER' },
  })

  console.log('\n=== SEED OK ===')
  console.log('Mesa qrToken :', mesa.qrToken)
  console.log('Mesa pin     :', mesa.pin)
  console.log('Item ID      :', item.id)
  console.log('ItemIng1 ID  :', iing1.id, '← Queso Extra (AGREGAR, +200)')
  console.log('ItemIng2 ID  :', iing2.id, '← Cebolla     (QUITAR,  -50)')
  console.log('\nPrecio base            :', 1500)
  console.log('Con AGREGAR queso      :', 1500 + 200)
  console.log('Con AGREGAR+QUITAR     :', 1500 + 200 - 50, '← esperado con mods')

  console.log('\n--- Mesas ---')
  for (const m of [mesa, mesa2, mesa3]) {
    console.log(`Mesa ${m.numero.padEnd(4)} qrToken: ${m.qrToken.padEnd(18)} pin: ${m.pin}`)
  }
  console.log(`Mesa ${mesa4.numero.padEnd(4)} qrToken: ${mesa4.qrToken.padEnd(18)} pin: ${mesa4.pin}  (Restaurante Seed 2)`)

  console.log('\n--- Perfiles sin cuenta (el login propio se retiró en la Fase 5 de auth) ---')
  console.log(`Mozo      : ${EMAIL_MOZO}      (invitarlo como MOZO engancha este perfil)`)
  console.log(`Cliente 1 : ${EMAIL_CLIENTE1}  (registrarlo en web-auth recupera su historial)`)
  console.log(`Cliente 2 : ${EMAIL_CLIENTE2}`)

  console.log('\n--- Usuarios Supabase (supabaseUserId ficticio: reemplazar para iniciar sesión) ---')
  console.log(`OWNER     : ${usuarioOwner.email}  (Marca Seed → Restaurante Seed)`)

  console.log('\n--- Menú por categoría ---')
  console.log('Entradas    : Empanada de Carne 800 | Provoleta 2300 | Rabas 3100')
  console.log('Principales : Hamburguesa Seed 1500 | Milanesa Napo 4200 | Bife de Chorizo 6800')
  console.log('Bebidas     : Agua Mineral 900 | Cerveza Artesanal 2600 | Vino Malbec 5400')
  console.log('En descuento: Milanesa Napo 4200 -> 3360 (-20%) | Cerveza Artesanal 2600 -> 1950 (-25%)')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
