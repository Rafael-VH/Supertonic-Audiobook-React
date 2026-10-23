import { describe, expect, it } from 'vitest'
import {
  AJUSTES_DEFECTO,
  CLAVE_AJUSTES,
  cargarAjustes,
  guardarAjustes,
  normalizarAjustes,
  type Almacen,
} from '../src/data/ajustes'

function almacenFalso(inicial: Record<string, string> = {}): Almacen & { datos: Record<string, string> } {
  const datos = { ...inicial }
  return {
    datos,
    getItem: (clave) => datos[clave] ?? null,
    setItem: (clave, valor) => {
      datos[clave] = valor
    },
  }
}

describe('normalizarAjustes', () => {
  it('devuelve los defaults con entrada vacía', () => {
    expect(normalizarAjustes(undefined)).toEqual(AJUSTES_DEFECTO)
    expect(normalizarAjustes({})).toEqual(AJUSTES_DEFECTO)
  })

  it('descarta voz e idioma desconocidos', () => {
    const a = normalizarAjustes({ voz: 'X9', lang: 'klingon', pasos: 7, velocidad: 1.4 })
    expect(a.voz).toBe(AJUSTES_DEFECTO.voz)
    expect(a.lang).toBe(AJUSTES_DEFECTO.lang)
    expect(a.pasos).toBe(7)
    expect(a.velocidad).toBe(1.4)
  })

  it('acota pasos y velocidad al rango del modelo', () => {
    expect(normalizarAjustes({ pasos: 99 }).pasos).toBe(12)
    expect(normalizarAjustes({ pasos: 1 }).pasos).toBe(5)
    expect(normalizarAjustes({ velocidad: 9 }).velocidad).toBe(2)
    expect(normalizarAjustes({ velocidad: 0.1 }).velocidad).toBe(0.7)
  })

  it('ignora números inválidos', () => {
    const a = normalizarAjustes({ pasos: Number.NaN, velocidad: 'rápido' })
    expect(a.pasos).toBe(AJUSTES_DEFECTO.pasos)
    expect(a.velocidad).toBe(AJUSTES_DEFECTO.velocidad)
  })

  it('redondea los pasos', () => {
    expect(normalizarAjustes({ pasos: 7.6 }).pasos).toBe(8)
  })
})

describe('cargarAjustes / guardarAjustes', () => {
  it('hace roundtrip', () => {
    const almacen = almacenFalso()
    const elegidos = { voz: 'F3', lang: 'pt', pasos: 8, velocidad: 1.3 }
    guardarAjustes(elegidos, almacen)
    expect(cargarAjustes(almacen)).toEqual(elegidos)
  })

  it('cae en los defaults si el JSON está roto', () => {
    const almacen = almacenFalso({ [CLAVE_AJUSTES]: '{no es json' })
    expect(cargarAjustes(almacen)).toEqual(AJUSTES_DEFECTO)
  })

  it('sanea lo guardado por una versión vieja', () => {
    const almacen = almacenFalso({ [CLAVE_AJUSTES]: JSON.stringify({ voz: 'M1', pasos: 500 }) })
    const leidos = cargarAjustes(almacen)
    expect(leidos.pasos).toBe(12)
    expect(leidos.lang).toBe(AJUSTES_DEFECTO.lang)
  })
})
