/**
 * Motor TTS dentro de un Web Worker.
 *
 * Motivo: con `proxy = false`, ORT bloquea el hilo donde corre. En el hilo de
 * UI eso congela la pestaña durante toda la síntesis (minutos en un libro).
 * Aquí el hilo principal queda libre, el progreso se puede pintar y
 * `terminate()` da cancelación real.
 *
 * El aislamiento (COOP/COEP) se hereda del documento, así que los hilos de
 * WASM funcionan igual dentro del worker.
 */

import * as ort from 'onnxruntime-web'
import {
  loadTextToSpeech,
  loadVoiceStyle,
  type Style,
  type TextToSpeech,
} from '../lib/supertonic/helper.js'
import { BASE_ONNX, conCacheDeModelos, urlVoz, type ProgresoModelo } from '../data/cache-modelos'

export type Backend = 'webgpu' | 'wasm'

export type EventoTts =
  | { clase: 'listo'; backend: Backend }
  | { clase: 'modelo'; nombre: string; indice: number; total: number }
  | { clase: 'descarga'; progreso: ProgresoModelo }
  | { clase: 'paso'; hecho: number; total: number }

export type Peticion =
  | { tipo: 'init'; id: number; wasmPaths: string; usarWebGPU: boolean }
  | { tipo: 'voz'; id: number; voz: string }
  | {
      tipo: 'sintetizar'
      id: number
      texto: string
      lang: string
      pasos: number
      velocidad: number
      silencio: number
    }

export type Respuesta =
  | { tipo: 'evento'; id: number; evento: EventoTts }
  | { tipo: 'ok'; id: number }
  | {
      tipo: 'resultado'
      id: number
      muestras: Float32Array
      sampleRate: number
      segundos: number
      ms: number
    }
  | { tipo: 'error'; id?: number; mensaje: string }

/** `self` sin arrastrar la lib `webworker` a todo el programa de TS. */
const ctx = globalThis as unknown as {
  postMessage: (mensaje: Respuesta, transferibles?: Transferable[]) => void
  onmessage: ((evento: MessageEvent<Peticion>) => void) | null
  crossOriginIsolated?: boolean
}

const enviar = (mensaje: Respuesta, transferibles?: Transferable[]) =>
  ctx.postMessage(mensaje, transferibles)

let motor: TextToSpeech | null = null
let estilo: Style | null = null

function configurarOrt(wasmPaths: string): void {
  ort.env.wasm.wasmPaths = wasmPaths
  const hilos = ctx.crossOriginIsolated === true
  ort.env.wasm.numThreads = hilos ? Math.min(navigator.hardwareConcurrency || 1, 4) : 1
  // Este `helper.js` reutiliza tensores: con proxy ORT los detacha al
  // transferirlos y la segunda llamada explota. Ver docs/plan-port-react.md §5.3.
  ort.env.wasm.proxy = false

  console.info(
    `[tts.worker] coi=${ctx.crossOriginIsolated === true} ` +
      `nucleos=${navigator.hardwareConcurrency} hilos=${ort.env.wasm.numThreads}`,
  )
}

async function inicializar(peticion: Extract<Peticion, { tipo: 'init' }>): Promise<void> {
  configurarOrt(peticion.wasmPaths)

  const sessionOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: peticion.usarWebGPU ? ['webgpu'] : ['wasm'],
    graphOptimizationLevel: 'all',
  }

  const { textToSpeech } = await conCacheDeModelos(
    () =>
      loadTextToSpeech(BASE_ONNX, sessionOptions, (nombre, indice, total) => {
        console.info(
          `[tts.worker] ${nombre} listo (${indice}/${total}) a los ${Math.round(performance.now())}ms`,
        )
        enviar({ tipo: 'evento', id: peticion.id, evento: { clase: 'modelo', nombre, indice, total } })
      }),
    (progreso) => {
      enviar({ tipo: 'evento', id: peticion.id, evento: { clase: 'descarga', progreso } })
    },
  )

  motor = textToSpeech
  anunciarListo(peticion.id, peticion.usarWebGPU ? 'webgpu' : 'wasm')
}

function anunciarListo(id: number, backend: Backend): void {
  enviar({ tipo: 'evento', id, evento: { clase: 'listo', backend } })
  enviar({ tipo: 'ok', id })
}

async function cargarVoz(peticion: Extract<Peticion, { tipo: 'voz' }>): Promise<void> {
  estilo = await conCacheDeModelos(() => loadVoiceStyle([urlVoz(peticion.voz)], false), (progreso) => {
    enviar({ tipo: 'evento', id: peticion.id, evento: { clase: 'descarga', progreso } })
  })
  enviar({ tipo: 'ok', id: peticion.id })
}

async function sintetizar(peticion: Extract<Peticion, { tipo: 'sintetizar' }>): Promise<void> {
  if (!motor) throw new Error('Motor no inicializado en el worker.')
  if (!estilo) throw new Error('Voz no cargada en el worker.')

  const inicio = performance.now()
  const { wav, duration } = await motor.call(
    peticion.texto,
    peticion.lang,
    estilo,
    peticion.pasos,
    peticion.velocidad,
    peticion.silencio,
    (hecho, total) => enviar({ tipo: 'evento', id: peticion.id, evento: { clase: 'paso', hecho, total } }),
  )
  const ms = performance.now() - inicio

  const muestras = Float32Array.from(wav)
  enviar(
    {
      tipo: 'resultado',
      id: peticion.id,
      muestras,
      sampleRate: motor.sampleRate,
      segundos: duration[0] ?? 0,
      ms,
    },
    [muestras.buffer],
  )
}

ctx.onmessage = async (evento: MessageEvent<Peticion>) => {
  const peticion = evento.data
  try {
    if (peticion.tipo === 'init') await inicializar(peticion)
    else if (peticion.tipo === 'voz') await cargarVoz(peticion)
    else if (peticion.tipo === 'sintetizar') await sintetizar(peticion)
  } catch (error) {
    enviar({
      tipo: 'error',
      id: peticion.id,
      mensaje: error instanceof Error ? error.message : String(error),
    })
  }
}
