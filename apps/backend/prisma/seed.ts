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

  const item = await prisma.itemMenu.upsert({
    where: { id: ITEM_ID },
    update: {},
    create: {
      id: ITEM_ID,
      restauranteId: REST_ID,
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

  console.log('\n=== SEED OK ===')
  console.log('Mesa qrToken :', mesa.qrToken)
  console.log('Mesa pin     :', mesa.pin)
  console.log('Item ID      :', item.id)
  console.log('ItemIng1 ID  :', iing1.id, '← Queso Extra (AGREGAR, +200)')
  console.log('ItemIng2 ID  :', iing2.id, '← Cebolla     (QUITAR,  -50)')
  console.log('\nPrecio base            :', 1500)
  console.log('Con AGREGAR queso      :', 1500 + 200)
  console.log('Con AGREGAR+QUITAR     :', 1500 + 200 - 50, '← esperado con mods')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
