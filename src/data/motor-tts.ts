import * as ort from 'onnxruntime-web'
import {
  loadTextToSpeech,
  loadVoiceStyle,
  writeWavFile,
  AVAILABLE_LANGS,
  type Style,
  type TextToSpeech,
} from '../lib/supertonic/helper.js'

export { AVAILABLE_LANGS }
export type { Style, TextToSpeech }

const HF_BASE = 'https://huggingface.co/Supertone/supertonic-3/resolve/main'

let motorTts: TextToSpeech | null = null
let estiloVoz: Style | null = null

export function configurarOrt(): void {
  ort.env.wasm.wasmPaths = './ort/'
  // GitHub Pages sin COOP/COEP: usar WASM single-thread
  ort.env.wasm.numThreads = 1
  // Algunos builds web de ort usan wasmProxy; mantener comportamiento por defecto
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

export async function inicializarMotor(opts: {
  onnxDir?: string
  usarWebGPU?: boolean
  alProgreso?: (nombre: string, indice: number, total: number) => void
} = {}): Promise<{ motor: TextToSpeech; cfgs: Record<string, unknown> }> {
  configurarOrt()
  const onnxDir = opts.onnxDir ?? './assets/onnx'
  const wantGpu = opts.usarWebGPU ?? (await detectarWebGPU())

  const sessionOptions: ort.InferenceSession.SessionOptions = wantGpu
    ? { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' }
    : { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }

  const res = await loadTextToSpeech(onnxDir, sessionOptions, (nombre, indice, total) => {
    opts.alProgreso?.(nombre, indice, total)
  })

  motorTts = res.textToSpeech
  return { motor: res.textToSpeech, cfgs: res.cfgs }
}

export async function cargarVoces(opts: {
  voicePaths?: string[]
  verbose?: boolean
} = {}): Promise<Style> {
  const voicePaths = opts.voicePaths ?? Array.from({ length: 10 }, (_, i) => `./assets/voice_styles/M${i + 1}.json`)
  const style = await loadVoiceStyle(voicePaths, opts.verbose ?? false)
  estiloVoz = style
  return style
}

export function obtenerMotor(): TextToSpeech {
  if (!motorTts) throw new Error('Motor TTS no inicializado. Llama a inicializarMotor() primero.')
  return motorTts
}

export function obtenerEstilo(): Style {
  if (!estiloVoz) throw new Error('Estilos de voz no cargados. Llama a cargarVoces() primero.')
  return estiloVoz
}

export function generarWavBlob(wav: Float32Array | number[], sampleRate: number): Blob {
  const arr = Array.isArray(wav) ? new Float32Array(wav) : wav
  const buf = writeWavFile(arr, sampleRate)
  // writeWavFile devuelve ArrayBuffer
  return new Blob([buf as BlobPart], { type: 'audio/wav' })
}

export function urlModeloHf(archivo: string): string {
  return `${HF_BASE}/onnx/${archivo}`
}

export function urlVozHf(archivo: string): string {
  return `${HF_BASE}/voice_styles/${archivo}`
}
