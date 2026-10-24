/**
 * El motor se prepara una sola vez por visita: pedirlo de nuevo (doble clic, o
 * un segundo `generar()` mientras carga) no debe volver a verificar el modelo.
 *
 * No se puede cargar `onnxruntime-web` en node, así que se reemplaza `Worker`
 * por un doble que responde el protocolo igual que el worker real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Peticion = { tipo: string; id: number }

class WorkerFalso {
  static creados: WorkerFalso[] = []

  mensajes: Peticion[] = []
  onmessage: ((evento: { data: unknown }) => void) | null = null
  onerror: ((evento: { message?: string }) => void) | null = null

  constructor() {
    WorkerFalso.creados.push(this)
  }

  postMessage(peticion: Peticion): void {
    this.mensajes.push(peticion)

    if (peticion.tipo === 'init') {
      this.responder({ tipo: 'evento', id: peticion.id, evento: { clase: 'listo', backend: 'wasm' } })
      this.responder({ tipo: 'ok', id: peticion.id })
    } else if (peticion.tipo === 'voz') {
      this.responder({ tipo: 'ok', id: peticion.id })
    } else if (peticion.tipo === 'sintetizar') {
      this.responder({
        tipo: 'resultado',
        id: peticion.id,
        muestras: new Float32Array(8),
        sampleRate: 44_100,
        segundos: 0.2,
        ms: 20,
      })
    }
  }

  terminate(): void {}

  get inits(): number {
    return this.mensajes.filter((mensaje) => mensaje.tipo === 'init').length
  }

  private responder(respuesta: unknown): void {
    queueMicrotask(() => this.onmessage?.({ data: respuesta }))
  }
}

async function cargarMotor() {
  vi.resetModules()
  vi.stubGlobal('Worker', WorkerFalso)
  // `inicializarMotor()` calcula `wasmPaths` con `document.baseURI`.
  vi.stubGlobal('document', { baseURI: 'http://localhost:5173/' })
  return await import('../src/data/motor-tts')
}

describe('motor TTS: una inicialización por visita', () => {
  beforeEach(() => {
    WorkerFalso.creados = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('no vuelve a inicializar si se pide dos veces', async () => {
    const motor = await cargarMotor()

    await motor.inicializarMotor()
    await motor.inicializarMotor()

    expect(WorkerFalso.creados).toHaveLength(1)
    expect(WorkerFalso.creados[0].inits).toBe(1)
    expect(motor.backend()).toBe('wasm')
  })

  it('dos llamadas concurrentes comparten la misma carga', async () => {
    const motor = await cargarMotor()

    await Promise.all([motor.inicializarMotor(), motor.inicializarMotor()])

    expect(WorkerFalso.creados).toHaveLength(1)
    expect(WorkerFalso.creados[0].inits).toBe(1)
  })

  it('sintetizar después no vuelve a verificar el modelo', async () => {
    const motor = await cargarMotor()
    await motor.inicializarMotor()

    const resultado = await motor.sintetizar({ texto: 'hola' })

    expect(resultado.muestras).toHaveLength(8)
    expect(WorkerFalso.creados[0].inits).toBe(1)
    expect(WorkerFalso.creados[0].mensajes.filter((m) => m.tipo === 'sintetizar')).toHaveLength(1)
  })
})
