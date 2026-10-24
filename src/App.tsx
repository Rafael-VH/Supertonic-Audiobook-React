/**
 * UI: un archivo Markdown → un WAV.
 *
 * Flujo (igual que el desktop, adaptado a un solo archivo por vez):
 * `.md` → limpiarMarkdown() → segmentarTexto() → sintetizar segmento por
 * segmento → concatenar → descargar.
 *
 * La inferencia corre en un Web Worker, así que la pestaña no se congela y se
 * puede cancelar entre segmentos. El motor se prepara una sola vez por visita:
 * cancelar no lo descarga ni vuelve a verificar el modelo. Ajustes y tema se
 * guardan en localStorage.
 */

import { useLayoutEffect, useEffect, useRef, useState } from 'react'
import { limpiarMarkdown } from './domain/limpiar-markdown'
import { MAX_CHARS_PER_SEGMENT, segmentarTexto } from './domain/segmentar-texto'
import {
  cargarVoz,
  estaIniciado,
  generarWavBlob,
  inicializarMotor,
  sintetizar,
  type Backend,
} from './data/motor-tts'
import { concatenarMuestras } from './data/wav'
import {
  IDIOMAS,
  PASOS_MAX,
  PASOS_MIN,
  VELOCIDAD_MAX,
  VELOCIDAD_MIN,
  VOCES,
  cargarAjustes,
  guardarAjustes,
  type Ajustes,
} from './data/ajustes'

const MB = 1024 * 1024
/** ~900 caracteres por minuto de audio en español. Sólo para estimar. */
const CHARS_POR_MINUTO = 900
/** Por encima de esto avisamos: son decenas de minutos de cómputo. */
const AVISO_CARACTERES = 50_000
const EXTENSIONES = /\.(md|markdown|txt)$/i

type Progreso = { segmento: number; segmentos: number; paso: number; pasos: number }

function IconoSol() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  )
}

function IconoLuna() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

