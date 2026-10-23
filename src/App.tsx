/**
 * UI: un archivo Markdown → un WAV.
 *
 * Flujo (igual que el desktop, adaptado a un solo archivo por vez):
 * `.md` → limpiarMarkdown() → segmentarTexto() → sintetizar segmento por
 * segmento → concatenar → descargar.
 *
 * La inferencia corre en un Web Worker, así que la pestaña no se congela y se
 * puede cancelar. La UI completa (ajustes, temas, formatos) es la Fase 4
 * restante del plan: docs/plan-port-react.md.
 */

import { useState } from 'react'
import { limpiarMarkdown } from './domain/limpiar-markdown'
import { MAX_CHARS_PER_SEGMENT, segmentarTexto } from './domain/segmentar-texto'
import {
  cancelar,
  cargarVoz,
  estaIniciado,
  generarWavBlob,
  inicializarMotor,
  sintetizar,
  type Backend,
} from './data/motor-tts'
import { concatenarMuestras } from './data/wav'

const MB = 1024 * 1024
/** ~900 caracteres por minuto de audio en español. Sólo para estimar. */
const CHARS_POR_MINUTO = 900
/** Por encima de esto avisamos: son decenas de minutos de cómputo. */
const AVISO_CARACTERES = 50_000

export default function App() {
  const [texto, setTexto] = useState('')
  const [nombreBase, setNombreBase] = useState('audio')
  const [estado, setEstado] = useState('Elegí un archivo .md para empezar.')
  const [ocupado, setOcupado] = useState(false)
  const [backend, setBackend] = useState<Backend | null>(null)
  const [detalle, setDetalle] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const segmentos = texto ? segmentarTexto(texto) : []
  const minutos = texto.length / CHARS_POR_MINUTO

  async function alElegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    if (!archivo) return

    const limpio = limpiarMarkdown(await archivo.text())
    setNombreBase(archivo.name.replace(/\.(md|markdown)$/i, ''))
    setTexto(limpio)
    setDetalle('')
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    setEstado(`«${archivo.name}» cargado.`)
  }

  async function prepararMotor() {
    if (estaIniciado()) return

    setEstado('Cargando modelos…')

    // Sin WebGPU a propósito: en GPU móvil ORT devuelve audio corrupto.
    // Ver el comentario de inicializarMotor() en data/motor-tts.ts.
    const { backend: real } = await inicializarMotor({
      alModelo: (nombre, i, total) => setEstado(`Cargando modelos ${i}/${total}: ${nombre}`),
      alProgreso: (p) => {
        if (p.desdeCache) {
          setEstado(`Modelo en caché: ${p.archivo}`)
          return
        }
        const pct = p.total ? Math.round((p.cargado / p.total) * 100) : 0
        setEstado(`Descargando ${p.archivo} ${pct}% (${(p.cargado / MB).toFixed(1)} MB)`)
      },
    })

    setBackend(real)
    setEstado(`Backend: ${real.toUpperCase()}. Cargando voz M1…`)
    await cargarVoz({
      voz: 'M1',
      alProgreso: (p) => setEstado(p.desdeCache ? 'Voz M1 en caché' : 'Descargando voz M1…'),
    })
  }

  async function generar() {
    const partes = segmentarTexto(texto)
    if (partes.length === 0) {
      setEstado('No hay texto para sintetizar.')
      return
    }

    setOcupado(true)
    setDetalle('')
    const inicio = performance.now()

    try {
      await prepararMotor()

      const muestras: Float32Array[] = []
      let sampleRate = 0

      for (let i = 0; i < partes.length; i++) {
        setEstado(`Sintetizando segmento ${i + 1}/${partes.length}…`)
        const res = await sintetizar({
          texto: partes[i],
          alPaso: (hecho, total) =>
            setEstado(`Segmento ${i + 1}/${partes.length} · paso ${hecho}/${total}`),
        })
        muestras.push(res.muestras)
        sampleRate = res.sampleRate
      }

      const audio = concatenarMuestras(muestras)
      const blob = generarWavBlob(audio, sampleRate)
      const segundos = audio.length / sampleRate
      const ms = performance.now() - inicio

      if (audioUrl) URL.revokeObjectURL(audioUrl)
      setAudioUrl(URL.createObjectURL(blob))
      setDetalle(
        `${partes.length} segmento(s) · ${segundos.toFixed(1)} s de audio en ${(ms / 1000).toFixed(1)} s` +
          ` · RTF ${(ms / 1000 / segundos).toFixed(2)} · ${(blob.size / MB).toFixed(1)} MB`,
      )
      setEstado('Listo.')
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error)
      setEstado(mensaje === 'Cancelado.' ? 'Cancelado.' : `Error: ${mensaje}`)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <main className="app">
      <h1>Supertonic-AudioBook</h1>
      <p>Convierte un archivo Markdown en audio, 100 % en el navegador.</p>

      <p>
        <input
          type="file"
          accept=".md,.markdown,text/markdown"
          onChange={alElegirArchivo}
          disabled={ocupado}
        />
      </p>

      {texto && (
        <>
          <p style={{ margin: '0.25rem 0 0.5rem', opacity: 0.7, fontSize: '0.9rem' }}>
            {texto.length} caracteres · {segmentos.length} segmento(s) de hasta{' '}
            {MAX_CHARS_PER_SEGMENT} · ~{minutos.toFixed(0)} min de audio
          </p>
          {texto.length > AVISO_CARACTERES && (
            <p style={{ margin: '0 0 0.5rem', color: '#b45309' }}>
              Texto largo: en WASM puede tardar más que el tiempo real. Probá con un capítulo
              primero.
            </p>
          )}
          <details>
            <summary style={{ cursor: 'pointer' }}>Ver texto limpio</summary>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              style={{ width: '100%', font: 'inherit', padding: '0.5rem', marginTop: '0.5rem' }}
            />
          </details>
        </>
      )}

      <p style={{ marginTop: '0.75rem' }}>
        <button onClick={generar} disabled={ocupado || !texto}>
          {ocupado ? 'Procesando…' : 'Generar audio'}
        </button>
        {ocupado && (
          <button onClick={cancelar} style={{ marginLeft: '0.5rem' }}>
            Cancelar
          </button>
        )}
        {backend && <span style={{ marginLeft: '1rem', opacity: 0.7 }}>backend: {backend}</span>}
      </p>

      <p aria-live="polite">{estado}</p>
      {detalle && <p style={{ opacity: 0.8 }}>{detalle}</p>}

      {audioUrl && (
        <p>
          <audio controls src={audioUrl} />
          <a href={audioUrl} download={`${nombreBase}.wav`} style={{ marginLeft: '1rem' }}>
            Descargar WAV
          </a>
        </p>
      )}
    </main>
  )
}
