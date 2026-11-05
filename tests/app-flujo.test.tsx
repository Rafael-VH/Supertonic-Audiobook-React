// @vitest-environment jsdom
/**
 * Flujo de UI sin motor real: cubre la aceptación de la fase 3 (chips que
 * siguen al texto editado, Generar deshabilitado sin texto, ajustes que
 * persisten). El motor se reemplaza por un doble para no descargar 398 MB.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../src/App'

const motor = vi.hoisted(() => ({
  inicializarMotor: vi.fn(),
  cargarVoz: vi.fn(),
  estaIniciado: vi.fn(),
  sintetizar: vi.fn(),
  generarWavBlob: vi.fn(),
}))

vi.mock('../src/data/motor-tts', () => motor)

function cargarArchivo(nombre = 'prueba.md', contenido = 'Texto de prueba.') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const archivo = new File([contenido], nombre, { type: 'text/markdown' })
  Object.defineProperty(input, 'files', { value: [archivo], configurable: true })
  fireEvent.change(input)
}

describe('flujo de UI', () => {
  beforeEach(() => {
    localStorage.clear()
    motor.inicializarMotor.mockReset().mockResolvedValue({ backend: 'wasm' })
    motor.cargarVoz.mockReset().mockResolvedValue(undefined)
    motor.estaIniciado.mockReset().mockReturnValue(false)
    motor.sintetizar.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('Generar está deshabilitado mientras no hay texto', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: /generar audio/i })).toHaveProperty('disabled', true)
  })

  it('los chips siguen al texto editado', async () => {
    render(<App />)
    cargarArchivo()

    expect(await screen.findByText('16 caracteres')).toBeTruthy()

    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'a'.repeat(40) } })

    expect(await screen.findByText('40 caracteres')).toBeTruthy()
    expect(screen.queryByText('16 caracteres')).toBeNull()
  })

  it('el selector de voz persiste en localStorage', async () => {
    render(<App />)
    cargarArchivo()
    await screen.findByText('Ajustes')

    fireEvent.change(screen.getByLabelText('Voz'), { target: { value: 'F3' } })

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('supertonic.ajustes')!).voz).toBe('F3')
    })
  })
})
