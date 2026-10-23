import { describe, expect, it } from 'vitest'
import { concatenarMuestras } from '../src/data/wav'

describe('concatenarMuestras', () => {
  it('pega los tramos en orden sin perder muestras', () => {
    const a = Float32Array.from([0.1, 0.2])
    const b = Float32Array.from([0.3])
    const c = Float32Array.from([0.4, 0.5, 0.6])
    const unido = concatenarMuestras([a, b, c])

    expect(unido.length).toBe(6)
    expect(Array.from(unido)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map(Math.fround))
  })

  it('devuelve un arreglo vacío sin tramos', () => {
    expect(concatenarMuestras([]).length).toBe(0)
  })
})
