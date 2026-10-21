/**
 * Caso de uso puro: segmentacion de texto apto para TTS.
 *
 * Puerto de `app/domain/use_cases/segmentar_texto.py` (version desktop).
 */

/** Maximo de caracteres por fragmento de audio. */
export const MAX_CHARS_PER_SEGMENT = 1500

/** Parrafos con menos caracteres que este valor se fusionan con el siguiente. */
export const MERGE_THRESHOLD = 200

/** Abreviaturas cuyo punto no debe interpretarse como fin de oracion. */
const ABREVIATURAS: readonly string[] = [
  'Dr',
  'Dra',
  'Sr',
  'Sra',
  'Sta',
  'Sto',
  'etc',
  'i.e',
  'e.g',
  'vs',
  'Lic',
  'Ing',
  'Mtro',
  'Mtra',
  'Prof',
  'Gral',
]

/**
 * Divide texto en oraciones respetando abreviaturas del espanol.
 *
 * En vez de un patron con alternancia de largos distintos, se protegen
 * temporalmente los puntos de las abreviaturas con un caracter neutro, se parte
 * por ". " y se restauran los puntos.
 */
function dividirEnOraciones(texto: string): string[] {
  let protegido = texto
  for (const abr of ABREVIATURAS) {
    protegido = protegido.replaceAll(`${abr}.`, `${abr}\x00`)
  }
  return protegido.split(/(?<=\.)\s+/).map((f) => f.replaceAll('\x00', '.'))
}

/**
 * Divide texto plano en segmentos aptos para el TTS.
 *
 * Estrategia:
 * 1. Divide por saltos de linea (parrafos).
 * 2. Fusiona parrafos cortos (< MERGE_THRESHOLD) con el siguiente, siempre que
 *    no excedan MAX_CHARS_PER_SEGMENT.
 * 3. Si un segmento excede el limite, lo parte por oraciones, manejando
 *    correctamente titulos como Dr., Sr., etc.
 */
export function segmentarTexto(textoPlano: string): string[] {
  const parrafos = textoPlano
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  // --- 1. Fusion de parrafos cortos ---
  const fusionados: string[] = []
  let buffer = ''
  for (const p of parrafos) {
    if (!buffer) {
      buffer = p
    } else if (buffer.length + p.length < MAX_CHARS_PER_SEGMENT && p.length < MERGE_THRESHOLD) {
      buffer += ' ' + p
    } else {
      fusionados.push(buffer)
      buffer = p
    }
  }
  if (buffer) {
    fusionados.push(buffer)
  }

  // --- 2. Division de parrafos largos ---
  const resultado: string[] = []
  for (const p of fusionados) {
    if (p.length <= MAX_CHARS_PER_SEGMENT) {
      resultado.push(p)
      continue
    }

    // Split por ". " protegiendo abreviaturas espanolas
    const subfrases = dividirEnOraciones(p)
    let bufferFrase = ''
    for (const frase of subfrases) {
      if (bufferFrase.length + frase.length + 2 <= MAX_CHARS_PER_SEGMENT) {
        bufferFrase += frase + '. '
      } else {
        resultado.push(bufferFrase.trim())
        bufferFrase = frase + '. '
      }
    }
    if (bufferFrase) {
      resultado.push(bufferFrase.trim())
    }
  }

  return resultado
}
