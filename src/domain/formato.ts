export type FormatoSalida = 'wav' | 'mp3' | 'ogg' | 'flac'

export type FormatoInfo = {
  id: FormatoSalida
  nombre: string
  disponible: boolean
}

/**
 * Nombres de formato: son marcas, no se traducen. La etiqueta de los que
 * todavía no se pueden generar (`formato.proximamente`) la pone la UI.
 */
export const FORMATOS: FormatoInfo[] = [
  { id: 'wav', nombre: 'WAV', disponible: true },
  { id: 'mp3', nombre: 'MP3', disponible: false },
  { id: 'ogg', nombre: 'OGG', disponible: false },
  { id: 'flac', nombre: 'FLAC', disponible: false },
]

export function normalizarFormatos(formato: unknown): FormatoSalida {
  if (formato === 'mp3' || formato === 'ogg' || formato === 'flac') {
    return 'wav'
  }
  if (formato === 'wav') {
    return 'wav'
  }
  return 'wav'
}
