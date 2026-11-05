/** Domain orchestrator: flujo de procesamiento de archivo de síntesis de audio. */
/** Logic extracted from App.tsx for testability. */

import { segmentarTexto } from './segmentar-texto'
import { concatenarMuestras, muestrasAWav } from '../data/wav'
import { type Ajustes } from '../data/ajustes'
import { type Avance, estimarRestante } from './eta'

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
  parcial?: boolean
  segmentosCompletados?: number
  segmentosTotales?: number
}

export type SintetizarResultado = {
  muestras: Float32Array
  sampleRate: number
  segundos: number
  ms: number
}

export interface MotorSintetizador {
  sintetizar(opts: {
    texto: string
    lang: string
    pasos: number
    velocidad: number
    alPaso?: (hecho: number) => void
  }): Promise<SintetizarResultado>
  preparar?(voz: string): Promise<void>
}

export interface OpcionesGenerar {
  texto: string
  ajustes: Ajustes
  nombreBase: string
  motor: MotorSintetizador
  debeCancelar: () => boolean
  alMensaje: (mensaje: string, error?: boolean) => void
  alProgreso: (progreso: Progreso) => void
  alLimpiarProgreso: () => void
  alRestante: (restante: number | null) => void
  alLog: (linea: string) => void
  alInicio?: () => void
  alResultado: (resultado: Resultado) => void
  alCancelado?: (mensaje: string) => void
  alError?: (mensaje: string) => void
}

export async function generar({
  texto,
  ajustes,
  nombreBase,
  motor,
  debeCancelar,
  alMensaje,
  alProgreso,
  alLimpiarProgreso,
  alRestante,
  alLog,
  alInicio,
  alResultado,
  alCancelado,
  alError,
}: OpcionesGenerar): Promise<void> {
  const partes = texto ? segmentarTexto(texto) : []
  if (partes.length === 0) {
    alMensaje('No hay texto para sintetizar.', true)
    alLimpiarProgreso()
    return
  }

  alInicio?.()
  alProgreso({ segmento: 1, segmentos: partes.length, paso: 0, pasos: ajustes.pasos })
  alRestante(null)
  alMensaje('Preparando motor…')

  const totalCaracteres = partes.reduce((suma, parte) => suma + parte.length, 0)
  const mediciones: Avance[] = []

  try {
    if (motor.preparar) {
      await motor.preparar(ajustes.voz)
    }

    const muestras: Float32Array[] = []
    let sampleRate = 0

    for (let i = 0; i < partes.length; i++) {
      if (debeCancelar()) break
      alProgreso({ segmento: i + 1, segmentos: partes.length, paso: 0, pasos: ajustes.pasos })
      alMensaje(`Sintetizando segmento ${i + 1} de ${partes.length}…`)
      const res = await motor.sintetizar({
        texto: partes[i],
        lang: ajustes.lang,
        pasos: ajustes.pasos,
        velocidad: ajustes.velocidad,
        alPaso: (hecho) => {
          alProgreso({
            segmento: i + 1,
            segmentos: partes.length,
            paso: hecho,
            pasos: ajustes.pasos,
          })
          alMensaje(`Segmento ${i + 1} de ${partes.length} — paso ${hecho}/${ajustes.pasos}`)
        },
      })
      muestras.push(res.muestras)
      sampleRate = res.sampleRate

      mediciones.push({
        caracteres: partes[i].length,
        audioSegundos: res.segundos,
        ms: res.ms,
      })
      const ultimas = mediciones.slice(-2).reduce(
        (suma, m) => ({
          caracteres: suma.caracteres + m.caracteres,
          audioSegundos: suma.audioSegundos + m.audioSegundos,
          ms: suma.ms + m.ms,
        }),
        { caracteres: 0, audioSegundos: 0, ms: 0 },
      )
      const hechos = mediciones.reduce((suma, m) => suma + m.caracteres, 0)
      const estimado = estimarRestante(ultimas, totalCaracteres - hechos)
      if (estimado !== null) alRestante(estimado)

      const totalAudioSegundos = mediciones.reduce((s, m) => s + m.audioSegundos, 0)
      const totalMs = mediciones.reduce((s, m) => s + m.ms, 0)
      const rtfTotal = totalAudioSegundos > 0 ? totalMs / 1000 / totalAudioSegundos : 0
      const tamanoEstimadoMB = totalAudioSegundos > 0 ? (totalAudioSegundos / 60) * 0.5 : 0
      alLog(
        `Segmento ${i + 1} de ${partes.length}: ${totalAudioSegundos.toFixed(1)} s de audio, ${totalMs.toFixed(0)} ms cómputo, RTF ${rtfTotal.toFixed(2)}, ~${tamanoEstimadoMB.toFixed(1)} MB`,
      )
    }

    if (debeCancelar()) {
      if (muestras.length === 0) {
        const mensaje = 'Cancelado. No se generó audio.'
        alMensaje(mensaje)
        alCancelado?.(mensaje)
        alLimpiarProgreso()
        return
      }
      const mensaje = `Cancelado tras ${muestras.length} de ${partes.length} segmentos. Audio parcial generado.`
      alMensaje(mensaje)
      try {
        const audio = concatenarMuestras(muestras)
        const buffer = muestrasAWav(audio, sampleRate)
        const blob = new Blob([buffer], { type: 'audio/wav' })
        const segundos = audio.length / sampleRate
        const ms = mediciones.reduce((suma, m) => suma + m.ms, 0)
        alResultado({
          segundos,
          ms,
          rtf: ms / 1000 / segundos,
          tamanoMB: blob.size / (1024 * 1024),
          blob,
          nombreBase,
          parcial: true,
          segmentosCompletados: muestras.length,
          segmentosTotales: partes.length,
        })
      } catch (e) {
        // Si falla la concatenación, avisamos sin romper el flujo
      }
      alCancelado?.(mensaje)
      alLimpiarProgreso()
      return
    }

    const audio = concatenarMuestras(muestras)
    const buffer = muestrasAWav(audio, sampleRate)
    const blob = new Blob([buffer], { type: 'audio/wav' })
    const segundos = audio.length / sampleRate
    const ms = mediciones.reduce((suma, m) => suma + m.ms, 0)

    alResultado({
      segundos,
      ms,
      rtf: ms / 1000 / segundos,
      tamanoMB: blob.size / (1024 * 1024),
      blob,
      nombreBase,
    })
    alMensaje('Listo.')
    alProgreso({ segmento: partes.length, segmentos: partes.length, paso: ajustes.pasos, pasos: ajustes.pasos })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    if (mensaje === 'Cancelado.') {
      alMensaje('Cancelado.')
      alCancelado?.('Cancelado.')
    } else {
      alMensaje(`Error: ${mensaje}`, true)
      alError?.(mensaje)
    }
  } finally {
    alLimpiarProgreso()
  }
}
