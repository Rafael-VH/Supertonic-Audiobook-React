/**
 * Descarga y caché de los pesos de Supertonic 3.
 *
 * Los ONNX pesan 398 MB juntos, así que no pueden vivir en GitHub Pages
 * (límite: 100 MB por archivo). Se bajan de Hugging Face en runtime y quedan
 * en Cache Storage.
 *
 * Detalle que importa: los archivos grandes responden 302 hacia una CDN con
 * URL firmada que caduca en ~1 h. Por eso la clave de caché es SIEMPRE la URL
 * estable `resolve/main/...`, nunca la redirigida.
 *
 * Estrategia: en vez de reescribir `helper.js` (vendor, MIT) para que acepte
 * bytes, se intercepta `fetch` mientras dura la carga del motor. Así el vendor
 * sigue funcionando con rutas normales y la caché queda transparente.
 */

export const HF_BASE = 'https://huggingface.co/Supertone/supertonic-3/resolve/main'

/** Directorio que se le pasa a `loadTextToSpeech()`. */
export const BASE_ONNX = `${HF_BASE}/onnx`

const CACHE_NAME = 'supertonic-modelos-v1'

export const ONNX_FILES = [
  'tts.json',
  'unicode_indexer.json',
  'duration_predictor.onnx',
  'text_encoder.onnx',
  'vector_estimator.onnx',
  'vocoder.onnx',
] as const

/** Voces reales de Supertonic 3: 5 masculinas + 5 femeninas. */
export const VOCES = ['M1', 'M2', 'M3', 'M4', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5'] as const

export type Voz = (typeof VOCES)[number]

export type ProgresoModelo = {
  archivo: string
  cargado: number
  total: number
  desdeCache: boolean
}

export const urlOnnx = (archivo: string): string => `${BASE_ONNX}/${archivo}`
export const urlVoz = (voz: string): string => `${HF_BASE}/voice_styles/${voz}.json`

const cacheDisponible = (): boolean => typeof caches !== 'undefined'

function nombreDe(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1)
}

/** Cuenta bytes al pasar, para poder mostrar progreso real de descarga. */
function contador(
  archivo: string,
  total: number,
  alProgreso?: (p: ProgresoModelo) => void,
): TransformStream<Uint8Array, Uint8Array> {
  let cargado = 0
  return new TransformStream({
    transform(chunk, controller) {
      cargado += chunk.byteLength
      alProgreso?.({ archivo, cargado, total, desdeCache: false })
      controller.enqueue(chunk)
    },
  })
}

type Fetch = typeof globalThis.fetch

/** Escrituras de caché en curso, para poder esperarlas al cerrar la carga. */
let pendientes: Promise<unknown>[] = []

async function respuestaConCache(
  cache: Cache,
  url: string,
  init: RequestInit | undefined,
  original: Fetch,
  alProgreso?: (p: ProgresoModelo) => void,
): Promise<Response> {
  const enCache = await cache.match(url)
  if (enCache) {
    alProgreso?.({ archivo: nombreDe(url), cargado: 0, total: 0, desdeCache: true })
    return enCache
  }

  const res = await original(url, init)
  if (!res.ok || !res.body) return res

  const archivo = nombreDe(url)
  const total = Number(res.headers.get('content-length') ?? 0)
  const [paraCache, paraConsumir] = res.body.tee()

  // Streaming a disco: no se materializa el ArrayBuffer (256 MB en RAM sería OOM).
  pendientes.push(
    cache
      .put(url, new Response(paraCache.pipeThrough(contador(archivo, total, alProgreso)), { headers: res.headers }))
      .catch((error) => console.warn(`[cache] no se pudo guardar ${archivo}`, error)),
  )

  return new Response(paraConsumir, { status: res.status, headers: res.headers })
}

/**
 * Ejecuta `fn` (normalmente la carga del motor) sirviendo los pesos desde
 * Cache Storage y guardando lo que falte. Las URLs ajenas a HF pasan intactas.
 */
export async function conCacheDeModelos<T>(
  fn: () => Promise<T>,
  alProgreso?: (p: ProgresoModelo) => void,
): Promise<T> {
  if (!cacheDisponible()) return fn()

  const original = globalThis.fetch
  pendientes = []

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith(HF_BASE)) return original(input as RequestInfo, init)
    return caches.open(CACHE_NAME).then((cache) => respuestaConCache(cache, url, init, original, alProgreso))
  }) as Fetch

  try {
    return await fn()
  } finally {
    globalThis.fetch = original
    const enCurso = pendientes
    pendientes = []
    // Tope de espera: si una escritura queda colgada no se bloquea la carga.
    await Promise.race([
      Promise.allSettled(enCurso),
      new Promise((resolve) => setTimeout(resolve, 60_000)),
    ])
  }
}

export type EstadoCache = {
  archivo: string
  bytes: number
}

export async function listarCache(): Promise<EstadoCache[]> {
  if (!cacheDisponible()) return []
  const cache = await caches.open(CACHE_NAME)
  const claves = await cache.keys()
  const estado: EstadoCache[] = []
  for (const request of claves) {
    const res = await cache.match(request)
    const bytes = Number(res?.headers.get('content-length') ?? 0)
    estado.push({ archivo: nombreDe(request.url), bytes })
  }
  return estado
}

export async function borrarCache(): Promise<void> {
  if (!cacheDisponible()) return
  await caches.delete(CACHE_NAME)
}
