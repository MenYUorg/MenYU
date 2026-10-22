// Stress: sube por escalones hasta 50 usuarios para encontrar dónde empieza a degradarse staging, y baja.
// Duración total: 12 minutos. Umbrales más laxos que el soak: se espera ver degradación cerca del final.
import { resumen, setup, umbrales, visita } from './comun.js'

export { setup }

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '2m', target: 10 },
        { duration: '2m', target: 25 },
        { duration: '2m', target: 25 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: umbrales({ errorMax: 0.05, p95Ms: 1500, p95HealthMs: 500 }),
}

export default visita

export const handleSummary = resumen('stress')
