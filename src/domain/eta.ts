/**
 * Estimación del tiempo de cómputo restante.
 *
 * No se usa un RTF fijo: depende del hardware, del navegador y de los pasos
 * elegidos. Con el primer segmento terminado se miden dos ratios reales del
 * equipo (segundos de audio por carácter y RTF) y se extrapola al resto.
 */

export type Avance = {
  /** Caracteres de los segmentos ya sintetizados. */
  caracteres: number
  /** Audio producido por esos segmentos, en segundos. */
  audioSegundos: number
  /** Cómputo invertido en esos segmentos, en milisegundos. */
  ms: number
}

/**
 * Segundos estimados para el texto que falta, o `null` si todavía no hay una
 * medición utilizable (primer segmento en curso, audio vacío o datos raros).
 *
 * `avance` describe una muestra reciente de segmentos (sirve para los ratios) y
 * `caracteresRestantes` es el texto que aún no se sintetizó. Se pasan por
 * separado para que la muestra pueda ser sólo de los últimos segmentos sin
 * descontar mal los caracteres ya procesados.
 */
export function estimarRestante(avance: Avance, caracteresRestantes: number): number | null {
  if (avance.caracteres <= 0 || avance.audioSegundos <= 0 || avance.ms <= 0) return null
  if (!Number.isFinite(caracteresRestantes)) return null

  const restantes = Math.max(0, caracteresRestantes)
  if (restantes === 0) return 0

  const segundosPorCaracter = avance.audioSegundos / avance.caracteres
  const rtf = avance.ms / 1000 / avance.audioSegundos
  return restantes * segundosPorCaracter * rtf
}

/** Texto corto para la UI: "menos de 1 min", "12 min", "1 h 5 min". */
export function formatearRestante(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 60) return 'menos de 1 min'

  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return `${minutos} min`

  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`
}