export default function App() {
  const [texto, setTexto] = useState('')
  const [nombreBase, setNombreBase] = useState('audio')
  const [estado, setEstado] = useState('Todavía no elegiste ningún archivo.')
  const [esError, setEsError] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [backend, setBackend] = useState<Backend | null>(null)
  const [detalle, setDetalle] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [ajustes, setAjustes] = useState<Ajustes>(cargarAjustes)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [arrastrando, setArrastrando] = useState(false)

  /** Voz que tiene cargada el worker; evita recargarla en cada corrida. */
  const vozCargada = useRef<string | null>(null)

  /**
   * Cancelación cooperativa: se pide y se corta antes del próximo segmento. No
   * se mata el worker, así el modelo sigue listo y no se re-verifica.
   */
  const cancelado = useRef(false)

  useEffect(() => {
    guardarAjustes(ajustes)
  }, [ajustes])

  // useLayoutEffect: aplica el tema antes del primer pintado, sin parpadeo.
  useLayoutEffect(() => {
    document.documentElement.dataset.tema = ajustes.tema
  }, [ajustes.tema])

  const segmentos = texto ? segmentarTexto(texto) : []
  const minutos = texto.length / CHARS_POR_MINUTO
  const pct = progreso
    ? Math.min(100, (((progreso.segmento - 1) + progreso.paso / progreso.pasos) / progreso.segmentos) * 100)
    : 0

  function cambiar<K extends keyof Ajustes>(campo: K, valor: Ajustes[K]) {
    setAjustes((previos) => ({ ...previos, [campo]: valor }))
  }

  function alternarTema() {
    cambiar('tema', ajustes.tema === 'oscuro' ? 'claro' : 'oscuro')
  }

  function anunciar(mensaje: string, error = false) {
    setEstado(mensaje)
    setEsError(error)
  }

  async function procesarArchivo(archivo: File) {
    if (!EXTENSIONES.test(archivo.name)) {
      anunciar(`«${archivo.name}» no es un archivo .md.`, true)
      return
    }

    const limpio = limpiarMarkdown(await archivo.text())
    if (!limpio.trim()) {
      anunciar(`«${archivo.name}» no tiene texto después de limpiar el Markdown.`, true)
      return
    }

    setNombreBase(archivo.name.replace(EXTENSIONES, ''))
    setTexto(limpio)
    setDetalle('')
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    anunciar(`«${archivo.name}» listo para convertir.`)
  }

  async function alElegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (archivo) await procesarArchivo(archivo)
  }

  function alArrastrarSobre(evento: React.DragEvent) {
    evento.preventDefault()
    if (!ocupado) setArrastrando(true)
  }

  async function alSoltar(evento: React.DragEvent) {
    evento.preventDefault()
    setArrastrando(false)
    if (ocupado) return
    const archivo = evento.dataTransfer.files?.[0]
    if (archivo) await procesarArchivo(archivo)
  }

  async function prepararMotor() {
    if (!estaIniciado()) {
      anunciar('Cargando modelos…')

      // Sin WebGPU a propósito: en GPU móvil ORT devuelve audio corrupto.
      // Ver el comentario de inicializarMotor() en data/motor-tts.ts.
      const { backend: real } = await inicializarMotor({
        alModelo: (nombre, i, total) => anunciar(`Cargando modelos ${i}/${total}: ${nombre}`),
        alProgreso: (p) => {
          if (p.desdeCache) {
            anunciar(`Modelo en caché: ${p.archivo}`)
            return
          }
          const porcentaje = p.total ? Math.round((p.cargado / p.total) * 100) : 0
          anunciar(`Descargando ${p.archivo} ${porcentaje}% (${(p.cargado / MB).toFixed(1)} MB)`)
        },
      })

      setBackend(real)
      vozCargada.current = null
    }

    if (vozCargada.current !== ajustes.voz) {
      anunciar(`Cargando voz ${ajustes.voz}…`)
      await cargarVoz({
        voz: ajustes.voz,
        alProgreso: (p) =>
          anunciar(p.desdeCache ? `Voz ${ajustes.voz} en caché` : `Descargando voz ${ajustes.voz}…`),
      })
      vozCargada.current = ajustes.voz
    }
  }

  function pedirCancelacion() {
    cancelado.current = true
    anunciar('Cancelando al terminar el segmento en curso…')
  }

  async function generar() {
    const partes = segmentarTexto(texto)
    if (partes.length === 0) {
      anunciar('No hay texto para sintetizar.', true)
      return
    }

    cancelado.current = false
    setOcupado(true)
    setDetalle('')
    setProgreso({ segmento: 1, segmentos: partes.length, paso: 0, pasos: ajustes.pasos })
    const inicio = performance.now()

    try {
      await prepararMotor()

      const muestras: Float32Array[] = []
      let sampleRate = 0

      for (let i = 0; i < partes.length; i++) {
        if (cancelado.current) break
        setProgreso({ segmento: i + 1, segmentos: partes.length, paso: 0, pasos: ajustes.pasos })
        anunciar(`Sintetizando segmento ${i + 1} de ${partes.length}…`)
        const res = await sintetizar({
          texto: partes[i],
          lang: ajustes.lang,
          pasos: ajustes.pasos,
          velocidad: ajustes.velocidad,
          alPaso: (hecho) => {
            setProgreso({
              segmento: i + 1,
              segmentos: partes.length,
              paso: hecho,
              pasos: ajustes.pasos,
            })
            anunciar(`Segmento ${i + 1} de ${partes.length} · paso ${hecho}/${ajustes.pasos}`)
          },
        })
        muestras.push(res.muestras)
        sampleRate = res.sampleRate
      }

      if (cancelado.current) {
        anunciar(
          muestras.length === 0
            ? 'Cancelado. No se generó audio.'
            : `Cancelado tras ${muestras.length} de ${partes.length} segmentos. El modelo sigue cargado.`,
        )
        return
      }

      const audio = concatenarMuestras(muestras)
      const blob = generarWavBlob(audio, sampleRate)
      const segundos = audio.length / sampleRate
      const ms = performance.now() - inicio

      if (audioUrl) URL.revokeObjectURL(audioUrl)
      setAudioUrl(URL.createObjectURL(blob))
      setDetalle(
        `${segundos.toFixed(1)} s de audio en ${(ms / 1000).toFixed(1)} s` +
          ` · RTF ${(ms / 1000 / segundos).toFixed(2)} · ${(blob.size / MB).toFixed(1)} MB`,
      )
      anunciar('Listo.')
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error)
      anunciar(mensaje === 'Cancelado.' ? 'Cancelado.' : `Error: ${mensaje}`, mensaje !== 'Cancelado.')
    } finally {
      setOcupado(false)
      setProgreso(null)
    }
  }

  return (
    <main className="app">
      <header className="cabecera">
        <h1 className="marca">
          Supertonic <span>AudioBook</span>
        </h1>
        <button
          type="button"
          className="icono"
          onClick={alternarTema}
          aria-label={ajustes.tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {ajustes.tema === 'oscuro' ? <IconoSol /> : <IconoLuna />}
          {ajustes.tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro'}
        </button>
      </header>

      <p className="intro">
        Convertí un archivo Markdown en audio. Todo el procesamiento ocurre en tu navegador: el
        texto no se sube a ningún servidor.
      </p>

      <div className={`paneles${texto ? ' dos-columnas' : ''}`}>
        <section className="tarjeta">
          <label
            className={`zona${texto ? ' compacta' : ''}${arrastrando ? ' activa' : ''}`}
            onDragOver={alArrastrarSobre}
            onDragLeave={() => setArrastrando(false)}
            onDrop={alSoltar}
          >
            <input
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              onChange={alElegirArchivo}
              disabled={ocupado}
            />
            <strong>
              {arrastrando
                ? 'Soltá el archivo'
                : texto
                  ? 'Cambiar archivo'
                  : 'Arrastrá tu archivo .md acá'}
            </strong>
            <span>
              {texto ? 'arrastrá otro o hacé clic para elegirlo' : 'o hacé clic para elegirlo'}
            </span>
          </label>

          {texto && (
            <>
              <div className="meta">
                <span className="chip fuerte">{nombreBase}.md</span>
                <span className="chip">{texto.length.toLocaleString('es')} caracteres</span>
                <span className="chip">
                  {segmentos.length} {segmentos.length === 1 ? 'segmento' : 'segmentos'}
                </span>
                <span className="chip">~{minutos.toFixed(0)} min de audio</span>
              </div>

              {texto.length > AVISO_CARACTERES && (
                <p className="aviso">
                  Texto largo: en WASM puede tardar bastante más que el tiempo real. Probá primero
                  con un capítulo.
                </p>
              )}

              <details className="texto">
                <summary>Ver y editar el texto limpio</summary>
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} />
              </details>
            </>
          )}
        </section>

        {/* Sin archivo no hay nada que ajustar: la tarjeta aparece al cargarlo. */}
        {texto && (
          <section className="tarjeta">
            <h2>Ajustes</h2>
            <div className="rejilla">
              <label htmlFor="voz">Voz</label>
              <select
                id="voz"
                value={ajustes.voz}
                disabled={ocupado}
                onChange={(e) => cambiar('voz', e.target.value)}
              >
                {VOCES.map((voz) => (
                  <option key={voz} value={voz}>
                    {voz}
                  </option>
                ))}
              </select>

              <label htmlFor="idioma">Idioma</label>
              <select
                id="idioma"
                value={ajustes.lang}
                disabled={ocupado}
                onChange={(e) => cambiar('lang', e.target.value)}
              >
                {IDIOMAS.map(([codigo, nombre]) => (
                  <option key={codigo} value={codigo}>
                    {nombre}
                  </option>
                ))}
              </select>

              <label htmlFor="pasos">Pasos</label>
              <div className="rango">
                <input
                  id="pasos"
                  type="range"
                  min={PASOS_MIN}
                  max={PASOS_MAX}
                  step={1}
                  value={ajustes.pasos}
                  disabled={ocupado}
                  onChange={(e) => cambiar('pasos', Number(e.target.value))}
                />
                <span className="valor">{ajustes.pasos}</span>
              </div>

              <label htmlFor="velocidad">Velocidad</label>
              <div className="rango">
                <input
                  id="velocidad"
                  type="range"
                  min={VELOCIDAD_MIN}
                  max={VELOCIDAD_MAX}
                  step={0.05}
                  value={ajustes.velocidad}
                  disabled={ocupado}
                  onChange={(e) => cambiar('velocidad', Number(e.target.value))}
                />
                <span className="valor">{ajustes.velocidad.toFixed(2)}×</span>
              </div>
            </div>
            <p className="nota">
              Más pasos dan mejor calidad a cambio de más tiempo. El texto se corta en fragmentos de
              hasta {MAX_CHARS_PER_SEGMENT} caracteres.
            </p>
          </section>
        )}
      </div>

      <section className="acciones">
        <button type="button" className="principal" onClick={generar} disabled={ocupado || !texto}>
          {ocupado ? 'Convirtiendo…' : 'Generar audio'}
        </button>
        {ocupado && (
          <button type="button" className="fantasma" onClick={pedirCancelacion}>
            Cancelar
          </button>
        )}
        {backend && <span className="backend">{backend}</span>}
      </section>

      <div className="estado-caja" aria-live="polite">
        {progreso && (
          <div
            className="pista"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className={esError ? 'estado error' : 'estado'}>{estado}</p>
      </div>

      {audioUrl && (
        <section className="tarjeta resultado">
          <h2>Resultado</h2>
          <audio controls src={audioUrl} />
          <p className="detalle">{detalle}</p>
          <p style={{ margin: '0.9rem 0 0' }}>
            <a className="principal descarga" href={audioUrl} download={`${nombreBase}.wav`}>
              Descargar {nombreBase}.wav
            </a>
          </p>
        </section>
      )}
    </main>
  )
}
