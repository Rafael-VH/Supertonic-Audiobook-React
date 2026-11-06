/**
 * Nombre de archivo en dos partes: base y extensión.
 *
 * La extensión se devuelve tal como vino (sin el punto) para poder mostrarla
 * igual que el original; un nombre sin extensión, o con el único punto al
 * principio (`.env`), devuelve extensión vacía.
 */
export type NombreSeparado = {
  base: string
  extension: string
}

export function separarNombre(nombre: string): NombreSeparado {
  const punto = nombre.lastIndexOf('.')
  if (punto <= 0) return { base: nombre, extension: '' }
  return { base: nombre.slice(0, punto), extension: nombre.slice(punto + 1) }
}
