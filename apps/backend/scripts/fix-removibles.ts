import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const result = await prisma.itemIngrediente.updateMany({
    where: {
      esRemovible: true,
      esOriginal: false,
    },
    data: {
      esOriginal: true,
    },
  })
  console.log(`Actualizados: ${result.count} ingredientes`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
