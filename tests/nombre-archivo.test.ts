import { describe, expect, it } from 'vitest'
import { separarNombre } from '../src/domain/nombre-archivo'

describe('separarNombre', () => {
  it('separa un .md', () => {
    expect(separarNombre('notas.md')).toEqual({ base: 'notas', extension: 'md' })
  })

  it('separa un .markdown', () => {
    expect(separarNombre('capitulo.markdown')).toEqual({ base: 'capitulo', extension: 'markdown' })
  })

  it('separa un .txt', () => {
    expect(separarNombre('notas.txt')).toEqual({ base: 'notas', extension: 'txt' })
  })

  it('deja el nombre intacto si no hay extensión', () => {
    expect(separarNombre('notas')).toEqual({ base: 'notas', extension: '' })
  })

  it('usa sólo el último punto con varios puntos', () => {
    expect(separarNombre('mi.archivo.final.md')).toEqual({
      base: 'mi.archivo.final',
      extension: 'md',
    })
  })

  it('reconoce la extensión en mayúsculas sin cambiarla', () => {
    expect(separarNombre('NOTAS.MD')).toEqual({ base: 'NOTAS', extension: 'MD' })
  })

  it('no trata un punto inicial como extensión', () => {
    expect(separarNombre('.env')).toEqual({ base: '.env', extension: '' })
  })
})
