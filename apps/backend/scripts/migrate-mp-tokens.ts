import { PrismaClient } from '@prisma/client'
import { createCipheriv, randomBytes, scryptSync } from 'crypto'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env') })

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEY_LENGTH = 32

const RESTAURANTE_ID = '22222222-2222-4222-a222-222222222222'

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('hex')
}

function looksEncrypted(value: string): boolean {
  // El formato encriptado es hex puro y tiene al menos IV(12) + TAG(16) + 1 byte = 29 bytes → 58 hex chars
  return /^[0-9a-f]{58,}$/.test(value)
}

async function main() {
  const secret = process.env.MP_ENCRYPTION_KEY
  if (!secret) {
    console.error('MP_ENCRYPTION_KEY no está definida en .env')
    process.exit(1)
  }

  const key = scryptSync(secret, 'menyu-salt', KEY_LENGTH)
  const prisma = new PrismaClient()

  try {
    const restaurante = await prisma.restaurante.findUnique({
      where: { id: RESTAURANTE_ID },
      select: { id: true, mpAccessToken: true, mpRefreshToken: true },
    })

    if (!restaurante) {
      console.error(`Restaurante ${RESTAURANTE_ID} no encontrado`)
      return
    }

    const updates: { mpAccessToken?: string; mpRefreshToken?: string | null } = {}

    if (restaurante.mpAccessToken) {
      if (looksEncrypted(restaurante.mpAccessToken)) {
        console.log('mpAccessToken ya parece estar encriptado — se omite')
      } else {
        updates.mpAccessToken = encrypt(restaurante.mpAccessToken, key)
        console.log('mpAccessToken encriptado OK')
      }
    } else {
      console.log('mpAccessToken es null — se omite')
    }

    if (restaurante.mpRefreshToken) {
      if (looksEncrypted(restaurante.mpRefreshToken)) {
        console.log('mpRefreshToken ya parece estar encriptado — se omite')
      } else {
        updates.mpRefreshToken = encrypt(restaurante.mpRefreshToken, key)
        console.log('mpRefreshToken encriptado OK')
      }
    } else {
      console.log('mpRefreshToken es null — se omite')
    }

    if (Object.keys(updates).length === 0) {
      console.log('Nada que actualizar.')
      return
    }

    await prisma.restaurante.update({
      where: { id: RESTAURANTE_ID },
      data: updates,
    })

    console.log('Restaurante actualizado en DB correctamente.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
