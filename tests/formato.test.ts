import { describe, expect, it } from 'vitest'
import { FORMATOS, normalizarFormatos } from '../src/domain/formato'

describe('formato', () => {
  it('solo wav disponible', () => {
    expect(FORMATOS.find((f) => f.id === 'wav')?.disponible).toBe(true)
    expect(FORMATOS.find((f) => f.id === 'mp3')?.disponible).toBe(false)
    expect(FORMATOS.find((f) => f.id === 'ogg')?.disponible).toBe(false)
    expect(FORMATOS.find((f) => f.id === 'flac')?.disponible).toBe(false)
  })

  it('normaliza formatos no disponibles a wav', () => {
    expect(normalizarFormatos('mp3')).toBe('wav')
    expect(normalizarFormatos('ogg')).toBe('wav')
    expect(normalizarFormatos('flac')).toBe('wav')
    expect(normalizarFormatos('wav')).toBe('wav')
    expect(normalizarFormatos(null)).toBe('wav')
    expect(normalizarFormatos('cualquier')).toBe('wav')
  })
})
