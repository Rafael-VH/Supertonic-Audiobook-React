// @vitest-environment jsdom
/**
 * El worker tiene un solo estilo de voz cargado. Si el usuario cambia la voz
 * mientras la precarga todavía está cargando otra, los pedidos no pueden
 * solaparse: el último en terminar ganaría por azar.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const motor = vi.hoisted(() => ({
  inicializarMotor: vi.fn(),
  cargarVoz: vi.fn(),
  estaIniciado: vi.fn(),
  sintetizar: vi.fn(),
  generarWavBlob: vi.fn(),
}))

vi.mock('../src/data/motor-tts', () => motor)

import { useMotor } from '../src/ui/useMotor'

describe('useMotor', () => {
  beforeEach(() => {
    motor.inicializarMotor.mockReset().mockResolvedValue({ backend: 'wasm' })
    motor.cargarVoz.mockReset()
    motor.estaIniciado.mockReset().mockReturnValue(true)
  })

  it('serializa la carga de voces y termina con la última pedida', async () => {
    const pendientes: Array<{ voz: string; resolver: () => void }> = []
    motor.cargarVoz.mockImplementation(
      ({ voz }: { voz: string }) =>
        new Promise<void>((resolve) => pendientes.push({ voz, resolver: resolve })),
    )

    const { result } = renderHook(() => useMotor({ alMensaje: () => {}, alBackend: () => {} }))

    let precarga: Promise<void> = Promise.resolve()
    let generar: Promise<void> = Promise.resolve()
    act(() => {
      precarga = result.current.preparar('M1')
      generar = result.current.preparar('F1')
    })

    // La segunda voz no puede arrancar mientras la primera está en vuelo.
    await waitFor(() => expect(pendientes).toHaveLength(1))
    expect(pendientes[0].voz).toBe('M1')

    await act(async () => {
      pendientes[0].resolver()
    })

    await waitFor(() => expect(pendientes).toHaveLength(2))
    expect(pendientes[1].voz).toBe('F1')

    await act(async () => {
      pendientes[1].resolver()
      await Promise.all([precarga, generar])
    })

    expect(result.current.estado).toBe('listo')
    expect(motor.cargarVoz).toHaveBeenCalledTimes(2)
  })
})
