/**
 * Adaptador del motor TTS: envuelve `helper.js` del vendor (MIT) y expone una
 * API pequeña en español para el dominio.
 *
 * Los pesos se descargan de Hugging Face con caché en Cache Storage
 * (ver `cache-modelos.ts`).
 */

import * as ort from 'onnxruntime-web'
import {
  loadTextToSpeech,
  loadVoiceStyle,
  writeWavFile,
  AVAILABLE_LANGS,
  type Style,
  type TextToSpeech,
} from '../lib/supertonic/helper.js'
import { BASE_ONNX, conCacheDeModelos, urlVoz, type ProgresoModelo } from './cache-modelos'

export { AVAILABLE_LANGS }
export type { Style, TextToSpeech }

export type Backend = 'webgpu' | 'wasm'

/** Defaults decididos en docs/plan-port-react.md §2.3 (paridad con el desktop). */
export const PASOS_DEFECTO = 5
export const VELOCIDAD_DEFECTO = 1.1
export const SILENCIO_DEFECTO = 0.6

let motorTts: TextToSpeech | null = null
let estiloVoz: Style | null = null
let backendActivo: Backend | null = null

/**
 * Configura ONNX Runtime Web.
 *
 * `wasmPaths` tiene que ser absoluto: con './ort/' ORT lo resuelve contra la
 * URL del módulo (`/node_modules/.vite/deps/ort/…`) y falla con
 * "no available backend found".
 */
export function configurarOrt(): void {
  ort.env.wasm.wasmPaths = new URL('ort/', document.baseURI).href

  const aislado =
    (globalThis as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
  const nucleos = navigator.hardwareConcurrency || 1
  ort.env.wasm.numThreads = aislado ? Math.min(nucleos, 4) : 1

  // OJO: `proxy = true` NO sirve con este `helper.js`. ORT transfiere los
  // ArrayBuffer al worker (los detacha) y el motor reutiliza los tensores del
  // estilo en cada paso -> "An ArrayBuffer is detached and could not be cloned".
  // Mientras la inferencia corra en el hilo principal, el aviso de "no
  // responde" es el precio. La solución de verdad es mover el motor entero a
  // un Web Worker propio (Fase 3 del plan).
  ort.env.wasm.proxy = false
}

export async function detectarWebGPU(): Promise<boolean> {
  try {
    const nav = navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown | null> } }
    if (!nav.gpu) return false
    const adapter = await nav.gpu.requestAdapter()
    return !!adapter
  } catch {
    return false
  }
}

export async function inicializarMotor(
  opts: {
    usarWebGPU?: boolean
    alProgreso?: (p: ProgresoModelo) => void
    alModelo?: (nombre: string, indice: number, total: number) => void
  } = {},
): Promise<{ motor: TextToSpeech; backend: Backend }> {
  const usarGpu = opts.usarWebGPU ?? (await detectarWebGPU())
  backendActivo = usarGpu ? 'webgpu' : 'wasm'
  configurarOrt()

  const sessionOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: usarGpu ? ['webgpu'] : ['wasm'],
    graphOptimizationLevel: 'all',
  }

  const { textToSpeech } = await conCacheDeModelos(
    () => loadTextToSpeech(BASE_ONNX, sessionOptions, opts.alModelo ?? null),
    opts.alProgreso,
  )

  motorTts = textToSpeech
  return { motor: textToSpeech, backend: backendActivo }
}

/**
 * Carga UN estilo de voz.
 *
 * `TextToSpeech.call()` rechaza lotes (`style.ttl.dims[0] !== 1`), así que no
 * se pueden cargar las 10 voces juntas como hacía la versión anterior.
 */
export async function cargarVoz(
  opts: { voz?: string; alProgreso?: (p: ProgresoModelo) => void } = {},
): Promise<Style> {
  const voz = opts.voz ?? 'M1'
  const estilo = await conCacheDeModelos(() => loadVoiceStyle([urlVoz(voz)], false), opts.alProgreso)
  estiloVoz = estilo
  return estilo
}

export function obtenerMotor(): TextToSpeech {
  if (!motorTts) throw new Error('Motor TTS no inicializado. Llama a inicializarMotor() primero.')
  return motorTts
}

export function obtenerEstilo(): Style {
  if (!estiloVoz) throw new Error('Estilo de voz no cargado. Llama a cargarVoz() primero.')
  return estiloVoz
}

export function backend(): Backend | null {
  return backendActivo
}

export type OpcionesSintesis = {
  texto: string
  lang?: string
  pasos?: number
  velocidad?: number
  silencio?: number
  alPaso?: (hecho: number, total: number) => void
}

export type ResultadoSintesis = {
  muestras: number[]
  sampleRate: number
  /** Duración del audio generado, en segundos. */
  segundos: number
  /** Tiempo de cómputo, en milisegundos. */
  ms: number
  /** Segundos de cómputo por segundo de audio. < 1 es más rápido que realtime. */
  rtf: number
}

export async function sintetizar(opts: OpcionesSintesis): Promise<ResultadoSintesis> {
  const motor = obtenerMotor()
  const estilo = obtenerEstilo()
  const inicio = performance.now()

  const { wav, duration } = await motor.call(
    opts.texto,
    opts.lang ?? 'es',
    estilo,
    opts.pasos ?? PASOS_DEFECTO,
    opts.velocidad ?? VELOCIDAD_DEFECTO,
    opts.silencio ?? SILENCIO_DEFECTO,
    opts.alPaso ?? null,
  )

  const ms = performance.now() - inicio
  const segundos = duration[0] ?? 0
  return {
    muestras: wav,
    sampleRate: motor.sampleRate,
    segundos,
    ms,
    rtf: segundos > 0 ? ms / 1000 / segundos : 0,
  }
}

export function generarWavBlob(muestras: ArrayLike<number>, sampleRate: number): Blob {
  return new Blob([writeWavFile(muestras, sampleRate)], { type: 'audio/wav' })
}
