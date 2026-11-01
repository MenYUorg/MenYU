import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Icono } from '../discovery/Icono'
import { CM } from '../menu/paleta'
import {
  MAX_CARACTERES_PREGUNTA,
  MAX_PREGUNTAS_POR_CONVERSACION,
  preguntasHechas,
  useAsistenteStore,
} from './asistenteStore'

// El chat del asistente de la carta (docs/asistente/specs/asistente.md, Fase 6). Se carga aparte (React.lazy, desde
// BotonDelAsistente): quien no abre el chat no lo baja. En el celular es una hoja que sube desde abajo y deja ver la carta
// arriba; en una pantalla ancha, un panel abajo a la derecha.

/** Para arrancar: se mandan con un toque. Sirven en cualquier restaurante (recomendados, etiquetas, información del local). */
const SUGERENCIAS = ['¿Qué me recomendás?', '¿Tienen opciones vegetarianas?', '¿Qué formas de pago aceptan?']

const AVISO_AL_PIE = 'Respuestas generadas con IA a partir de los datos del local. Ante dudas, consultá al mozo.'

/** El input crece con el texto hasta unas cuatro líneas; después scrollea. */
const ALTO_MAXIMO_DEL_INPUT = 120

const mismoRestaurante = (a: string | null, b: string) => !!a && a.toLowerCase() === b.toLowerCase()

const SIN_MENSAJES: never[] = []

/**
 * Cuánto tapa el teclado del celular. El panel es `fixed` y el teclado no achica la página (solo el `visualViewport`), así
 * que sin esto el input quedaría debajo del teclado. Se ignora con zoom y con diferencias chicas (la barra del navegador).
 */
function useTeclado(): { tapado: number; altoVisible: number } | null {
  const [teclado, setTeclado] = useState<{ tapado: number; altoVisible: number } | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const medir = () => {
      const tapado = Math.round(window.innerHeight - vv.height - vv.offsetTop)
      setTeclado(vv.scale <= 1.01 && tapado > 80 ? { tapado, altoVisible: Math.round(vv.height) } : null)
    }
    medir()
    vv.addEventListener('resize', medir)
    vv.addEventListener('scroll', medir)
    return () => {
      vv.removeEventListener('resize', medir)
      vv.removeEventListener('scroll', medir)
    }
  }, [])
  return teclado
}

/** Negritas con `**` y viñetas con "* " o "- " al principio de la línea, como suele escribir el modelo. Nada de HTML. */
function ConFormato({ texto }: { texto: string }) {
  return (
    <>
      {texto.split('\n').map((linea, i) => {
        const vineta = /^\s*[*-]\s+/.exec(linea)
        const contenido = vineta ? linea.slice(vineta[0].length) : linea
        return (
          <Fragment key={i}>
            {i > 0 && '\n'}
            {vineta && '• '}
            {contenido.split(/\*\*(.+?)\*\*/g).map((parte, j) => (j % 2 === 1 ? <strong key={j}>{parte}</strong> : parte))}
          </Fragment>
        )
      })}
    </>
  )
}

const TEXTO_DE_BURBUJA: CSSProperties = {
  margin: 0,
  fontFamily: 'Inter,sans-serif',
  fontSize: 15,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
}

function Pregunta({ texto }: { texto: string }) {
  return (
    <p
      style={{
        ...TEXTO_DE_BURBUJA,
        alignSelf: 'flex-end',
        maxWidth: '85%',
        padding: '9px 14px',
        borderRadius: '18px 18px 4px 18px',
        background: CM.navy,
        color: 'white',
      }}
    >
      {texto}
    </p>
  )
}

function Respuesta({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        ...TEXTO_DE_BURBUJA,
        alignSelf: 'flex-start',
        maxWidth: '88%',
        padding: '9px 14px',
        borderRadius: '18px 18px 18px 4px',
        background: 'white',
        border: `1px solid ${CM.border}`,
        color: CM.text,
      }}
    >
      {children}
    </div>
  )
}

function Escribiendo() {
  return (
    <Respuesta>
      <span className="sr-only">El asistente está escribiendo…</span>
      <span aria-hidden="true" style={{ display: 'inline-flex', gap: 4, padding: '6px 0' }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="animate-pulse motion-reduce:animate-none"
            style={{ width: 7, height: 7, borderRadius: '50%', background: CM.textMuted, animationDelay: `${i * 180}ms` }}
          />
        ))}
      </span>
    </Respuesta>
  )
}

