/**
 * Walking skeleton de la web app: un texto → un WAV, con modelos desde
 * Hugging Face y caché en Cache Storage.
 *
 * La inferencia corre en un Web Worker, así que la pestaña no se congela y
 * se puede cancelar. La UI completa llega en la Fase 4 del plan
 * (ver docs/plan-port-react.md).
 */

import { useState } from 'react'
import {
  cancelar,
  cargarVoz,
  estaIniciado,
  generarWavBlob,
  inicializarMotor,
  sintetizar,
  type Backend,
} from './data/motor-tts'

const TEXTO_INICIAL = 'Hola, esto es una prueba de síntesis de voz en el navegador.'
const MB = 1024 * 1024
const MAX_CARACTERES = 1000

export default function App() {
  const [texto, setTexto] = useState(TEXTO_INICIAL)
  const [estado, setEstado] = useState('Listo. La primera vez descarga ~400 MB de modelos.')
  const [ocupado, setOcupado] = useState(false)
  const [backend, setBackend] = useState<Backend | null>(null)
  const [detalle, setDetalle] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

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
    setOcupado(true)
    setDetalle('')
    try {
      await prepararMotor()
      setEstado('Sintetizando…')

      const res = await sintetizar({
        texto,
        alPaso: (hecho, total) => setEstado(`Sintetizando… paso ${hecho}/${total}`),
      })

      const blob = generarWavBlob(res.muestras, res.sampleRate)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      setAudioUrl(URL.createObjectURL(blob))
      setDetalle(
        `${res.segundos.toFixed(1)} s de audio en ${(res.ms / 1000).toFixed(1)} s` +
          ` · RTF ${res.rtf.toFixed(2)} · ${(blob.size / MB).toFixed(1)} MB`,
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
      <p>Conversor de Markdown a audio, 100 % en el navegador.</p>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, MAX_CARACTERES))}
        rows={4}
        style={{ width: '100%', font: 'inherit', padding: '0.5rem' }}
      />
      <p style={{ margin: '0.25rem 0 0.75rem', opacity: 0.6, fontSize: '0.85rem' }}>
        {texto.length}/{MAX_CARACTERES} caracteres
      </p>

      <p>
        <button onClick={generar} disabled={ocupado}>
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
          <a href={audioUrl} download="muestra.wav" style={{ marginLeft: '1rem' }}>
            Descargar WAV
          </a>
        </p>
      )}
    </main>
  )
}
