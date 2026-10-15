const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:4173',
]

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || origin.startsWith('http://localhost:')) return true

  const allowedOrigins =
    process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) ?? DEFAULT_LOCAL_ORIGINS
  const originPatterns = (process.env.CORS_ORIGIN_PATTERNS ?? '')
    .split(',')
    .filter(Boolean)
    .map((p) => new RegExp(p.trim()))

  return allowedOrigins.includes(origin) || originPatterns.some((re) => re.test(origin))
}