/** Un aviso en el hilo, debajo de la pregunta: un error (`alert`) o el tope de la conversación (`status`). */
function AvisoDelHilo({ texto, rol, onReintentar }: { texto: string; rol: 'alert' | 'status'; onReintentar?: () => void }) {
  return (
    <div
      role={rol}
      style={{
        alignSelf: 'stretch',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderRadius: 14,
        background: 'white',
        border: `1px solid ${rol === 'alert' ? '#F5C9BE' : CM.border}`,
      }}
    >
      <span style={{ color: rol === 'alert' ? CM.orange : CM.navy, marginTop: 1, display: 'inline-flex' }}>
        <Icono nombre="aviso" tam={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: 'Inter,sans-serif', fontSize: 14, lineHeight: 1.45, color: CM.text }}>{texto}</p>
        {onReintentar && (
          <button
            type="button"
            onClick={onReintentar}
            style={{
              minHeight: 44,
              margin: '2px 0 -8px -8px',
              padding: '0 8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: CM.orange,
              fontFamily: 'Montserrat,sans-serif',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <Icono nombre="reintentar" tam={16} />
            Reintentar
          </button>
        )}
      </div>
    </div>
  )
}

interface PanelDelAsistenteProps {
  abierto: boolean
  onCerrar: () => void
  restauranteId: string
  nombreRestaurante: string
}

export default function PanelDelAsistente({ abierto, onCerrar, restauranteId, nombreRestaurante }: PanelDelAsistenteProps) {
  const abrir = useAsistenteStore((s) => s.abrir)
  const preguntar = useAsistenteStore((s) => s.preguntar)
  const reintentar = useAsistenteStore((s) => s.reintentar)
  // Hasta que se carga la de este restaurante (el efecto de abajo), no se muestra la conversación de otro.
  const cargado = useAsistenteStore((s) => mismoRestaurante(s.restauranteId, restauranteId))
  const mensajesGuardados = useAsistenteStore((s) => s.mensajes)
  const enCursoGuardado = useAsistenteStore((s) => s.enCurso)
  const fallidoGuardado = useAsistenteStore((s) => s.fallido)
  const mensajes = cargado ? mensajesGuardados : SIN_MENSAJES
  const enCurso = cargado ? enCursoGuardado : null
  const fallido = cargado ? fallidoGuardado : null

  useEffect(() => {
    abrir(restauranteId)
  }, [abrir, restauranteId])

  // Se monta cerrado y se abre en el cuadro siguiente: así también sube con la animación la primera vez.
  const [montado, setMontado] = useState(false)
  useEffect(() => {
    const cuadro = requestAnimationFrame(() => setMontado(true))
    return () => cancelAnimationFrame(cuadro)
  }, [])
  const visible = abierto && montado

  const [texto, setTexto] = useState('')
  const idTitulo = useId()
  const idContador = useId()
  const dialogoRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hiloRef = useRef<HTMLDivElement>(null)
  const pegadoAbajo = useRef(true)
  const teclado = useTeclado()

  const hechas = preguntasHechas(mensajes) + (enCurso ? 1 : 0)
  const restantes = MAX_PREGUNTAS_POR_CONVERSACION - hechas
  const llegoAlTope = preguntasHechas(mensajes) >= MAX_PREGUNTAS_POR_CONVERSACION
  const bloqueado = !!fallido?.aviso.bloquea || llegoAlTope
  const ocupado = !!enCurso
  const puedeEnviar = !bloqueado && !ocupado && texto.trim() !== ''

  // Al abrir: en una compu, directo al input; en el celular, al panel (enfocar el input abriría el teclado y taparía todo).
  useEffect(() => {
    if (!visible) return
    const input = inputRef.current
    const punteroFino = window.matchMedia?.('(pointer: fine)').matches ?? false
    const destino = punteroFino && input && !input.disabled ? input : dialogoRef.current
    destino?.focus({ preventScroll: true })
  }, [visible])

  // Un mensaje nuevo (o abrir el panel) lleva al final del hilo.
  const forma = `${mensajes.length}-${enCurso ? 1 : 0}-${fallido ? 1 : 0}`
  useEffect(() => {
    const hilo = hiloRef.current
    if (!hilo) return
    hilo.scrollTop = hilo.scrollHeight
    pegadoAbajo.current = true
  }, [forma, visible])
  // El texto que va llegando se sigue solo si la persona no subió a leer algo de antes.
  useEffect(() => {
    const hilo = hiloRef.current
    if (hilo && pegadoAbajo.current) hilo.scrollTop = hilo.scrollHeight
  }, [enCurso?.respuesta])

  // El input crece con el texto.
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.max(44, Math.min(input.scrollHeight, ALTO_MAXIMO_DEL_INPUT))}px`
  }, [texto])

  /** Manda lo escrito o una sugerencia (que no borra lo que haya en el input). */
  const enviar = async (pregunta: string, { desdeElInput }: { desdeElInput: boolean }) => {
    if (bloqueado || ocupado || !pregunta.trim()) return
    if (desdeElInput) setTexto('')
    const resultado = await preguntar(pregunta)
    // Para reescribirla (muy larga, sin respuesta…), salvo que ya se haya empezado a escribir otra.
    if (resultado === 'devolver' || resultado === 'ignorada') setTexto((actual) => actual || pregunta)
  }

  const alturaDelPanel = teclado ? `${teclado.altoVisible - 12}px` : 'min(88dvh, 760px)'

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onCerrar}
        className="transition-opacity duration-300 motion-reduce:transition-none"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          background: 'rgba(45,53,97,0.45)',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
        }}
      />

      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-hidden={visible ? undefined : true}
        inert={!visible}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCerrar()
          } else if (e.key === 'Tab') {
            // El foco no sale del panel mientras está abierto: la carta de atrás está tapada.
            const enfocables = Array.from(
              dialogoRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled])') ?? [],
            )
            const primero = enfocables[0]
            const ultimo = enfocables[enfocables.length - 1]
            if (!primero || !ultimo) return
            const activo = document.activeElement
            if (e.shiftKey && (activo === primero || activo === dialogoRef.current)) {
              e.preventDefault()
              ultimo.focus()
            } else if (!e.shiftKey && activo === ultimo) {
              e.preventDefault()
              primero.focus()
            }
          }
        }}
        className={[
          'fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-[480px] flex-col overflow-hidden rounded-t-[20px] bg-white outline-none',
          'h-[var(--alto-del-panel)] transition-transform duration-300 ease-out motion-reduce:transition-none',
          'sm:inset-x-auto sm:bottom-4 sm:right-4 sm:mx-0 sm:h-[min(640px,calc(100dvh-32px))] sm:w-[400px] sm:rounded-[20px]',
          visible ? 'translate-y-0' : 'translate-y-[calc(100%+32px)]',
        ].join(' ')}
        style={
          {
            zIndex: 61,
            boxShadow: '0 -8px 40px rgba(45,53,97,0.22)',
            '--alto-del-panel': alturaDelPanel,
            ...(teclado ? { bottom: teclado.tapado } : {}),
          } as CSSProperties
        }
      >
        {/* Encabezado */}
        <div style={{ background: CM.navy, padding: '10px 6px 10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              flexShrink: 0,
              background: 'rgba(255,255,255,0.14)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icono nombre="globo" tam={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={idTitulo} style={{ margin: 0, fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 16, lineHeight: 1.2, color: 'white' }}>
              Asistente
            </h2>
            <p
              style={{
                margin: '2px 0 0',
                fontFamily: 'Inter,sans-serif',
                fontSize: 12,
                color: 'rgba(255,255,255,0.72)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {nombreRestaurante}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar el asistente"
            style={{
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: 12,
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icono nombre="cerrar" tam={22} />
          </button>
        </div>

        {/* La conversación */}
        <div
          ref={hiloRef}
          role="log"
          aria-label="Conversación con el asistente"
          aria-busy={ocupado}
          onScroll={() => {
            const hilo = hiloRef.current
            if (hilo) pegadoAbajo.current = hilo.scrollHeight - hilo.scrollTop - hilo.clientHeight < 48
          }}
          style={{
            flex: 1,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            background: CM.bg,
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <Respuesta>
            Hola, soy el asistente de {nombreRestaurante}. Te respondo sobre la carta y el local: si un plato pica, para
            cuántos alcanza, qué opciones vegetarianas hay, los horarios o las formas de pago.
            {'\n\n'}Solo respondo preguntas: no tomo pedidos ni llamo al mozo.
          </Respuesta>

          {mensajes.length === 0 && !enCurso && !fallido && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
              {SUGERENCIAS.map((sugerencia) => (
                <button
                  key={sugerencia}
                  type="button"
                  onClick={() => void enviar(sugerencia, { desdeElInput: false })}
                  style={{
                    minHeight: 40,
                    padding: '0 14px',
                    borderRadius: 999,
                    border: `1px solid ${CM.border}`,
                    background: 'white',
                    color: CM.navy,
                    fontFamily: 'Montserrat,sans-serif',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {sugerencia}
                </button>
              ))}
            </div>
          )}

          {mensajes.map((mensaje, i) =>
            mensaje.rol === 'usuario' ? (
              <Pregunta key={i} texto={mensaje.contenido} />
            ) : (
              <Respuesta key={i}>
                <ConFormato texto={mensaje.contenido} />
              </Respuesta>
            ),
          )}

          {enCurso && (
            <>
              <Pregunta texto={enCurso.pregunta} />
              {enCurso.respuesta ? (
                <Respuesta>
                  <ConFormato texto={enCurso.respuesta} />
                </Respuesta>
              ) : (
                <Escribiendo />
              )}
            </>
          )}

          {fallido && (
            <>
              <Pregunta texto={fallido.pregunta} />
              {fallido.respuestaParcial && (
                <Respuesta>
                  <ConFormato texto={fallido.respuestaParcial} />
                </Respuesta>
              )}
              <AvisoDelHilo
                rol="alert"
                texto={fallido.aviso.texto}
                onReintentar={fallido.aviso.reintentable ? () => void reintentar() : undefined}
              />
            </>
          )}

          {llegoAlTope && !fallido && (
            <AvisoDelHilo
              rol="status"
              texto={`Llegaste a las ${MAX_PREGUNTAS_POR_CONVERSACION} preguntas de esta conversación. Para otras consultas, preguntale al mozo.`}
            />
          )}
        </div>

        {/* El input */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void enviar(texto, { desdeElInput: true })
          }}
          style={{ flexShrink: 0, background: 'white', borderTop: `1px solid ${CM.border}`, padding: '10px 12px 0' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <label className="sr-only" htmlFor={`${idTitulo}-pregunta`}>
              Tu pregunta
            </label>
            <textarea
              ref={inputRef}
              id={`${idTitulo}-pregunta`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                // Enter manda; Mayús + Enter baja de línea.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void enviar(texto, { desdeElInput: true })
                }
              }}
              rows={1}
              maxLength={MAX_CARACTERES_PREGUNTA}
              enterKeyHint="send"
              disabled={bloqueado}
              aria-describedby={idContador}
              placeholder={bloqueado ? 'Para otras consultas, preguntale al mozo' : 'Escribí tu pregunta'}
              className="border border-[#ECECEE] bg-[#F7F7F8] focus:border-[#E8563A] focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                flex: 1,
                minWidth: 0,
                resize: 'none',
                boxSizing: 'border-box',
                padding: '11px 16px',
                borderRadius: 22,
                fontFamily: 'Inter,sans-serif',
                // 16 px: con menos, iOS hace zoom al tocar el campo.
                fontSize: 16,
                lineHeight: 1.35,
                color: CM.text,
              }}
            />
            <button
              type="submit"
              aria-label="Enviar pregunta"
              disabled={!puedeEnviar}
              className="transition-opacity disabled:cursor-default disabled:opacity-40"
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: '50%',
                border: 'none',
                background: CM.orange,
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icono nombre="enviar" tam={20} grosor={2.4} />
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: '5px 56px 0 16px',
              minHeight: 16,
              fontFamily: 'Inter,sans-serif',
              fontSize: 11,
              color: CM.textSub,
            }}
          >
            <span role="status">
              {!bloqueado && restantes > 0 && restantes <= 3
                ? `Te ${restantes === 1 ? 'queda 1 pregunta' : `quedan ${restantes} preguntas`} en esta conversación.`
                : ''}
            </span>
            <span id={idContador} style={{ flexShrink: 0, color: texto.length >= MAX_CARACTERES_PREGUNTA - 50 ? CM.orange : CM.textMuted }}>
              <span className="sr-only">Caracteres: </span>
              {texto.length}/{MAX_CARACTERES_PREGUNTA}
            </span>
          </div>

          <p
            style={{
              margin: 0,
              padding: '6px 4px max(10px, env(safe-area-inset-bottom))',
              textAlign: 'center',
              fontFamily: 'Inter,sans-serif',
              fontSize: 11,
              lineHeight: 1.4,
              color: CM.textSub,
            }}
          >
            {AVISO_AL_PIE}
          </p>
        </form>
      </div>
    </>
  )
}
