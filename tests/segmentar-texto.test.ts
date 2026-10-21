import { describe, expect, it } from 'vitest'
import { MAX_CHARS_PER_SEGMENT, segmentarTexto } from '../src/domain/segmentar-texto'

/**
 * Pruebas de la funcion pura `segmentarTexto`.
 * Puerto 1:1 de `app/tests/test_segmentar_texto.py` (version desktop).
 */
describe('segmentarTexto', () => {
  it('respeta parrafos existentes', () => {
    const largo = 'Palabra larga. '.repeat(20) // > MERGE_THRESHOLD: no se fusiona
    const resultado = segmentarTexto(`${largo}\n\n${largo}\n\n${largo}`)
    expect(resultado).toHaveLength(3)
  })

  it('fusiona parrafos cortos', () => {
    const resultado = segmentarTexto('Corto.\n\nTambién corto.\n\nLargo.')
    expect(resultado.length).toBeLessThan(3)
  })

  it('divide parrafo largo por oraciones', () => {
    const parrafo = 'Oración una. '.repeat(120) + 'Oración final.'
    expect(parrafo.length).toBeGreaterThan(MAX_CHARS_PER_SEGMENT)
    const resultado = segmentarTexto(parrafo)
    expect(resultado.length).toBeGreaterThan(1)
    for (const segmento of resultado) {
      expect(segmento.length).toBeLessThanOrEqual(MAX_CHARS_PER_SEGMENT)
    }
  })

  it('no parte abreviaturas espanolas', () => {
    const parrafo = 'El Dr. Pérez llegó a tiempo. '.repeat(40).trim()
    const resultado = segmentarTexto(parrafo)
    for (const segmento of resultado) {
      expect(segmento).toContain('Dr.')
    }
  })

  it('parrafo corto se mantiene entero', () => {
    expect(segmentarTexto('Hola mundo.')).toEqual(['Hola mundo.'])
  })
})
