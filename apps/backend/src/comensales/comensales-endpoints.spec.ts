import { AppDeEndpoints, SESION_CLIENTE, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { ComensalesController } from './comensales.controller'
import { ComensalesService } from './comensales.service'
import { DivisionService } from './division.service'

const ITEM_ID = '6f1c2a40-3333-4a1b-9c3d-000000000003'
const COMENSAL_ID = '6f1c2a40-4444-4a1b-9c3d-000000000004'
const BASE = `/sesiones/${SESION_CLIENTE.sesionId}/comensales`

describe('endpoints de comensales de una sesión', () => {
  let api: AppDeEndpoints
  const comensales = {
    crearComensal: jest.fn(),
    reclamarComensal: jest.fn(),
    listarComensales: jest.fn(),
    etiquetarItem: jest.fn(),
    desetiquetarItem: jest.fn(),
    listarEtiquetasDeItem: jest.fn(),
    borrarComensal: jest.fn(),
  }
  const division = { calcularPorConsumo: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(ComensalesController, [
      { provide: ComensalesService, useValue: comensales },
      { provide: DivisionService, useValue: division },
    ])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  describe('autenticación por sesión de mesa', () => {
    it('sin JWT de sesión responde 401', async () => {
      // Act
      const res = await api.pedir('get', BASE)

      // Assert
      expect(res.status).toBe(401)
      expect(comensales.listarComensales).not.toHaveBeenCalled()
    })

    it('un JWT que no es de cliente (un mozo) responde 401', async () => {
      // Act
      const res = await api.pedir('get', BASE, { sesion: USUARIOS.MOZO })

      // Assert
      expect(res.status).toBe(401)
    })

    it('un token de invitado (tipo cliente, sin sesión de mesa) responde 401', async () => {
      // Act
      const res = await api.pedir('get', BASE, { sesion: USUARIOS.CLIENTE })

      // Assert
      expect(res.status).toBe(401)
      expect(comensales.listarComensales).not.toHaveBeenCalled()
    })

    it('con el token de otra mesa responde 403: un comensal solo ve su propia sesión', async () => {
      // Act
      const res = await api.pedir('get', BASE, { sesion: { ...SESION_CLIENTE, sesionId: 'sesion-de-otra-mesa' } })

      // Assert
      expect(res.status).toBe(403)
      expect(comensales.listarComensales).not.toHaveBeenCalled()
    })
  })

  describe('alta y reclamo de comensales', () => {
    it('POST crea un comensal con el nombre sin espacios alrededor (201)', async () => {
      // Arrange
      comensales.crearComensal.mockResolvedValue({ id: COMENSAL_ID, nombre: 'Ana' })

      // Act
      const res = await api.pedir('post', BASE, { sesion: SESION_CLIENTE, body: { nombre: '  Ana  ' } })

      // Assert
      expect(res.status).toBe(201)
      expect(comensales.crearComensal).toHaveBeenCalledWith(SESION_CLIENTE.sesionId, { nombre: 'Ana' })
    })

    it.each([
      ['un nombre vacío', { nombre: '' }],
      ['un nombre de más de 40 caracteres', { nombre: 'x'.repeat(41) }],
      ['un creadoPorComensalId que no es UUID', { nombre: 'Ana', creadoPorComensalId: 'yo' }],
    ])('POST con %s responde 400', async (_caso, body) => {
      // Act
      const res = await api.pedir('post', BASE, { sesion: SESION_CLIENTE, body })

      // Assert
      expect(res.status).toBe(400)
      expect(comensales.crearComensal).not.toHaveBeenCalled()
    })

    it('POST /reclamar responde 200 con el comensal reclamado', async () => {
      // Arrange
      comensales.reclamarComensal.mockResolvedValue({ id: COMENSAL_ID })

      // Act
      const res = await api.pedir('post', `${BASE}/reclamar`, { sesion: SESION_CLIENTE, body: { nombre: 'Ana', pin: '1234' } })

      // Assert
      expect(res.status).toBe(200)
      expect(comensales.reclamarComensal).toHaveBeenCalledWith(SESION_CLIENTE.sesionId, { nombre: 'Ana', pin: '1234' })
    })

    it('GET lista los comensales de la sesión', async () => {
      // Arrange
      comensales.listarComensales.mockResolvedValue([{ id: COMENSAL_ID }])

      // Act
      const res = await api.pedir('get', BASE, { sesion: SESION_CLIENTE })

      // Assert
      expect(res.body).toEqual([{ id: COMENSAL_ID }])
    })
  })

  describe('etiquetas y división', () => {
    it('POST /etiquetas etiqueta un ítem a un comensal (201)', async () => {
      // Arrange
      comensales.etiquetarItem.mockResolvedValue({ ok: true })
      const body = { pedidoItemId: ITEM_ID, comensalId: COMENSAL_ID }

      // Act
      const res = await api.pedir('post', `${BASE}/etiquetas`, { sesion: SESION_CLIENTE, body })

      // Assert
      expect(res.status).toBe(201)
      expect(comensales.etiquetarItem).toHaveBeenCalledWith(SESION_CLIENTE.sesionId, body)
    })

    it('POST /etiquetas con ids que no son UUID responde 400', async () => {
      // Act
      const res = await api.pedir('post', `${BASE}/etiquetas`, { sesion: SESION_CLIENTE, body: { pedidoItemId: 'x', comensalId: 'y' } })

      // Assert
      expect(res.status).toBe(400)
    })

    it('DELETE y GET de etiquetas usan los ids de la ruta', async () => {
      // Arrange
      comensales.desetiquetarItem.mockResolvedValue({ ok: true })
      comensales.listarEtiquetasDeItem.mockResolvedValue([])

      // Act
      const baja = await api.pedir('delete', `${BASE}/etiquetas/${ITEM_ID}/${COMENSAL_ID}`, { sesion: SESION_CLIENTE })
      await api.pedir('get', `${BASE}/etiquetas/${ITEM_ID}`, { sesion: SESION_CLIENTE })

      // Assert
      expect(baja.status).toBe(200)
      expect(comensales.desetiquetarItem).toHaveBeenCalledWith(SESION_CLIENTE.sesionId, ITEM_ID, COMENSAL_ID)
      expect(comensales.listarEtiquetasDeItem).toHaveBeenCalledWith(SESION_CLIENTE.sesionId, ITEM_ID)
    })

    it('GET /division/por-consumo devuelve la división de la sesión', async () => {
      // Arrange
      division.calcularPorConsumo.mockResolvedValue({ total: 1000, porComensal: [] })

      // Act
      const res = await api.pedir('get', `${BASE}/division/por-consumo`, { sesion: SESION_CLIENTE })

      // Assert
      expect(res.body).toEqual({ total: 1000, porComensal: [] })
      expect(division.calcularPorConsumo).toHaveBeenCalledWith(SESION_CLIENTE.sesionId)
    })
  })

  describe('DELETE /:comensalId', () => {
    it('borra el comensal indicando quién lo pide', async () => {
      // Arrange
      comensales.borrarComensal.mockResolvedValue({ ok: true })

      // Act
      const res = await api.pedir('delete', `${BASE}/${COMENSAL_ID}`, {
        sesion: SESION_CLIENTE,
        query: { solicitante: ITEM_ID },
      })

      // Assert
      expect(res.status).toBe(200)
      expect(comensales.borrarComensal).toHaveBeenCalledWith(SESION_CLIENTE.sesionId, COMENSAL_ID, ITEM_ID)
    })

    it('sin un solicitante UUID responde 400', async () => {
      // Act
      const res = await api.pedir('delete', `${BASE}/${COMENSAL_ID}`, { sesion: SESION_CLIENTE, query: { solicitante: 'yo' } })

      // Assert
      expect(res.status).toBe(400)
      expect(comensales.borrarComensal).not.toHaveBeenCalled()
    })
  })
})
