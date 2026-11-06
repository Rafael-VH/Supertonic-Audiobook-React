import { describe, expect, it } from 'vitest'
import { es } from '../src/i18n/es'
import { en } from '../src/i18n/en'
import { crearTraductor } from '../src/i18n/traductor'

function marcadores(texto: string): string[] {
  return [...texto.matchAll(/\{(\w+)\}/g)].map((coincidencia) => coincidencia[1]).sort()
}

describe('diccionarios', () => {
  it('tienen exactamente las mismas claves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort())
  })

  it('no dejan traducciones vacías', () => {
    for (const [clave, texto] of Object.entries(en)) {
      expect(texto.trim(), `clave ${clave}`).not.toBe('')
    }
    for (const [clave, texto] of Object.entries(es)) {
      expect(texto.trim(), `clave ${clave}`).not.toBe('')
    }
  })

  it('usan los mismos marcadores en ambos idiomas', () => {
    for (const clave of Object.keys(es) as Array<keyof typeof es>) {
      expect(marcadores(en[clave]), `clave ${clave}`).toEqual(marcadores(es[clave]))
    }
  })
})

describe('crearTraductor', () => {
  it('reemplaza los marcadores con los parámetros', () => {
    const t = crearTraductor('es')
    expect(t('chip.caracteres', { n: 12 })).toBe('12 caracteres')
    expect(t('resultado.parcial', { hechos: 1, total: 3, detalle: 'x' })).toBe(
      'Audio parcial (1 de 3 segmentos) · x',
    )
  })

  it('traduce según el idioma', () => {
    expect(crearTraductor('en')('acciones.generar')).toBe('Generate audio')
    expect(crearTraductor('es')('acciones.generar')).toBe('Generar audio')
  })

  it('deja el marcador visible si falta el parámetro', () => {
    expect(crearTraductor('es')('chip.caracteres', {})).toBe('{n} caracteres')
  })
})
