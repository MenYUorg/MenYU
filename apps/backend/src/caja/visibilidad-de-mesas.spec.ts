import { Rol } from '@prisma/client'
import { AccesoService } from '../auth/supabase/acceso.service'
import { ASIGNADA, decidirVisibilidad, dondeMesaVisible, VisibilidadDeMesas, visibilidadDeMesas } from './visibilidad-de-mesas'

const PERFIL = { id: 'mozo-1' }
const TODAS: VisibilidadDeMesas = { tipo: 'todas' }
const delMozo = (mozoId: string | null): VisibilidadDeMesas => ({ tipo: 'del-mozo', mozoId })

describe('decidirVisibilidad', () => {
  it.each<[string, Rol[], { id: string } | null, VisibilidadDeMesas]>([
    ['OWNER', ['OWNER'], null, TODAS],
    ['GERENTE', ['GERENTE'], null, TODAS],
    ['JEFE_SALON', ['JEFE_SALON'], null, TODAS],
    ['OWNER con perfil', ['OWNER'], PERFIL, TODAS],
    ['GERENTE con perfil', ['GERENTE'], PERFIL, TODAS],
    ['JEFE_SALON con perfil', ['JEFE_SALON'], PERFIL, TODAS],
    ['MOZO con perfil', ['MOZO'], PERFIL, delMozo('mozo-1')],
    ['MOZO con otro perfil', ['MOZO'], { id: 'mozo-2' }, delMozo('mozo-2')],
    ['MOZO sin perfil', ['MOZO'], null, delMozo(null)],
    ['COCINA', ['COCINA'], null, delMozo(null)],
    ['COCINA con perfil', ['COCINA'], PERFIL, delMozo('mozo-1')],
    ['sin roles', [], null, delMozo(null)],
    ['OWNER (marca) + MOZO', ['OWNER', 'MOZO'], PERFIL, TODAS],
    ['MOZO + OWNER (marca), en otro orden', ['MOZO', 'OWNER'], PERFIL, TODAS],
  ])('%s', (_caso, roles, mozo, esperado) => {
    expect(decidirVisibilidad(roles, mozo)).toEqual(esperado)
  })

  it('JEFE_SALON con el perfil inactivo (mozoDe da null): todas igual, decide el rol', () => {
    expect(decidirVisibilidad(['JEFE_SALON'], null)).toEqual(TODAS)
  })
})

describe('visibilidadDeMesas', () => {
  function accesoCon(roles: Rol[], mozo: { id: string } | null) {
    const rolesEnRestaurante = jest.fn().mockResolvedValue(roles)
    const mozoDe = jest.fn().mockResolvedValue(mozo && { ...mozo, nombre: 'Ana', esJefeSalon: false })
    return { acceso: { rolesEnRestaurante, mozoDe } as unknown as AccesoService, rolesEnRestaurante, mozoDe }
  }

  it.each<Rol>(['OWNER', 'GERENTE', 'JEFE_SALON'])('con %s devuelve todas sin llamar a mozoDe', async (rol) => {
    const { acceso, rolesEnRestaurante, mozoDe } = accesoCon([rol], PERFIL)

    expect(await visibilidadDeMesas(acceso, 'usuario-1', 'rest-1')).toEqual(TODAS)
    expect(rolesEnRestaurante).toHaveBeenCalledTimes(1)
    expect(rolesEnRestaurante).toHaveBeenCalledWith('usuario-1', 'rest-1')
    expect(mozoDe).not.toHaveBeenCalled()
  })

  it('con MOZO llama a mozoDe una sola vez, con el usuario y el restaurante pedidos, y filtra por su perfil', async () => {
    const { acceso, mozoDe } = accesoCon(['MOZO'], PERFIL)

    expect(await visibilidadDeMesas(acceso, 'usuario-1', 'rest-1')).toEqual(delMozo('mozo-1'))
    expect(mozoDe).toHaveBeenCalledTimes(1)
    expect(mozoDe).toHaveBeenCalledWith('usuario-1', 'rest-1')
  })

  it('con MOZO sin perfil activo: solo las sin asignar', async () => {
    const { acceso, mozoDe } = accesoCon(['MOZO'], null)

    expect(await visibilidadDeMesas(acceso, 'usuario-1', 'rest-1')).toEqual(delMozo(null))
    expect(mozoDe).toHaveBeenCalledTimes(1)
  })
})

describe('dondeMesaVisible', () => {
  it('ASIGNADA: de un turno abierto y a un mozo activo', () => {
    expect(ASIGNADA).toEqual({ turno: { cerradoEn: null }, mozo: { activo: true } })
  })

  it('todas: sin filtro', () => {
    expect(dondeMesaVisible(TODAS)).toEqual({})
  })

  it('del mozo sin perfil: solo las sin asignar', () => {
    expect(dondeMesaVisible(delMozo(null))).toEqual({ asignacionesTurno: { none: ASIGNADA } })
  })

  it.each(['mozo-1', 'mozo-2'])('del mozo con perfil (%s): las sin asignar o las suyas en el turno abierto', (mozoId) => {
    expect(dondeMesaVisible(delMozo(mozoId))).toEqual({
      OR: [
        { asignacionesTurno: { none: ASIGNADA } },
        { asignacionesTurno: { some: { turno: { cerradoEn: null }, mozoId } } },
      ],
    })
  })
})
