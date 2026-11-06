/**
 * UI: un archivo Markdown → un WAV.
 *
 * Flujo (igual que el desktop, adaptado a un solo archivo por vez):
 * `.md` → limpiarMarkdown() → segmentarTexto() → sintetizar segmento por
 * segmento → concatenar → descargar.
 *
 * La inferencia corre en un Web Worker, así que la pestaña no se congela y se
 * puede cancelar entre segmentos. El motor se prepara una sola vez por visita:
 * cancelar no lo descarga ni vuelve a verificar el modelo.
 *
 * La precarga arranca al elegir el archivo (no al tocar Generar) y el tiempo
 * restante se estima con lo medido en los primeros segmentos. Ajustes y tema se
 * guardan en localStorage. Todos los textos visibles salen de `i18n/`.
 */

import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react'
import { limpiarMarkdown } from './domain/limpiar-markdown'
import { MAX_CHARS_PER_SEGMENT, segmentarTexto } from './domain/segmentar-texto'
import { sintetizar, type Backend } from './data/motor-tts'
import { formatearRestante } from './domain/eta'
import { useMotor } from './ui/useMotor'
import { AcercaDe } from './ui/AcercaDe'
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
  type IdiomaInterfaz,
} from './data/ajustes'
import { generar as generarOrquestador } from './domain/procesar-archivo'
import { separarNombre } from './domain/nombre-archivo'
import { FORMATOS } from './domain/formato'
import { crearTraductor, type Traductor } from './i18n/traductor'

/** ~900 caracteres por minuto de audio en español. Sólo para estimar. */
const CHARS_POR_MINUTO = 900
/** Por encima de esto avisamos: son decenas de minutos de cómputo. */
const AVISO_CARACTERES = 50_000
const EXTENSIONES = /\.(md|markdown|txt)$/i

type Progreso = { segmento: number; segmentos: number; paso: number; pasos: number }

/** Métricas del resultado que la UI vuelve a formatear al cambiar de idioma. */
type Metricas = {
  segundos: number
  ms: number
  rtf: number
  tamanoMB: number
  parcial?: boolean
  segmentosCompletados?: number
  segmentosTotales?: number
}

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

function detalleBase(metricas: Metricas, t: Traductor): string {
  return t('resultado.detalle', {
    segundos: metricas.segundos.toFixed(1),
    tiempo: (metricas.ms / 1000).toFixed(1),
    rtf: metricas.rtf.toFixed(2),
    tamano: metricas.tamanoMB.toFixed(1),
  })
}

