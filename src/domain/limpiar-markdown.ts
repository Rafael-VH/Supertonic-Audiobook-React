/**
 * Caso de uso puro: limpieza de Markdown a texto plano.
 *
 * Puerto de `app/domain/use_cases/limpiar_markdown.py` (version desktop).
 * Las reglas y su orden son identicos: los bloques de codigo van primero (el
 * patron de inline consumiria los backticks de apertura y romperia el bloque) y
 * las imagenes antes que los links (el patron generico dejaria el "!" residual).
 *
 * El flag `u` de las expresiones regulares hace que `\w` incluya caracteres
 * Unicode, igual que en Python: sin el, "a**b**" con acentos se trataria
 * distinto.
 */
export function limpiarMarkdown(texto: string): string {
  let t = texto

  // Bloques de codigo ANTES que titulos/negrita/inline.
  t = t.replace(/~~~.*?~~~/gs, '')
  t = t.replace(/```.*?```/gs, '')
  t = t.replace(/^#{1,6}\s*/gm, '')

  // Enfasis con asteriscos en pasadas separadas por conteo exacto (***, **, *):
  // el delimitador no puede estar adyacente a espacio, a otro asterisco ni ser
  // intraword, asi los operadores "2 * 3 * 4" o "a*b*c" no se confunden con
  // enfasis.
  t = t.replace(/(?<![\w*])\*{3}(?![\s*])(.*?)(?<![\s*])\*{3}(?![\w*])/gu, '$1')
  t = t.replace(/(?<![\w*])\*{2}(?![\s*])(.*?)(?<![\s*])\*{2}(?![\w*])/gu, '$1')
  t = t.replace(/(?<![\w*])\*{1}(?![\s*])(.*?)(?<![\s*])\*{1}(?![\w*])/gu, '$1')

  // Subrayado de enfasis con las mismas reglas: no puede estar adyacente a
  // espacio, a otro "_" ni ser intraword ("clave_privada" no es enfasis).
  t = t.replace(/(?<!\w)_{3}(?![\s_])(.*?)(?<![\s_])_{3}(?!\w)/gu, '$1')
  t = t.replace(/(?<!\w)_{2}(?![\s_])(.*?)(?<![\s_])_{2}(?!\w)/gu, '$1')
  t = t.replace(/(?<!\w)_{1}(?![\s_])(.*?)(?<![\s_])_{1}(?!\w)/gu, '$1')

  t = t.replace(/`{1,3}(.*?)`{1,3}/gu, '$1')

  // Imagenes ANTES que links.
  t = t.replace(/!\[([^\]]*)\]\([^)]+\)/gu, '$1')
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')

  // Blockquotes anclados al inicio de linea: sin ancla, "5 > 3" perderia el
  // operador de comparacion en medio de la prosa.
  t = t.replace(/^\s*>\s?/gm, '')

  // Lineas horizontales ancladas a la linea completa: "a---b" o "x***y" en
  // medio de la prosa no son reglas horizontales. Va ANTES de las listas para
  // que "* * *" o "- - -" no queden mutilados por la regla de vinetas.
  t = t.replace(/^\s*(?:-{3,}|\*{3,}|(?:\*[ \t]*){3,}|(?:-[ \t]*){3,})\s*$/gm, '')

  // Listas ancladas al inicio de linea: sin el ancla, "- x + y" o "a * b"
  // perderian sus operadores en medio de la prosa.
  t = t.replace(/^\s*[-*+]\s+/gm, '')

  // Listas ordenadas (hasta 3 digitos): "2024. Cifra..." es prosa con anio,
  // no un item; "8.5" no matchea porque exige espacio despues del marcador.
  t = t.replace(/^\s*\d{1,3}[.)]\s+/gm, '')

  t = t.replace(/\n{3,}/g, '\n\n')
  return t.trim()
}
