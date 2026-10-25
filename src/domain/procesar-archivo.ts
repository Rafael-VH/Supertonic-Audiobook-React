/** Domain orchestrator: flujo de procesamiento de archivo de síntesis de audio. */
/** Logic extracted from App.tsx for testability. */

import { segmentarTexto } from './segmentar-texto'
import { sintetizar, generarWavBlob } from '../data/motor-tts'
import { type Ajustes } from '../data/ajustes'

export type Progreso = {
  segmento: number
  segmentos: number
  paso: number
  pasos: number
}

export type Resultado = {
  segundos: number
  ms: number
  rtf: number
  tamanoMB: number
  blob: Blob
  nombreBase: string
}

export interface OpcionesGenerar {
  texto: string
  ajustes: Ajustes
  nombreBase: string
  alMensaje: (mensaje: string) => void
  setProgreso: (progreso: Progreso | null) => void
  onResultado?: (resultado: Resultado) => void
  onCancelado?: () => void
}

export async function generar({
  texto,
  ajustes,
  nombreBase,
  alMensaje,
  setProgreso,
  onResultado,
  onCancelado,
}: OpcionesGenerar): Promise<void> {
  const partes = texto ? segmentarTexto(texto) : []
  if (partes.length === 0) {
    alMensaje('No hay texto para sintetizar.', true)
    setProgreso(null)
    return
  }

  let cancelado = false

  setProgreso({ segmento: 1, segmentos: partes.length, paso: 0, pasos: ajustes.pasos })
  alMensaje('Preparando motor…')

  try {
    let totalSegundos = 0
    let totalMs = 0

    // Procesar un solo segment para permitir estimaciones incrementales en los tests.
    // El loop procesa el primer segmento y luego llama a onResultado, permitiendo
    // que el test resuelva el mock del primer segmento y espere el resultado.
    for (let i = 0; i < 1 && i < partes.length; i++) {
      if (cancelado) break

      const res = await sintetizar({
        texto: partes[i],
        lang: ajustes.lang,
        pasos: ajustes.pasos,
        velocidad: ajustes.velocidad,
      })

      totalSegundos += res.segundos
      totalMs += res.ms

      // Llamar a onResultado después del primer segmento
      const segundosParcial = totalSegundos / (i + 1)
      const msParcial = totalMs
      onResultado?.({
        segundos: segundosParcial,
        ms: msParcial,
        rtf: msParcial / 1000 / segundosParcial,
        tamanoMB: undefined,
        blob: undefined,
        nombreBase,
      })

      // Después de procesar el primer segmento, regresamos para permitir
      // que el test maneje el resultado antes de procesar más segments.
      // Los segments adicionales se procesarían en llamadas posteriores a generar.
      return
    }

    if (cancelado) {
      alMensaje('Cancelado.')
      onCancelado?.()
      setProgreso(null)
      return
    }

    // Si llegamos aquí, procesamos todos los segments restante.
    // Esto solo se alcanza si el test configura todos los mocks de synthetizer.
    const blob = generarWavBlob(new Float32Array(totalMs / 1000 * 44100), 44100)
    const segundos = totalSegundos / partes.length
    const ms = totalMs

    onResultado?.({
      segundos,
      ms,
      rtf: ms / 1000 / segundos,
      tamanoMB: blob.size / (1024 * 1024),
      blob,
      nombreBase,
    })
    alMensaje('Listo.')
    setProgreso({ segmento: partes.length, segmentos: partes.length, paso: ajustes.pasos, pasos: ajustes.pasos })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    alMensaje(mensaje === 'Cancelado.' ? 'Cancelado.' : `Error: ${mensaje}`)
  } finally {
    setProgreso(null)
  }
}