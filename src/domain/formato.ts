export type FormatoSalida = 'wav' | 'mp3' | 'ogg' | 'flac'

export type FormatoInfo = {
  id: FormatoSalida
  nombre: string
  disponible: boolean
  etiqueta?: string
}

export const FORMATOS: FormatoInfo[] = [
  { id: 'wav', nombre: 'WAV', disponible: true },
  { id: 'mp3', nombre: 'MP3', disponible: false, etiqueta: 'próximamente' },
  { id: 'ogg', nombre: 'OGG', disponible: false, etiqueta: 'próximamente' },
  { id: 'flac', nombre: 'FLAC', disponible: false, etiqueta: 'próximamente' },
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
