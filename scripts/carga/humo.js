// Humo de carga: 2 usuarios durante 1 minuto. Es el primer paso del despliegue incremental (docs/calidad/k6.md):
// confirma que los scripts, las guardas y los umbrales andan antes de cargar staging en serio.
import { resumen, setup, umbrales, visita } from './comun.js'

export { setup }

export const options = {
  scenarios: {
    humo: { executor: 'constant-vus', vus: 2, duration: '1m' },
  },
  thresholds: umbrales({ errorMax: 0.01, p95Ms: 800, p95HealthMs: 300 }),
}

export default visita

export const handleSummary = resumen('humo')
