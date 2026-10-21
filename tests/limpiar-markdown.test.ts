import { describe, expect, it } from 'vitest'
import { limpiarMarkdown } from '../src/domain/limpiar-markdown'

/**
 * Pruebas de la funcion pura `limpiarMarkdown`.
 * Puerto 1:1 de `app/tests/test_limpiar_markdown.py` (version desktop).
 */
describe('limpiarMarkdown', () => {
  it('quita titulos', () => {
    expect(limpiarMarkdown('# Título')).toBe('Título')
    expect(limpiarMarkdown('## Subtítulo')).toBe('Subtítulo')
  })

  it('quita negrita cursiva y codigo inline', () => {
    const texto = '**negrita** _cursiva_ `codigo`'
    expect(limpiarMarkdown(texto)).toBe('negrita cursiva codigo')
  })

  it('quita links e imagenes', () => {
    expect(limpiarMarkdown('[texto](https://x.com)')).toBe('texto')
    expect(limpiarMarkdown('![alt](img.png)')).toBe('alt')
  })

  it('quita blockquotes y listas', () => {
    const texto = '> cita\n- item1\n- item2'
    expect(limpiarMarkdown(texto)).toBe('cita\nitem1\nitem2')
  })

  it('quita bloques de codigo', () => {
    const texto = 'antes\n```python\nprint(1)\n```\ndespues'
    expect(limpiarMarkdown(texto)).toBe('antes\n\ndespues')
  })

  it('quita bloques tilde', () => {
    const texto = 'antes\n~~~\ncodigo\n~~~\ndespues'
    expect(limpiarMarkdown(texto)).toBe('antes\n\ndespues')
  })

  it('normaliza saltos y recorta', () => {
    expect(limpiarMarkdown('  hola\n\n\n\nmundo  ')).toBe('hola\n\nmundo')
  })

  it('prosa con operadores no se altera', () => {
    const texto = '2 + 3 = 5\na * b = c'
    expect(limpiarMarkdown(texto)).toBe(texto)
  })

  it('multiplicaciones con espacios no se altera', () => {
    const texto = '2 * 3 * 4 = 24'
    expect(limpiarMarkdown(texto)).toBe(texto)
  })

  it('underscores no comen snake_case', () => {
    expect(limpiarMarkdown('clave_privada_valor')).toBe('clave_privada_valor')
    expect(limpiarMarkdown('2 __ 3 = 5')).toBe('2 __ 3 = 5')
    expect(limpiarMarkdown('texto _cursiva_ fin')).toBe('texto cursiva fin')
  })

  it('hr guiones espaciados', () => {
    expect(limpiarMarkdown('- - -')).toBe('')
    expect(limpiarMarkdown('- item')).toBe('item')
  })

  it('hr con mas de tres marcadores', () => {
    expect(limpiarMarkdown('----')).toBe('')
    expect(limpiarMarkdown('****')).toBe('')
    expect(limpiarMarkdown('- - - -')).toBe('')
    expect(limpiarMarkdown('* * * *')).toBe('')
  })

  it('operadores asterisco sin espacios no se altera', () => {
    const texto = 'a*b*c\n5*4*3=60\napp*util*main'
    expect(limpiarMarkdown(texto)).toBe(texto)
  })

  it('negrita pegada a palabra no se mutila', () => {
    expect(limpiarMarkdown('**a**b')).toBe('**a**b')
    expect(limpiarMarkdown('la **mejor**opcion')).toBe('la **mejor**opcion')
    expect(limpiarMarkdown('a**b**c')).toBe('a**b**c')
    expect(limpiarMarkdown('***a***b')).toBe('***a***b')
    expect(limpiarMarkdown('**Nota:***esto* es clave')).toBe('**Nota:***esto* es clave')
  })

  it('comparadores y flechas no se altera', () => {
    const texto = '5 > 3\na -> b'
    expect(limpiarMarkdown(texto)).toBe(texto)
  })

  it('quita listas ordenadas', () => {
    const texto = '1. primero\n2. segundo'
    expect(limpiarMarkdown(texto)).toBe('primero\nsegundo')
  })

  it('hr solo en linea completa', () => {
    expect(limpiarMarkdown('a---b')).toBe('a---b')
    expect(limpiarMarkdown('x***y')).toBe('x***y')
    expect(limpiarMarkdown('---')).toBe('')
    expect(limpiarMarkdown('* * *')).toBe('')
  })

  it('negrita dentro de bloque de codigo no se toca', () => {
    const texto = 'antes\n```\n**no_negrita**\n```\ndespues'
    expect(limpiarMarkdown(texto)).toBe('antes\n\ndespues')
  })
})
