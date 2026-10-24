// @vitest-environment jsdom
/**
 * Precarga: la preparación del motor arranca al elegir el archivo, no al tocar
 * Generar, y Generar reutiliza ese trabajo. El motor real se reemplaza por un
 * doble para no descargar 398 MB en los tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../src/App'

const motor = vi.hoisted(() => ({
  inicializarMotor: vi.fn(),
  cargarVoz: vi.fn(),
  estaIniciado: vi.fn(),
  sintetizar: vi.fn(),
  generarWavBlob: vi.fn(),
}))

vi.mock('../src/data/motor-tts', () => motor)

function cargarArchivo(nombre = 'prueba.md', contenido = '# Título\n\nTexto de prueba.') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const archivo = new File([contenido], nombre, { type: 'text/markdown' })
  Object.defineProperty(input, 'files', { value: [archivo], configurable: true })
  fireEvent.change(input)
}

describe('precarga del motor', () => {
  beforeEach(() => {
    localStorage.clear()
    motor.inicializarMotor.mockReset().mockResolvedValue({ backend: 'wasm' })
    motor.cargarVoz.mockReset().mockResolvedValue(undefined)
    motor.estaIniciado.mockReset().mockReturnValue(false)
    motor.sintetizar.mockReset().mockResolvedValue({
      muestras: new Float32Array(4_410),
      sampleRate: 44_100,
      segundos: 0.1,
      ms: 100,
      rtf: 1,
    })
    motor.generarWavBlob.mockReset().mockReturnValue(new Blob())

    URL.createObjectURL = vi.fn(() => 'blob:audio')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('no prepara nada hasta que hay un archivo', () => {
    render(<App />)
    expect(motor.inicializarMotor).not.toHaveBeenCalled()
    expect(screen.queryByText('Ajustes')).toBeNull()
  })

  it('precarga al elegir el archivo, sin tocar Generar', async () => {
    render(<App />)
    cargarArchivo()

    expect(await screen.findByText('Ajustes')).toBeTruthy()
    await waitFor(() => expect(motor.inicializarMotor).toHaveBeenCalledTimes(1))
    expect(motor.cargarVoz).toHaveBeenCalledTimes(1)
    expect(motor.sintetizar).not.toHaveBeenCalled()
  })

  it('Generar reutiliza la precarga y no vuelve a inicializar', async () => {
    render(<App />)
    cargarArchivo()
    await screen.findByText('Ajustes')
    await waitFor(() => expect(motor.inicializarMotor).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /generar audio/i }))

    expect(await screen.findByText('Resultado')).toBeTruthy()
    expect(motor.inicializarMotor).toHaveBeenCalledTimes(1)
    expect(motor.cargarVoz).toHaveBeenCalledTimes(1)
    expect(motor.sintetizar).toHaveBeenCalledTimes(1)
  })

  it('reintenta la preparación al generar si la precarga falló', async () => {
    motor.inicializarMotor
      .mockReset()
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValue({ backend: 'wasm' })

    render(<App />)
    cargarArchivo()

    expect(await screen.findByText(/no se pudieron preparar/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /generar audio/i }))

    expect(await screen.findByText('Resultado')).toBeTruthy()
    expect(motor.inicializarMotor).toHaveBeenCalledTimes(2)
  })

  it('muestra el tiempo restante estimado después del primer segmento', async () => {
    // Dos párrafos de 800 caracteres → dos segmentos (no se fusionan).
    const parrafo = 'a'.repeat(800)
    const resolver: Array<(valor: unknown) => void> = []
    motor.sintetizar.mockImplementation(
      () => new Promise((resolve) => resolver.push(resolve as (valor: unknown) => void)),
    )

    render(<App />)
    cargarArchivo('largo.md', `${parrafo}\n\n${parrafo}`)
    await screen.findByText('Ajustes')
    fireEvent.click(screen.getByRole('button', { name: /generar audio/i }))

    expect(await screen.findByText(/calculando el tiempo restante/i)).toBeTruthy()

    await act(async () => {
      resolver[0]?.({ muestras: new Float32Array(4_410), sampleRate: 44_100, segundos: 4, ms: 8_000, rtf: 2 })
    })

    expect(await screen.findByText(/faltan ≈/i)).toBeTruthy()
  })
})
