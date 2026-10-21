const HF_BASE = 'https://huggingface.co/Supertone/supertonic-3/resolve/main'
const CACHE_NAME = 'supertonic-modelos-v1'

export const ONNX_FILES = [
  'tts.json',
  'unicode_indexer.json',
  'duration_predictor.onnx',
  'text_encoder.onnx',
  'vector_estimator.onnx',
  'vocoder.onnx',
]

export const VOICE_STYLE_FILES: string[] = Array.from({ length: 10 }, (_, i) => `M${i + 1}.json`)

export type ProgresoArchivo = {
  archivo: string
  hecho: number
  total: number
}

export type ProgresoDescarga = {
  nombre: string
  porcentaje: number
}

async function obtenerCache(): Promise<Cache> {
  if (!('caches' in self)) throw new Error('CacheStorage no disponible en este entorno')
  return caches.open(CACHE_NAME)
}

function rutaHfOnnx(archivo: string): string {
  return `${HF_BASE}/onnx/${archivo}`
}

function rutaHfVoice(archivo: string): string {
  return `${HF_BASE}/voice_styles/${archivo}`
}

async function descargarConProgreso(url: string, onProgress?: (porcentaje: number) => void): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`)
  if (!res.body) {
    const blob = await res.blob()
    return blob
  }

  const totalStr = res.headers.get('content-length')
  const total = totalStr ? Number(totalStr) : 0
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let cargado = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      cargado += value.length
      if (total > 0 && onProgress) {
        onProgress(Math.round((cargado / total) * 100))
      }
    }
  }

  return new Blob(chunks as BlobPart[])
}

export async function obtenerRecurso(url: string, onProgress?: (porcentaje: number) => void): Promise<Blob> {
  const cache = await obtenerCache()
  const cached = await cache.match(url)
  if (cached) {
    if (onProgress) onProgress(100)
    return cached.blob()
  }

  const blob = await descargarConProgreso(url, onProgress)
  await cache.put(url, new Response(blob))
  return blob
}

export async function estaCacheado(url: string): Promise<boolean> {
  try {
    const cache = await obtenerCache()
    const cached = await cache.match(url)
    return !!cached
  } catch {
    return false
  }
}

export function listarUrlsOnnx(): string[] {
  return ONNX_FILES.map(rutaHfOnnx)
}

export function listarUrlsVocces(): string[] {
  return VOICE_STYLE_FILES.map(rutaHfVoice)
}

export async function precargarModelos(opts: {
  onArchivo?: (info: ProgresoArchivo) => void
  onProgreso?: (info: ProgresoDescarga) => void
} = {}): Promise<void> {
  const urlsOnnx = await listarUrlsOnnx()
  const urlsVoc = await listarUrlsVocces()
  const urls = [...urlsOnnx, ...urlsVoc]
  const total = urls.length
  let hecho = 0

  for (const url of urls) {
    const nombre = url.split('/').pop() ?? url
    await obtenerRecurso(url, (porcentaje) => {
      opts.onProgreso?.({ nombre, porcentaje })
    })
    hecho++
    opts.onArchivo?.({ archivo: nombre, hecho, total })
  }
}

export async function hidratarAssetsPublic(): Promise<void> {
  // Los archivos deben estar disponibles en ./assets/onnx/ y ./assets/voice_styles/
  // para que helper.js haga fetch con rutas relativas a onnxDir.
  await precargarModelos()
}
