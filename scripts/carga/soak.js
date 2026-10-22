// Esfuerzo sostenido (soak): 10 usuarios durante 30 minutos (más 2 de subida y 1 de bajada). Busca degradación
// con el tiempo (memoria, conexiones a la base) más que el límite de capacidad.
import { resumen, setup, umbrales, visita } from './comun.js'

export { setup }

export const options = {
  scenarios: {
    soak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '30m', target: 10 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: umbrales({ errorMax: 0.01, p95Ms: 800, p95HealthMs: 300 }),
}

export default visita

export const handleSummary = resumen('soak')