export default function App() {
  const [texto, setTexto] = useState('')
  const [nombreBase, setNombreBase] = useState('audio')
  const [extension, setExtension] = useState('')
  const [estado, setEstado] = useState('')
  const [esError, setEsError] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [backend, setBackend] = useState<Backend | null>(null)
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [ajustes, setAjustes] = useState<Ajustes>(cargarAjustes)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [restante, setRestante] = useState<number | null>(null)
  const [logSintesis, setLogSintesis] = useState<string[]>([])
  const [arrastrando, setArrastrando] = useState(false)
  const [acercaAbierto, setAcercaAbierto] = useState(false)

  const t = useMemo(() => crearTraductor(ajustes.idioma), [ajustes.idioma])

  /**
   * Cancelación cooperativa: se pide y se corta antes del próximo segmento. No
   * se mata el worker, así el modelo sigue listo y no se re-verifica.
   */
  const cancelado = useRef(false)

  useEffect(() => {
    guardarAjustes(ajustes)
  }, [ajustes])

  // useLayoutEffect: aplica el tema y el idioma antes del primer pintado.
  useLayoutEffect(() => {
    document.documentElement.dataset.tema = ajustes.tema
  }, [ajustes.tema])

  useLayoutEffect(() => {
    document.documentElement.lang = ajustes.idioma
  }, [ajustes.idioma])

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

  // La precarga y Generar comparten esta preparación: la segunda llamada espera
  // la misma carga en vez de abrir otra.
  const { estado: estadoMotor, preparar } = useMotor({
    alMensaje: (mensaje) => anunciar(mensaje),
    alBackend: setBackend,
    t,
  })

  async function procesarArchivo(archivo: File) {
    if (!EXTENSIONES.test(archivo.name)) {
      anunciar(t('error.extension', { nombre: archivo.name }), true)
      return
    }

    const limpio = limpiarMarkdown(await archivo.text())
    if (!limpio.trim()) {
      anunciar(t('error.sinTexto', { nombre: archivo.name }), true)
      return
    }

    const { base, extension: ext } = separarNombre(archivo.name)
    setNombreBase(base)
    setExtension(ext)
    setTexto(limpio)
    setMetricas(null)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    anunciar(t('estado.listoParaConvertir', { nombre: archivo.name }))

    // Precarga: los ~400 MB empiezan a bajar ahora, mientras el usuario elige
    // voz y pasos, en vez de recién al tocar Generar.
    void preparar(ajustes.voz).catch(() =>
      anunciar(t('error.precarga'), true),
    )
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

  function pedirCancelacion() {
    cancelado.current = true
    anunciar(t('estado.cancelando'))
  }

  async function generar() {
    cancelado.current = false
    setOcupado(true)
    setMetricas(null)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
    setLogSintesis([])

    await generarOrquestador({
      texto,
      ajustes,
      nombreBase,
      t,
      motor: {
        sintetizar: (opts) =>
          sintetizar({
            texto: opts.texto,
            lang: opts.lang,
            pasos: opts.pasos,
            velocidad: opts.velocidad,
            alPaso: opts.alPaso,
          }),
        preparar: async (voz) => {
          await preparar(voz)
        },
      },
      debeCancelar: () => cancelado.current,
      alMensaje: (mensaje, error) => anunciar(mensaje, Boolean(error)),
      alProgreso: (progreso) => setProgreso(progreso),
      alLimpiarProgreso: () => {
        setProgreso(null)
        setRestante(null)
      },
      alRestante: (restante) => setRestante(restante),
      alLog: (linea) => setLogSintesis((anterior) => [...anterior, linea]),
      alInicio: () => setLogSintesis([]),
      alResultado: (resultado) => {
        if (audioUrl) URL.revokeObjectURL(audioUrl)
        setAudioUrl(URL.createObjectURL(resultado.blob))
        setMetricas({
          segundos: resultado.segundos,
          ms: resultado.ms,
          rtf: resultado.rtf,
          tamanoMB: resultado.tamanoMB,
          parcial: resultado.parcial,
          segmentosCompletados: resultado.segmentosCompletados,
          segmentosTotales: resultado.segmentosTotales,
        })
      },
      alCancelado: (mensaje) => {
        anunciar(mensaje)
      },
      alError: (mensaje) => {
        anunciar(t('error.generico', { mensaje }), true)
      },
    })

    setOcupado(false)
  }

  return (
    <main className="app">
      <header className="cabecera">
        <h1 className="marca">
          Supertonic <span>AudioBook</span>
        </h1>
        <div className="cabecera-acciones">
          <select
            className="selector-idioma"
            aria-label={t('ajustes.idiomaInterfaz')}
            value={ajustes.idioma}
            onChange={(e) => cambiar('idioma', e.target.value as IdiomaInterfaz)}
          >
            <option value="es">{t('idioma.es')}</option>
            <option value="en">{t('idioma.en')}</option>
          </select>
          <button
            type="button"
            className="icono"
            onClick={alternarTema}
            aria-label={ajustes.tema === 'oscuro' ? t('tema.aClaro') : t('tema.aOscuro')}
          >
            {ajustes.tema === 'oscuro' ? <IconoSol /> : <IconoLuna />}
            {ajustes.tema === 'oscuro' ? t('tema.claro') : t('tema.oscuro')}
          </button>
        </div>
      </header>

      <p className="intro">{t('intro')}</p>

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
                ? t('zona.soltar')
                : texto
                  ? t('zona.cambiar')
                  : t('zona.arrastrar')}
            </strong>
            <span>{texto ? t('zona.arrastrarOtro') : t('zona.elegir')}</span>
          </label>

          {texto && (
            <>
              <div className="meta">
                <span className="chip fuerte">
                  {nombreBase}
                  {extension ? `.${extension}` : ''}
                </span>
                <span className="chip">
                  {t('chip.caracteres', { n: texto.length.toLocaleString(ajustes.idioma) })}
                </span>
                <span className="chip">
                  {t(segmentos.length === 1 ? 'chip.segmento' : 'chip.segmentos', {
                    n: segmentos.length,
                  })}
                </span>
                <span className="chip">{t('chip.minutos', { n: minutos.toFixed(0) })}</span>
              </div>

              {texto.length > AVISO_CARACTERES && <p className="aviso">{t('aviso.largo')}</p>}

              <details className="texto">
                <summary>{t('texto.ver')}</summary>
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} />
              </details>
            </>
          )}
        </section>

        {/* Sin archivo no hay nada que ajustar: la tarjeta aparece al cargarlo. */}
        {texto && (
          <section className="tarjeta">
            <h2>{t('ajustes.titulo')}</h2>
            <div className="rejilla">
              <label htmlFor="voz">{t('ajustes.voz')}</label>
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

              <label htmlFor="idioma">{t('ajustes.idiomaVoz')}</label>
              <select
                id="idioma"
                value={ajustes.lang}
                disabled={ocupado}
                onChange={(e) => cambiar('lang', e.target.value)}
              >
                {IDIOMAS.map((codigo) => (
                  <option key={codigo} value={codigo}>
                    {t(`idioma.${codigo}`)}
                  </option>
                ))}
              </select>

              <label htmlFor="pasos">{t('ajustes.pasos')}</label>
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

              <label htmlFor="velocidad">{t('ajustes.velocidad')}</label>
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

              <label htmlFor="formato">{t('ajustes.formato')}</label>
              <select id="formato" defaultValue="wav" disabled={ocupado}>
                {FORMATOS.map((formato) => (
                  <option key={formato.id} value={formato.id} disabled={!formato.disponible}>
                    {formato.nombre}
                    {formato.disponible ? '' : ` (${t('formato.proximamente')})`}
                  </option>
                ))}
              </select>
            </div>
            <p className="nota">{t('ajustes.nota', { max: MAX_CHARS_PER_SEGMENT })}</p>
            <button type="button" className="fantasma acerca-boton" onClick={() => setAcercaAbierto(true)}>
              {t('acerca.titulo')}
            </button>
          </section>
        )}
      </div>

      <section className="acciones">
        <button type="button" className="principal" onClick={generar} disabled={ocupado || !texto}>
          {ocupado ? t('acciones.convirtiendo') : t('acciones.generar')}
        </button>
        {ocupado && (
          <button type="button" className="fantasma" onClick={pedirCancelacion}>
            {t('acciones.cancelar')}
          </button>
        )}
        {(backend || estadoMotor === 'preparando') && (
          <span className="backend">
            {estadoMotor === 'preparando' ? t('acciones.preparando') : backend}
          </span>
        )}
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
        {progreso && (
          <p className="restante">
            {restante === null
              ? t('progreso.calculando')
              : t('progreso.faltan', { tiempo: formatearRestante(restante) })}
          </p>
        )}
        {progreso && logSintesis.length > 0 && (
          <p className="log-sintesis">
            {logSintesis.map((linea, indice) => (
              <span key={`${indice}-${linea}`}>{linea}</span>
            ))}
          </p>
        )}
        <p className={esError ? 'estado error' : 'estado'}>{estado || t('estado.sinArchivo')}</p>
      </div>

      {audioUrl && (
        <section className="tarjeta resultado">
          <h2>{t('resultado.titulo')}</h2>
          <audio controls src={audioUrl} />
          {metricas && (
            <p className="detalle">
              {metricas.parcial && metricas.segmentosCompletados && metricas.segmentosTotales
                ? t('resultado.parcial', {
                    hechos: metricas.segmentosCompletados,
                    total: metricas.segmentosTotales,
                    detalle: detalleBase(metricas, t),
                  })
                : detalleBase(metricas, t)}
            </p>
          )}
          <p style={{ margin: '0.9rem 0 0' }}>
            <a className="principal descarga" href={audioUrl} download={`${nombreBase}.wav`}>
              {t('resultado.descargar', { archivo: nombreBase })}
            </a>
          </p>
        </section>
      )}

      <AcercaDe abierto={acercaAbierto} alCerrar={() => setAcercaAbierto(false)} t={t} />
    </main>
  )
}
