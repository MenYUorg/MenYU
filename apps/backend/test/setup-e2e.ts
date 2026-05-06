// Configuración global para la suite e2e.
// El ciclo de vida de la app NestJS y la limpieza de datos
// se manejan dentro de cada spec con beforeAll/afterAll/beforeEach.
jest.setTimeout(30_000)
