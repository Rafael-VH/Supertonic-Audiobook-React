import { describe, expect, it } from 'vitest'
import { estimarRestante, formatearRestante } from '../src/domain/eta'

describe('estimarRestante', () => {
  it('no estima hasta que hay una medición utilizable', () => {
    expect(estimarRestante({ caracteres: 0, audioSegundos: 0, ms: 0 }, 100)).toBeNull()
    expect(estimarRestante({ caracteres: 10, audioSegundos: 0, ms: 5 }, 100)).toBeNull()
    expect(estimarRestante({ caracteres: 10, audioSegundos: 1, ms: 0 }, 100)).toBeNull()
  })

  it('extrapola con los ratios medidos en el equipo', () => {
    // 100 caracteres → 10 s de audio → 2 s de cómputo (RTF 0,2).
    // Quedan 300 caracteres → 30 s de audio → 6 s de cómputo.
    const avance = { caracteres: 100, audioSegundos: 10, ms: 2_000 }
    expect(estimarRestante(avance, 300)).toBeCloseTo(6, 5)
  })

  it('devuelve 0 cuando ya no quedan caracteres', () => {
    expect(estimarRestante({ caracteres: 100, audioSegundos: 10, ms: 2_000 }, 0)).toBe(0)
  })

  it('no devuelve negativos si los caracteres restantes vienen mal', () => {
    expect(estimarRestante({ caracteres: 100, audioSegundos: 10, ms: 2_000 }, -20)).toBe(0)
  })

  it('escala linealmente con el RTF', () => {
    const lento = estimarRestante({ caracteres: 100, audioSegundos: 10, ms: 4_000 }, 300)
    const rapido = estimarRestante({ caracteres: 100, audioSegundos: 10, ms: 2_000 }, 300)
    expect(lento).toBeCloseTo((rapido ?? 0) * 2, 5)
  })
})

describe('formatearRestante', () => {
  it('redondea a minutos por debajo de la hora', () => {
    expect(formatearRestante(30)).toBe('menos de 1 min')
    expect(formatearRestante(90)).toBe('2 min')
    expect(formatearRestante(600)).toBe('10 min')
  })

  it('muestra horas y minutos', () => {
    expect(formatearRestante(3_600)).toBe('1 h')
    expect(formatearRestante(3_900)).toBe('1 h 5 min')
  })

  it('no rompe con valores raros', () => {
    expect(formatearRestante(Number.NaN)).toBe('menos de 1 min')
    expect(formatearRestante(-10)).toBe('menos de 1 min')
  })
})
