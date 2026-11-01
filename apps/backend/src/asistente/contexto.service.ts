import { Injectable } from '@nestjs/common'
import { EtiquetaDietaria, NivelPicante, Prisma, TamanioPorcion, Temperatura } from '@prisma/client'
import { enAlgunaSeccionDeLaCarta } from '../common/carta-publica'
import { derivarDescuento, formatearPesos } from '../items/descuento.util'
import { PrismaService } from '../prisma/prisma.service'
import { armarSystemPrompt } from './system-prompt'

// Arma el contexto del restaurante (docs/asistente/specs/asistente.md, "System prompt y armado del contexto"): un texto
// determinístico a partir de la base. Está separado de la llamada al modelo (decisión 10 de la definición): sumar el modo
// discovery es otro armador de contexto. Un campo vacío o null no aparece: el modelo nunca ve "null".

/**
 * Tope de preguntas frecuentes que entran al contexto: las primeras por fecha de creación. El panel no limita la
 * cantidad y cada una suma hasta 1.200 caracteres en todas las preguntas al modelo.
 */
export const MAX_PREGUNTAS_FRECUENTES = 30

const RESTAURANTE_SELECT = {
  nombre: true,
  informacionLocal: {
    select: {
      horarios: true,
      formasPago: true,
      wifi: true,
      petFriendly: true,
      accesibleSillaRuedas: true,
      opcionesParaChicos: true,
      estacionamiento: true,
    },
  },
} satisfies Prisma.RestauranteSelect

const PLATO_SELECT = {
  id: true,
  nombre: true,
  descripcion: true,
  precioBase: true,
  precioDescuento: true,
  recomendadoEn: true,
  tamanioPorcion: true,
  porcionPersonas: true,
  porcionDetalle: true,
  temperatura: true,
  nivelPicante: true,
  acompanamiento: true,
  tiempoPreparacionMin: true,
  etiquetasDietarias: true,
  infoAdicional: true,
  categoria: { select: { id: true, restauranteId: true, nombre: true, orden: true } },
  // El catálogo global de dietas (el filtro "Dietas" de la carta): decisión de Lauti en el checkpoint de la Fase 1.
  clasificaciones: { select: { clasificacion: { select: { nombre: true } } } },
} satisfies Prisma.ItemMenuSelect

const PREGUNTA_SELECT = { pregunta: true, respuesta: true } satisfies Prisma.PreguntaFrecuenteSelect

type Plato = Prisma.ItemMenuGetPayload<{ select: typeof PLATO_SELECT }>
type Informacion = NonNullable<Prisma.RestauranteGetPayload<{ select: typeof RESTAURANTE_SELECT }>['informacionLocal']>
type Pregunta = Prisma.PreguntaFrecuenteGetPayload<{ select: typeof PREGUNTA_SELECT }>
type Servicio = 'wifi' | 'petFriendly' | 'accesibleSillaRuedas' | 'opcionesParaChicos' | 'estacionamiento'

const TAMANIOS: Record<TamanioPorcion, string> = {
  INDIVIDUAL: 'individual',
  PARA_COMPARTIR: 'para compartir',
  // Sin la cantidad declarada (porcionPersonas en null).
  PARA_N_PERSONAS: 'para varias personas',
}
const TEMPERATURAS: Record<Temperatura, string> = { CALIENTE: 'caliente', FRIO: 'frío', AMBIENTE: 'ambiente' }
const PICANTES: Record<NivelPicante, string> = { NADA: 'no pica', SUAVE: 'suave', MEDIO: 'medio', ALTO: 'alto' }
/** En este orden en el contexto, sin importar cómo las cargó el dueño. */
const ETIQUETAS: Record<EtiquetaDietaria, string> = {
  VEGETARIANO: 'vegetariano',
  VEGANO: 'vegano',
  SIN_TACC: 'sin TACC',
  SIN_LACTOSA: 'sin lactosa',
}
const SERVICIOS: ReadonlyArray<[Servicio, string]> = [
  ['wifi', 'wifi'],
  ['petFriendly', 'pet friendly'],
  ['accesibleSillaRuedas', 'accesible en silla de ruedas'],
  ['opcionesParaChicos', 'opciones para chicos'],
  ['estacionamiento', 'estacionamiento'],
]

