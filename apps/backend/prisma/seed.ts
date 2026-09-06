import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Mismo factor de costo que auth.service.ts (BCRYPT_ROUNDS, no exportada).
// Si cambia allá, cambiarlo acá.
const BCRYPT_ROUNDS = 10

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

// Usuarios
const ADMIN_ROOT_ID  = 'dddddddd-0001-4001-a001-000000000001'
const ADMIN_OWNER_ID = 'dddddddd-0002-4002-a002-000000000002'
const MOZO_ID        = 'dddddddd-0003-4003-a003-000000000003'
const CLIENTE1_ID    = 'dddddddd-0004-4004-a004-000000000004'
const CLIENTE2_ID    = 'dddddddd-0005-4005-a005-000000000005'

// Credenciales del seed (entorno local — nunca usar en QA ni producción)
const CRED_ROOT     = { email: 'root@menyu.com',     password: 'root1234'    }
const CRED_OWNER    = { email: 'owner@menyu.com',    password: 'owner1234'   }
const CRED_MOZO     = { email: 'mozo@menyu.com',     password: 'mozo1234'    }
const CRED_CLIENTE1 = { email: 'cliente1@menyu.com', password: 'cliente1234' }
const CRED_CLIENTE2 = { email: 'cliente2@menyu.com', password: 'cliente1234' }

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

  // ── Usuarios ─────────────────────────────────────────────────
  // Admin y Cliente tienen email @unique → se upsertean por email.
  // Mozo.email es String? sin @unique → se upsertea por id.
  // update vacío: bcrypt genera un salt distinto por corrida, así que
  // re-seedear no debe reescribir hashes ya persistidos.

  await prisma.admin.upsert({
    where: { email: CRED_ROOT.email },
    update: {},
    create: {
      id: ADMIN_ROOT_ID,
      email: CRED_ROOT.email,
      passwordHash: await bcrypt.hash(CRED_ROOT.password, BCRYPT_ROUNDS),
      rol: 'ROOT',
    },
  })

  await prisma.admin.upsert({
    where: { email: CRED_OWNER.email },
    update: {},
    create: {
      id: ADMIN_OWNER_ID,
      marcaId: MARCA_ID,
      email: CRED_OWNER.email,
      passwordHash: await bcrypt.hash(CRED_OWNER.password, BCRYPT_ROUNDS),
      rol: 'OWNER',
    },
  })

  await prisma.mozo.upsert({
    where: { id: MOZO_ID },
    update: {},
    create: {
      id: MOZO_ID,
      restauranteId: REST_ID,
      nombre: 'Mozo Seed',
      email: CRED_MOZO.email,
      passwordHash: await bcrypt.hash(CRED_MOZO.password, BCRYPT_ROUNDS),
      activo: true,
    },
  })

  await prisma.cliente.upsert({
    where: { email: CRED_CLIENTE1.email },
    update: {},
    create: {
      id: CLIENTE1_ID,
      nombre: 'Cliente Uno',
      email: CRED_CLIENTE1.email,
      passwordHash: await bcrypt.hash(CRED_CLIENTE1.password, BCRYPT_ROUNDS),
    },
  })

  await prisma.cliente.upsert({
    where: { email: CRED_CLIENTE2.email },
    update: {},
    create: {
      id: CLIENTE2_ID,
      nombre: 'Cliente Dos',
      email: CRED_CLIENTE2.email,
      passwordHash: await bcrypt.hash(CRED_CLIENTE2.password, BCRYPT_ROUNDS),
    },
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

  console.log('\n--- Usuarios (solo entorno local) ---')
  console.log(`Admin ROOT   : ${CRED_ROOT.email}     / ${CRED_ROOT.password}`)
  console.log(`Admin OWNER  : ${CRED_OWNER.email}    / ${CRED_OWNER.password}`)
  console.log(`Mozo         : ${CRED_MOZO.email}     / ${CRED_MOZO.password}`)
  console.log(`Cliente 1    : ${CRED_CLIENTE1.email} / ${CRED_CLIENTE1.password}`)
  console.log(`Cliente 2    : ${CRED_CLIENTE2.email} / ${CRED_CLIENTE2.password}`)

  console.log('\n--- Menú por categoría ---')
  console.log('Entradas    : Empanada de Carne 800 | Provoleta 2300 | Rabas 3100')
  console.log('Principales : Hamburguesa Seed 1500 | Milanesa Napo 4200 | Bife de Chorizo 6800')
  console.log('Bebidas     : Agua Mineral 900 | Cerveza Artesanal 2600 | Vino Malbec 5400')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
