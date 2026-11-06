// @vitest-environment jsdom
/**
 * Acerca de: el `<dialog>` se abre desde Ajustes, muestra versión y licencias,
 * se cierra con el botón o con Escape y sigue el idioma de la interfaz.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

function dialogo(): HTMLDialogElement | null {
  return document.querySelector('dialog.acerca')
}

describe('Acerca de', () => {
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

  it('no se muestra hasta pedirlo', () => {
    render(<App />)

    expect(dialogo()).toBeNull()
  })

  it('muestra versión, licencias y enlaces', async () => {
    render(<App />)
    cargarArchivo()

    fireEvent.click(await screen.findByRole('button', { name: 'Acerca de' }))

    expect(dialogo()).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Acerca de' })).toBeTruthy()
    // En tests no existe `__APP_VERSION__` (vitest usa su propio config).
    expect(screen.getByText('Versión 0.0.0')).toBeTruthy()
    expect(screen.getByText('Código de esta aplicación: licencia MIT.')).toBeTruthy()
    expect(screen.getByText(/OpenRAIL-M/)).toBeTruthy()

    expect(screen.getByRole('link', { name: 'Hugging Face' }).getAttribute('href')).toBe(
      'https://huggingface.co/Supertone/supertonic-3',
    )
    expect(screen.getByRole('link', { name: 'Repositorio del vendor' }).getAttribute('href')).toBe(
      'https://github.com/supertone-oss-archive/supertonic',
    )
  })

  it('se cierra con el botón Cerrar', async () => {
    render(<App />)
    cargarArchivo()
    fireEvent.click(await screen.findByRole('button', { name: 'Acerca de' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(dialogo()).toBeNull()
  })

  it('se cierra con Escape', async () => {
    render(<App />)
    cargarArchivo()
    fireEvent.click(await screen.findByRole('button', { name: 'Acerca de' }))

    fireEvent(dialogo()!, new Event('cancel', { cancelable: true, bubbles: true }))

    expect(dialogo()).toBeNull()
  })

  it('traduce el contenido al cambiar de idioma', async () => {
    render(<App />)
    cargarArchivo()

    fireEvent.change(screen.getByLabelText('Idioma de la interfaz'), {
      target: { value: 'en' },
    })
    await screen.findByText('Settings')

    fireEvent.click(screen.getByRole('button', { name: 'About' }))

    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy()
    expect(screen.getByText('Version 0.0.0')).toBeTruthy()
    expect(screen.getByText('This application code: MIT license.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Vendor repository' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })
})
