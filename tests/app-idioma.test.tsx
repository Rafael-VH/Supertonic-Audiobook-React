// @vitest-environment jsdom
/**
 * Cambio de idioma de la interfaz: traduce sin recargar, sigue el atributo
 * `lang` del documento y persiste en localStorage.
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

describe('idioma de la interfaz', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.lang = 'es'
    motor.inicializarMotor.mockReset().mockResolvedValue({ backend: 'wasm' })
    motor.cargarVoz.mockReset().mockResolvedValue(undefined)
    motor.estaIniciado.mockReset().mockReturnValue(false)
    motor.sintetizar.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('arranca en español', () => {
    render(<App />)

    expect(screen.getByText('Todavía no elegiste ningún archivo.')).toBeTruthy()
    expect(document.documentElement.lang).toBe('es')
  })

  it('cambia todos los textos sin recargar y persiste', async () => {
    render(<App />)
    const selector = screen.getByLabelText('Idioma de la interfaz')

    fireEvent.change(selector, { target: { value: 'en' } })

    expect(await screen.findByText('You have not chosen a file yet.')).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
    expect(JSON.parse(localStorage.getItem('supertonic.ajustes')!).idioma).toBe('en')

    cargarArchivo()
    expect(await screen.findByText('Settings')).toBeTruthy()
    expect(screen.getByRole('button', { name: /generate audio/i })).toBeTruthy()
    expect(screen.queryByText('Ajustes')).toBeNull()
  })

  it('mantiene el idioma al volver a montar la app', async () => {
    const primera = render(<App />)
    fireEvent.change(screen.getByLabelText('Idioma de la interfaz'), {
      target: { value: 'en' },
    })
    await screen.findByText('You have not chosen a file yet.')
    primera.unmount()

    render(<App />)

    expect(await screen.findByText('You have not chosen a file yet.')).toBeTruthy()
    await waitFor(() => expect(document.documentElement.lang).toBe('en'))
  })

  it('vuelve al español y traduce los ajustes', async () => {
    localStorage.setItem(
      'supertonic.ajustes',
      JSON.stringify({ idioma: 'en', voz: 'M1', lang: 'es' }),
    )
    render(<App />)
    cargarArchivo()

    expect(await screen.findByText('Settings')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Interface language'), { target: { value: 'es' } })

    expect(await screen.findByText('Ajustes')).toBeTruthy()
    expect(screen.queryByText('Settings')).toBeNull()
    expect(document.documentElement.lang).toBe('es')
  })
})
