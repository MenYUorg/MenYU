import { Injectable } from '@nestjs/common'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEY_LENGTH = 32

@Injectable()
export class CryptoService {
  private readonly key: Buffer

  constructor() {
    const secret = process.env.MP_ENCRYPTION_KEY
    if (!secret) throw new Error('MP_ENCRYPTION_KEY no está definida')
    // Derivar clave de 32 bytes desde el secret usando scrypt
    this.key = scryptSync(secret, 'menyu-salt', KEY_LENGTH)
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    // Formato: iv(12) + tag(16) + ciphertext — todo en hex
    return Buffer.concat([iv, tag, encrypted]).toString('hex')
  }

  decrypt(ciphertext: string): string {
    const buf = Buffer.from(ciphertext, 'hex')
    const iv = buf.subarray(0, IV_LENGTH)
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH)
    const decipher = createDecipheriv(ALGORITHM, this.key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted) + decipher.final('utf8')
  }
}