/**
 * Un texto cargado por el dueño (o el nombre del restaurante) listo para el contexto: en una sola línea, así no puede
 * armar un encabezado ni una línea propia, y sin la secuencia `===` de los delimitadores del bloque de datos, así no puede
 * "cerrarlo" (regla 5 del system prompt).
 */
export function comoDato(texto: string): string {
  return texto.replace(/\s+/g, ' ').replace(/={3,}/g, '=').trim()
}

/** `comoDato`, o null si no queda nada. */
function dato(texto: string | null): string | null {
  return texto ? comoDato(texto) || null : null
}

/** Con punto final, salvo que ya termine en un signo de puntuación. */
function conPunto(texto: string): string {
  return /[.!?…]$/.test(texto) ? texto : `${texto}.`
}

function precio(plato: Plato): string {
  const base = formatearPesos(Number(plato.precioBase))
  const { precioDescuento } = derivarDescuento(plato.precioBase, plato.precioDescuento)
  return precioDescuento == null ? base : `${formatearPesos(precioDescuento)} con descuento (precio normal: ${base})`
}

function tamanio(plato: Plato): string | null {
  if (!plato.tamanioPorcion) return null
  // porcionPersonas solo cuenta con PARA_N_PERSONAS: la API lo mantiene así, pero el seed o un UPDATE a mano no pasan por ella.
  if (plato.tamanioPorcion === 'PARA_N_PERSONAS' && plato.porcionPersonas) {
    return `para ${plato.porcionPersonas} ${plato.porcionPersonas === 1 ? 'persona' : 'personas'}`
  }
  return TAMANIOS[plato.tamanioPorcion]
}

function porcion(plato: Plato): string | null {
  const queTamanio = tamanio(plato)
  const detalle = dato(plato.porcionDetalle)
  if (queTamanio && detalle) return `Porción: ${queTamanio} (${detalle}).`
  const unoSolo = queTamanio ?? detalle
  return unoSolo ? `Porción: ${unoSolo}.` : null
}

function etiquetas(plato: Plato): string | null {
  const declaradas = (Object.keys(ETIQUETAS) as EtiquetaDietaria[]).filter((e) => plato.etiquetasDietarias.includes(e))
  return declaradas.length > 0 ? `Etiquetas: ${declaradas.map((e) => ETIQUETAS[e]).join(', ')}.` : null
}

function dietas(plato: Plato): string | null {
  const nombres = plato.clasificaciones
    .map((c) => comoDato(c.clasificacion.nombre))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'))
  return nombres.length > 0 ? `Dietas (filtro de la carta): ${nombres.join(', ')}.` : null
}

const esTexto = (parte: string | null): parte is string => parte !== null

function lineaDelPlato(plato: Plato): string {
  const descripcion = dato(plato.descripcion)
  const acompanamiento = dato(plato.acompanamiento)
  const infoAdicional = dato(plato.infoAdicional)
  const partes = [
    descripcion && conPunto(descripcion),
    porcion(plato),
    plato.temperatura && `Temperatura: ${TEMPERATURAS[plato.temperatura]}.`,
    plato.nivelPicante && `Picante: ${PICANTES[plato.nivelPicante]}.`,
    acompanamiento && `Viene con: ${conPunto(acompanamiento)}`,
    plato.tiempoPreparacionMin ? `Preparación: ~${plato.tiempoPreparacionMin} min.` : null,
    etiquetas(plato),
    dietas(plato),
    infoAdicional && conPunto(infoAdicional),
    plato.recomendadoEn ? '[Recomendado por el local]' : null,
  ].filter(esTexto)
  return [`- ${comoDato(plato.nombre)} — ${precio(plato)}.`, ...partes].join(' ')
}

