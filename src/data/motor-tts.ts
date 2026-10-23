/**
 * Cliente del motor TTS. La inferencia vive en `workers/tts.worker.ts`; aquí
 * sólo se habla con él por mensajes.
 *
 * Por qué un worker (y no `ort.env.wasm.proxy`): el proxy de ORT transfiere los
 * tensores al worker y este `helper.js` los reutiliza, lo que revienta en la
 * segunda llamada. Además, con el motor en un worker propio la UI no se congela
 * y `terminate()` da cancelación real.
 */

import type { Backend, EventoTts, Peticion, Respuesta } from '../workers/tts.worker'
import { muestrasAWav } from './wav'

export type { Backend }
export type { ProgresoModelo } from './cache-modelos'

/** Defaults decididos en docs/plan-port-react.md §2.3 (paridad con el desktop). */
export const PASOS_DEFECTO = 5
export const VELOCIDAD_DEFECTO = 1.1
export const SILENCIO_DEFECTO = 0.6

type Oyentes = {
  alEvento?: (evento: EventoTts) => void
}

type Pendiente = {
  resolver: (respuesta: Respuesta) => void
  rechazar: (error: Error) => void
  alEvento?: (evento: EventoTts) => void
}

let worker: Worker | null = null
let backendActivo: Backend | null = null
let proximoId = 1
const pendientes = new Map<number, Pendiente>()

function asegurarWorker(): Worker {
  if (worker) return worker

  const nuevo = new Worker(new URL('../workers/tts.worker.ts', import.meta.url), {
    type: 'module',
    name: 'tts',
  })

  nuevo.onmessage = (evento: MessageEvent<Respuesta>) => recibir(evento.data)
  nuevo.onerror = (evento) => {
    const error = new Error(evento.message || 'El worker de TTS se cayó.')
    for (const pendiente of pendientes.values()) pendiente.rechazar(error)
    pendientes.clear()
    worker = null
  }

  worker = nuevo
  return nuevo
}

function recibir(respuesta: Respuesta): void {
  if (respuesta.tipo === 'evento') {
    pendientes.get(respuesta.id)?.alEvento?.(respuesta.evento)
    return
  }

  if (respuesta.tipo === 'error') {
    const pendiente = respuesta.id !== undefined ? pendientes.get(respuesta.id) : undefined
    if (pendiente) {
      pendientes.delete(respuesta.id!)
      pendiente.rechazar(new Error(respuesta.mensaje))
    } else {
      for (const p of pendientes.values()) p.rechazar(new Error(respuesta.mensaje))
      pendientes.clear()
    }
    return
  }

  const pendiente = pendientes.get(respuesta.id)
  if (!pendiente) return
  pendientes.delete(respuesta.id)
  pendiente.resolver(respuesta)
}

function pedir(peticion: Peticion, oyentes: Oyentes = {}): Promise<Respuesta> {
  const destino = asegurarWorker()
  return new Promise<Respuesta>((resolver, rechazar) => {
    pendientes.set(peticion.id, { resolver, rechazar, alEvento: oyentes.alEvento })
    destino.postMessage(peticion)
  })
}

export function estaIniciado(): boolean {
  return worker !== null && backendActivo !== null
}

export function backend(): Backend | null {
  return backendActivo
}

export async function inicializarMotor(
  opts: {
    /**
     * ponytail: WebGPU apagado por defecto a propósito.
     *
     * El EP `webgpu` de ORT 1.30 devuelve audio corrupto en GPUs móviles: un
     * tono continuo en vez de voz, sin lanzar ningún error (verificado en un
     * celular que reportaba `backend: webgpu`). En WASM el audio es correcto en
     * todos los equipos probados. Re-activar sólo después de validar en
     * hardware real; el cableado hasta el worker queda intacto.
     */
    usarWebGPU?: boolean
    alProgreso?: (progreso: { archivo: string; cargado: number; total: number; desdeCache: boolean }) => void
    alModelo?: (nombre: string, indice: number, total: number) => void
  } = {},
): Promise<{ backend: Backend }> {
  const usarGpu = opts.usarWebGPU === true

  const respuesta = await pedir(
    {
      tipo: 'init',
      id: proximoId++,
      wasmPaths: new URL('ort/', document.baseURI).href,
      usarWebGPU: usarGpu,
    },
    {
      alEvento: (evento) => {
        if (evento.clase === 'modelo') opts.alModelo?.(evento.nombre, evento.indice, evento.total)
        else if (evento.clase === 'descarga') opts.alProgreso?.(evento.progreso)
        else if (evento.clase === 'listo') backendActivo = evento.backend
      },
    },
  )

  if (respuesta.tipo === 'error') throw new Error(respuesta.mensaje)
  if (!backendActivo) backendActivo = usarGpu ? 'webgpu' : 'wasm'
  return { backend: backendActivo }
}

export async function cargarVoz(
  opts: {
    voz?: string
    alProgreso?: (progreso: { archivo: string; cargado: number; total: number; desdeCache: boolean }) => void
  } = {},
): Promise<void> {
  await pedir(
    { tipo: 'voz', id: proximoId++, voz: opts.voz ?? 'M1' },
    {
      alEvento: (evento) => {
        if (evento.clase === 'descarga') opts.alProgreso?.(evento.progreso)
      },
    },
  )
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
  muestras: Float32Array
  sampleRate: number
  /** Duración del audio generado, en segundos. */
  segundos: number
  /** Tiempo de cómputo, en milisegundos. */
  ms: number
  /** Segundos de cómputo por segundo de audio. < 1 es más rápido que realtime. */
  rtf: number
}

export async function sintetizar(opts: OpcionesSintesis): Promise<ResultadoSintesis> {
  if (!estaIniciado()) throw new Error('Motor TTS no inicializado. Llama a inicializarMotor() primero.')

  const respuesta = await pedir(
    {
      tipo: 'sintetizar',
      id: proximoId++,
      texto: opts.texto,
      lang: opts.lang ?? 'es',
      pasos: opts.pasos ?? PASOS_DEFECTO,
      velocidad: opts.velocidad ?? VELOCIDAD_DEFECTO,
      silencio: opts.silencio ?? SILENCIO_DEFECTO,
    },
    {
      alEvento: (evento) => {
        if (evento.clase === 'paso') opts.alPaso?.(evento.hecho, evento.total)
      },
    },
  )

  if (respuesta.tipo !== 'resultado') throw new Error('Respuesta inesperada del worker de TTS.')
  const segundos = respuesta.segundos
  return {
    muestras: respuesta.muestras,
    sampleRate: respuesta.sampleRate,
    segundos,
    ms: respuesta.ms,
    rtf: segundos > 0 ? respuesta.ms / 1000 / segundos : 0,
  }
}

/**
 * Cancela lo que esté corriendo matando el worker. Los pesos siguen en Cache
 * Storage, así que volver a empezar no cuesta otra descarga (sí la creación de
 * sesiones).
 */
export function cancelar(): void {
  if (worker) worker.terminate()
  worker = null
  backendActivo = null
  for (const pendiente of pendientes.values()) pendiente.rechazar(new Error('Cancelado.'))
  pendientes.clear()
}

export function generarWavBlob(muestras: Float32Array, sampleRate: number): Blob {
  return new Blob([muestrasAWav(muestras, sampleRate)], { type: 'audio/wav' })
}
