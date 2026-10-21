import { Controller, Delete, Get, Patch, Post, Put } from '@nestjs/common'
import { ROLES_KEY } from '../common/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { AppModule } from '../app.module'
import { CamposPermitidosGuard } from './comun/campos-permitidos.guard'
import { RutaDeLaApp, rutasDe, rutasDeLaApp } from '../test/rutas'

/**
 * Recorre el enrutador de TODA la aplicación (docs/plan-consola-root.md, secciones 7 y 10). Cuida las reglas que no se pueden
 * romper con un cambio descuidado en cualquier otro lado: quién entra a `/root/*`, que no haya cómo borrar cuentas ROOT y que el
 * historial no tenga ninguna ruta que lo modifique.
 */
describe('el enrutador de la aplicación', () => {
  const rutas = rutasDeLaApp(AppModule)
  const texto = (r: RutaDeLaApp) => `${r.metodo} ${r.ruta}`
  const deRoot = rutas.filter((r) => r.ruta === '/root' || r.ruta.startsWith('/root/'))

  it('recorre los controllers de toda la aplicación (si no, los demás tests de acá no prueban nada)', () => {
    expect(rutas.length).toBeGreaterThan(80)
    expect(rutas.map(texto)).toEqual(expect.arrayContaining(['POST /auth/login', 'GET /discovery', 'GET /admins', 'DELETE /admins/:id']))
  })

  it('las rutas de /root son exactamente las de la etapa 1a (si se agrega o se saca una, hay que actualizar esta lista y el plan)', () => {
    expect(deRoot.map(texto).sort()).toEqual(
      [
        'GET /root/duenos',
        'POST /root/marcas/:id/duenos',
        'PATCH /root/duenos/:id',
        'POST /root/duenos/:id/restablecer-password',
        'DELETE /root/duenos/:id',
        'GET /root/roots',
        'POST /root/roots',
        'POST /root/roots/:id/restablecer-password',
        'GET /root/marcas',
        'POST /root/marcas',
        'GET /root/marcas/:id',
        'PATCH /root/marcas/:id',
        'POST /root/marcas/:id/baja',
        'POST /root/marcas/:id/reactivar',
        'POST /root/marcas/:id/restaurantes',
        'PATCH /root/restaurantes/:id',
        'POST /root/restaurantes/:id/baja',
        'POST /root/restaurantes/:id/reactivar',
        'GET /root/historial',
      ].sort(),
    )
  })

  // Decisión 5: "borrar" una marca o un restaurante es una baja lógica y reversible; no se borra ninguna fila.
  it('no hay ninguna ruta que borre marcas ni restaurantes (DELETE o PUT) en /root', () => {
    const borrables = deRoot.filter((r) => ['DELETE', 'PUT'].includes(r.metodo) && /^\/root\/(marcas|restaurantes)(\/|$)/.test(r.ruta))

    expect(borrables.map(texto)).toEqual([])
  })

  it('los únicos DELETE de /root son los de dueños (las cuentas OWNER sí se eliminan de verdad)', () => {
    expect(deRoot.filter((r) => r.metodo === 'DELETE').map(texto)).toEqual(['DELETE /root/duenos/:id'])
  })

  it('el historial solo se lee: su única ruta es GET /root/historial', () => {
    expect(deRoot.filter((r) => r.ruta.startsWith('/root/historial')).map(texto)).toEqual(['GET /root/historial'])
  })

  it('las rutas que reciben un cuerpo de ROOT sobre marcas y restaurantes rechazan los campos de más (CamposPermitidos)', () => {
    const conCuerpo = deRoot.filter(
      (r) => /^\/root\/(marcas|restaurantes)/.test(r.ruta) && ((r.metodo === 'POST' && !/\/(baja|reactivar|duenos)$/.test(r.ruta)) || r.metodo === 'PATCH'),
    )
    expect(conCuerpo.map(texto).sort()).toEqual(['PATCH /root/marcas/:id', 'PATCH /root/restaurantes/:id', 'POST /root/marcas', 'POST /root/marcas/:id/restaurantes'])

    for (const { controller } of conCuerpo) {
      const guards: unknown[] = Reflect.getMetadata('__guards__', controller) ?? []
      expect(guards).toContain(CamposPermitidosGuard)
    }
  })

  describe('quién entra a /root', () => {
    it.each([...new Set(deRoot.map((r) => r.controller))].map((c) => [c.name, c] as const))(
      '%s: solo ROOT, con JWT, a nivel de controller (no depende de que cada ruta lo repita)',
      (_nombre, controller) => {
        expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual(['ROOT'])
        const guards: unknown[] = Reflect.getMetadata('__guards__', controller) ?? []
        expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]))
      },
    )

    it('ninguna ruta de /root cambia el rol que la deja entrar (nadie más que ROOT)', () => {
      for (const { controller } of deRoot) {
        for (const nombre of Object.getOwnPropertyNames(controller.prototype)) {
          const manejador = (controller.prototype as Record<string, unknown>)[nombre]
          if (typeof manejador !== 'function') continue
          const roles: string[] | undefined = Reflect.getMetadata(ROLES_KEY, manejador)
          if (roles) expect(roles).toEqual(['ROOT'])
        }
      }
    })
  })

  describe('las cuentas ROOT no se borran desde la API (decisión 15)', () => {
    const quePermiteBorrarRoots = (lista: RutaDeLaApp[]) =>
      lista.filter((r) => ['DELETE', 'PUT', 'PATCH', 'ALL'].includes(r.metodo) && /^\/root\/roots(\/|$)/.test(r.ruta))

    it('no hay ninguna ruta DELETE, PUT, PATCH ni ALL bajo /root/roots', () => {
      expect(quePermiteBorrarRoots(rutas).map(texto)).toEqual([])
    })

    it('las únicas rutas de /root/roots son listar, crear y restablecer la contraseña', () => {
      expect(deRoot.filter((r) => r.ruta.startsWith('/root/roots')).map(texto).sort()).toEqual(
        ['GET /root/roots', 'POST /root/roots', 'POST /root/roots/:id/restablecer-password'].sort(),
      )
    })

    it('la comprobación detecta una ruta de borrado si alguien la agregara', () => {
      @Controller('root/roots')
      class RootsConBorrado {
        @Delete(':id') borrar() {}
        @Put(':id') reemplazar() {}
        @Patch(':id') editar() {}
        @Get() listar() {}
      }

      expect(quePermiteBorrarRoots(rutasDe(RootsConBorrado)).map(texto).sort()).toEqual(
        ['DELETE /root/roots/:id', 'PATCH /root/roots/:id', 'PUT /root/roots/:id'].sort(),
      )
    })
  })

  describe('el historial no se modifica desde la API', () => {
    const historial = (lista: RutaDeLaApp[]) => lista.filter((r) => /^\/root\/historial(\/|$)/.test(r.ruta))

    it('las rutas bajo /root/historial, si hay, son solo de lectura (GET): ninguna PUT, PATCH, DELETE ni POST', () => {
      expect(historial(rutas).filter((r) => r.metodo !== 'GET').map(texto)).toEqual([])
    })

    it('ninguna ruta de la aplicación menciona el historial de ROOT fuera de /root/historial', () => {
      const otras = rutas.filter((r) => /historial[-_]?root/i.test(r.ruta))

      expect(otras.map(texto)).toEqual([])
    })

    it('la comprobación detecta una ruta que lo modifique si alguien la agregara', () => {
      @Controller('root/historial')
      class HistorialEditable {
        @Get() listar() {}
        @Delete(':id') borrar() {}
        @Post() crear() {}
        @Patch(':id') editar() {}
      }

      expect(historial(rutasDe(HistorialEditable)).filter((r) => r.metodo !== 'GET').map(texto).sort()).toEqual(
        ['DELETE /root/historial/:id', 'PATCH /root/historial/:id', 'POST /root/historial'].sort(),
      )
    })
  })

  it('no hay otras rutas que cuelguen de /root o que se le parezcan (por ejemplo /roots)', () => {
    const parecidas = rutas.filter((r) => /^\/roots?(\/|$)/i.test(r.ruta) && !r.ruta.startsWith('/root/'))

    expect(parecidas.map(texto)).toEqual([])
  })
})