function seccionDelLocal(nombre: string, informacion: Informacion | null): string {
  const lineas = [`# ${nombre} — información del local`]
  const horarios = dato(informacion?.horarios ?? null)
  const formasPago = dato(informacion?.formasPago ?? null)
  if (horarios) lineas.push(`Horarios: ${horarios}`)
  if (formasPago) lineas.push(`Formas de pago: ${formasPago}`)
  // Un servicio en null es "sin dato": no aparece y el modelo dice que no tiene esa información.
  const servicios = SERVICIOS.flatMap(([campo, texto]) => {
    const valor = informacion?.[campo]
    return valor == null ? [] : [`${texto}: ${valor ? 'sí' : 'no'}`]
  })
  if (servicios.length > 0) lineas.push(`Servicios: ${servicios.join(' · ')}`)
  return lineas.join('\n')
}

/**
 * Exactamente los platos que muestra la carta pública (`enAlgunaSeccionDeLaCarta`), por categoría (por su orden y su
 * nombre), como la carta de web-cliente. Los que la carta muestra sin tener una categoría del restaurante (los
 * recomendados y los que están en descuento) van al final, en "Otros". Dentro de cada una, en el orden de la consulta
 * (por nombre).
 */
function seccionDeLaCarta(restauranteId: string, disponibles: Plato[]): string | null {
  // Nada que el comensal no pueda encontrar en la carta (common/carta-publica.ts).
  const platos = disponibles.filter((plato) => enAlgunaSeccionDeLaCarta(plato, restauranteId))
  if (platos.length === 0) return null
  const categorias = new Map<string, { nombre: string; orden: number; id: string; platos: Plato[] }>()
  const otros: Plato[] = []
  for (const plato of platos) {
    const categoria = plato.categoria?.restauranteId === restauranteId ? plato.categoria : null
    if (!categoria) {
      otros.push(plato)
      continue
    }
    const grupo = categorias.get(categoria.id) ?? { ...categoria, platos: [] }
    grupo.platos.push(plato)
    categorias.set(categoria.id, grupo)
  }
  const grupos = [...categorias.values()].sort(
    (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id),
  )
  if (otros.length > 0) grupos.push({ nombre: 'Otros', orden: 0, id: '', platos: otros })
  const lineas = grupos.flatMap((g) => [`## ${comoDato(g.nombre)}`, ...g.platos.map(lineaDelPlato)])
  return ['# Carta', ...lineas].join('\n')
}

function seccionDePreguntas(preguntas: Pregunta[]): string | null {
  if (preguntas.length === 0) return null
  const lineas = preguntas.flatMap((p) => [`P: ${comoDato(p.pregunta)}`, `R: ${comoDato(p.respuesta)}`])
  return ['# Preguntas frecuentes', ...lineas].join('\n')
}

@Injectable()
export class ContextoService {
  constructor(private readonly prisma: PrismaService) {}

  /** El system prompt con los datos del restaurante. Que el asistente esté habilitado lo valida AsistenteService. */
  async systemPrompt(restauranteId: string): Promise<string> {
    const [restaurante, platos, preguntas] = await Promise.all([
      this.prisma.restaurante.findUnique({ where: { id: restauranteId }, select: RESTAURANTE_SELECT }),
      this.prisma.itemMenu.findMany({
        // El filtro barato va en la base; cuáles de estos muestra la carta lo decide `enAlgunaSeccionDeLaCarta`, que
        // necesita la categoría de cada plato (la misma que usa el agrupado por sección).
        where: { restauranteId, disponible: true },
        select: PLATO_SELECT,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.preguntaFrecuente.findMany({
        where: { restauranteId },
        select: PREGUNTA_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_PREGUNTAS_FRECUENTES,
      }),
    ])
    const nombre = comoDato(restaurante?.nombre ?? '')
    const contexto = [
      seccionDelLocal(nombre, restaurante?.informacionLocal ?? null),
      seccionDeLaCarta(restauranteId, platos),
      seccionDePreguntas(preguntas),
    ]
      .filter(esTexto)
      .join('\n\n')
    return armarSystemPrompt(contexto)
  }
}
