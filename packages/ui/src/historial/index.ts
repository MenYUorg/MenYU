// Subpath propio (@menyu/ui/historial): no entra en el índice para que web-cliente no lo arrastre a su bundle.
export {
  BadgeEstado,
  PedidoEnSesion,
  SesionCard,
  SesionDetalleModal,
  PERIOD_LABELS,
  getPeriodBounds,
  calcDuracion,
  fmtDate,
  fmtTime,
  isToday,
  shortId,
} from './HistorialSesiones'
export type { AccionPedido, Period, SesionPedido } from './HistorialSesiones'
