import { describe, expect, it, vi } from 'vitest'
import { generar, type OpcionesGenerar } from '../src/domain/procesar-archivo'
import type { Ajustes } from '../src/data/ajustes'
import { crearTraductor } from '../src/i18n/traductor'

const ajustesBase: Ajustes = {
  voz: 'F1',
  lang: 'es',
  pasos: 5,
  velocidad: 1.0,
  tema: 'oscuro',
  idioma: 'es',
}

/** Dos párrafos de 800 caracteres: `segmentarTexto` no los fusiona. */
const DOS_SEGMENTOS = `${'a'.repeat(800)}\n\n${'a'.repeat(800)}`

function opciones(extra: Partial<OpcionesGenerar> = {}): OpcionesGenerar {
  return {
    texto: DOS_SEGMENTOS,
    ajustes: ajustesBase,
    nombreBase: 'audio',
    motor: { sintetizar: vi.fn() },
    t: crearTraductor('es'),
    debeCancelar: () => false,
    alMensaje: () => {},
    alProgreso: () => {},
    alLimpiarProgreso: () => {},
    alRestante: () => {},
    alLog: () => {},
    alInicio: () => {},
    alResultado: () => {},
    alCancelado: () => {},
    alError: () => {},
    ...extra,
  }
}

describe('procesar-archivo.orquestador', () => {
  it('sintetiza todos los segmentos y genera un blob', async () => {
    const sintetizar = vi
      .fn()
      .mockResolvedValueOnce({ muestras: new Float32Array([0.1]), sampleRate: 22050, segundos: 0.5, ms: 100 })
      .mockResolvedValueOnce({ muestras: new Float32Array([0.2]), sampleRate: 22050, segundos: 0.6, ms: 120 })
    const preparar = vi.fn().mockResolvedValue(undefined)
    const alResultado = vi.fn()

    await generar(opciones({ motor: { sintetizar, preparar }, alResultado }))

    expect(preparar).toHaveBeenCalledWith('F1')
    expect(sintetizar).toHaveBeenCalledTimes(2)
    expect(alResultado).toHaveBeenCalledTimes(1)
    expect(alResultado.mock.calls[0][0].blob).toBeInstanceOf(Blob)
  })

  it('cancela antes del primer segmento y no genera resultado', async () => {
    const sintetizar = vi.fn()
    const alResultado = vi.fn()
    const alCancelado = vi.fn()
    const alMensaje = vi.fn()

    await generar(
      opciones({
        motor: { sintetizar },
        debeCancelar: () => true,
        alResultado,
        alCancelado,
        alMensaje,
      }),
    )

    expect(sintetizar).not.toHaveBeenCalled()
    expect(alResultado).not.toHaveBeenCalled()
    expect(alCancelado).toHaveBeenCalledWith('Cancelado. No se generó audio.')
    expect(alMensaje).toHaveBeenCalledWith('Cancelado. No se generó audio.')
  })

  it('cancela entre segmentos y devuelve el audio parcial', async () => {
    let contador = 0
    const sintetizar = vi.fn().mockImplementation(async () => {
      contador++
      return { muestras: new Float32Array([0.1]), sampleRate: 22050, segundos: 0.5, ms: 100 }
    })
    const alResultado = vi.fn()
    const alCancelado = vi.fn()

    await generar(
      opciones({
        motor: { sintetizar },
        debeCancelar: () => contador >= 1,
        alResultado,
        alCancelado,
      }),
    )

    expect(sintetizar).toHaveBeenCalledTimes(1)
    expect(alResultado).toHaveBeenCalledTimes(1)
    const resultado = alResultado.mock.calls[0][0]
    expect(resultado.parcial).toBe(true)
    expect(resultado.segmentosCompletados).toBe(1)
    expect(resultado.segmentosTotales).toBe(2)
    expect(resultado.blob).toBeInstanceOf(Blob)
    expect(alCancelado).toHaveBeenCalledWith(expect.stringContaining('Audio parcial'))
  })

  it('reporta el error del motor y no genera resultado', async () => {
    const sintetizar = vi.fn().mockRejectedValue(new Error('sin memoria'))
    const alResultado = vi.fn()
    const alError = vi.fn()
    const alMensaje = vi.fn()

    await generar(opciones({ motor: { sintetizar }, alResultado, alError, alMensaje }))

    expect(alResultado).not.toHaveBeenCalled()
    expect(alError).toHaveBeenCalledWith('sin memoria')
    expect(alMensaje).toHaveBeenCalledWith('Error: sin memoria', true)
  })

  it('avisa si no hay texto', async () => {
    const alMensaje = vi.fn()

    await generar(opciones({ texto: '', alMensaje }))

    expect(alMensaje).toHaveBeenCalledWith(expect.stringContaining('No hay texto'), true)
  })
})
