import { createHmac } from 'crypto'
import { evaluarFirmaDelWebhook } from './firma-del-webhook'

// El vector fijo usa los datos de los fixtures del SDK oficial (sdk-nodejs, src/utils/webhook/webhook.spec.ts). Mercado
// Pago no publica un par secreto + v1: el hash esperado se calculó con crypto y se verificó con el validador de
// mercadopago@3.2.0. Los demás casos firman con `firmar`, que arma el manifest como la doc de Webhooks.
const SECRET = 'your_secret_key_here'
const REQUEST_ID = '2066ca19-c6f1-498a-be75-1923005edd06'
const TS = '1742505638683'
const DATA_ID = '123456'

/** HMAC-SHA256 en hexa del manifest, sin los pares que falten. */
function firmar({ dataId, requestId, ts = TS, secret = SECRET }: { dataId?: string; requestId?: string; ts?: string; secret?: string }) {
  const manifest = [dataId && `id:${dataId}`, requestId && `request-id:${requestId}`, `ts:${ts}`].filter(Boolean).join(';') + ';'
  return createHmac('sha256', secret).update(manifest).digest('hex')
}

const header = (v1: string, ts = TS) => `ts=${ts},v1=${v1}`
const evaluar = (datos: Partial<Parameters<typeof evaluarFirmaDelWebhook>[0]>) =>
  evaluarFirmaDelWebhook({ xSignature: undefined, xRequestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET, ...datos })

describe('evaluarFirmaDelWebhook', () => {
  describe('vectores fijos', () => {
    it('request-id + ts, sin data.id (8a7b0cc7…): valida', () => {
      const v1 = '8a7b0cc777a8217c3bab41a50c95dc92debbc6f8448f1c967dfe10ac1cb8b894'
      expect(firmar({ requestId: REQUEST_ID })).toBe(v1) // el vector y `firmar` dicen lo mismo

      expect(evaluar({ xSignature: header(v1), dataId: undefined })).toBe('valida')
    })

    it('con data.id 123456 (3376cb55…): valida', () => {
      const v1 = '3376cb55bc5bf870e8c0c9c3e5987f0a260517ed03ae61a077bcfa05ce44c446'
      expect(firmar({ dataId: DATA_ID, requestId: REQUEST_ID })).toBe(v1)

      expect(evaluar({ xSignature: header(v1) })).toBe('valida')
    })
  })

  describe('invalida', () => {
    const v1 = firmar({ dataId: DATA_ID, requestId: REQUEST_ID })

    it('con otro secreto', () => {
      expect(evaluar({ xSignature: header(v1), secret: 'otro-secreto' })).toBe('invalida')
    })

    it.each([
      ['el ts', { xSignature: header(v1, '1742505638684') }],
      ['el request-id', { xSignature: header(v1), xRequestId: '2066ca19-c6f1-498a-be75-1923005edd07' }],
      ['el data.id', { xSignature: header(v1), dataId: '123457' }],
    ])('si se altera %s', (_caso, datos) => {
      expect(evaluar(datos)).toBe('invalida')
    })

    it.each([
      ['más corto', v1.slice(0, 63)],
      ['más largo', `${v1}0`],
      ['del mismo largo pero no hexa', 'z'.repeat(64)],
      // Mismo largo en caracteres y otro en bytes: timingSafeEqual lanzaría con buffers de distinto largo.
      ['del mismo largo con un carácter de dos bytes', `ñ${v1.slice(1)}`],
    ])('un v1 %s: invalida, sin lanzar', (_caso, otro) => {
      expect(() => evaluar({ xSignature: header(otro) })).not.toThrow()
      expect(evaluar({ xSignature: header(otro) })).toBe('invalida')
    })
  })

  describe('no-evaluable', () => {
    it.each([
      ['sin header', undefined],
      ['vacío', ''],
      ['solo espacios', '   '],
      ['sin ts', `v1=${'a'.repeat(64)}`],
      ['sin v1', `ts=${TS}`],
      ['solo con otra versión', `ts=${TS},v2=${'a'.repeat(64)}`],
      ['con un ts que no es un número', `ts=ayer,v1=${'a'.repeat(64)}`],
      ['sin la forma clave=valor', 'basura'],
    ])('%s', (_caso, xSignature) => {
      expect(evaluar({ xSignature })).toBe('no-evaluable')
    })

    it('sin secreto, aunque la firma esté bien', () => {
      expect(evaluar({ xSignature: header(firmar({ dataId: DATA_ID, requestId: REQUEST_ID })), secret: '' })).toBe('no-evaluable')
    })
  })

  describe('los pares que faltan se omiten del manifest', () => {
    it.each([
      ['sin x-request-id', { dataId: DATA_ID }, { xRequestId: undefined }],
      ['sin data.id', { requestId: REQUEST_ID }, { dataId: undefined }],
      ['sin los dos', {}, { xRequestId: undefined, dataId: undefined }],
      ['con un x-request-id vacío (cuenta como ausente)', { dataId: DATA_ID }, { xRequestId: '' }],
    ])('%s: la firma calculada sin ese par es válida', (_caso, firmado, recibido) => {
      expect(evaluar({ xSignature: header(firmar(firmado)), ...recibido })).toBe('valida')
    })

    it('si la firma incluye un par que la notificación no trae, es inválida', () => {
      const conRequestId = firmar({ dataId: DATA_ID, requestId: REQUEST_ID })

      expect(evaluar({ xSignature: header(conRequestId), xRequestId: undefined })).toBe('invalida')
    })
  })

  it('acepta espacios alrededor de las comas y del header', () => {
    const v1 = firmar({ dataId: DATA_ID, requestId: REQUEST_ID })

    expect(evaluar({ xSignature: `  ts=${TS} ,  v1=${v1}  ` })).toBe('valida')
  })

  it('el data.id no se pasa a minúscula (los SDK oficiales firman con el original)', () => {
    const v1 = firmar({ dataId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3', requestId: REQUEST_ID })

    expect(evaluar({ xSignature: header(v1), dataId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3' })).toBe('valida')
    expect(evaluar({ xSignature: header(v1), dataId: 'ord01jq4s4ky8hwq6na5pxb65b3d3' })).toBe('invalida')
  })
})
