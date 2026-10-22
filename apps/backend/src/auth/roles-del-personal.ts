import { Rol } from '@prisma/client'

/** Los grupos de roles de la matriz por ruta de la Fase 4 (docs/auth/specs/auth.md, entrega 4.3). ROOT no está en ninguno. */

/** La carta, las mesas, los mozos y los datos del restaurante. */
export const ADMINISTRACION: readonly Rol[] = ['OWNER', 'GERENTE']

/** Las mesas en servicio: sesiones, cobros y llamados. */
export const SALON: readonly Rol[] = ['OWNER', 'GERENTE', 'JEFE_SALON', 'MOZO']

/** Los pedidos, que también ve y avanza la cocina. */
export const TODO_EL_PERSONAL: readonly Rol[] = ['OWNER', 'GERENTE', 'JEFE_SALON', 'MOZO', 'COCINA']
