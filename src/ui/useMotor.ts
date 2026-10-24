/**
 * Estado del motor para la UI.
 *
 * La precarga y el botón Generar comparten este hook: `preparar()` es
 * idempotente, así que pedirlo dos veces no descarga ni verifica el modelo dos
 * veces (la deduplicación real vive en `inicializarMotor()`).
 */

import { useEffect, useRef, useState } from 'react'
import { cargarVoz, estaIniciado, inicializarMotor, type Backend } from '../data/motor-tts'

export type EstadoMotor = 'inactivo' | 'preparando' | 'listo' | 'error'

type Opciones = {
  alMensaje: (mensaje: string) => void
  alBackend: (backend: Backend) => void
}

const MB = 1024 * 1024

export function useMotor({ alMensaje, alBackend }: Opciones): {
  estado: EstadoMotor
  preparar: (voz: string) => Promise<void>
} {
  const [estado, setEstado] = useState<EstadoMotor>('inactivo')

  // Ref con los callbacks más recientes: la carga sobrevive a re-renders y no
  // queremos que un mensaje tardío use una versión vieja de `anunciar`.
  const mensaje = useRef(alMensaje)
  const backend = useRef(alBackend)
  useEffect(() => {
    mensaje.current = alMensaje
    backend.current = alBackend
  }, [alMensaje, alBackend])

  const inicializando = useRef<Promise<void> | null>(null)
  const vozCargada = useRef<string | null>(null)
  const vozEnCurso = useRef<Promise<void> | null>(null)

  function iniciar(): Promise<void> {
    if (inicializando.current) return inicializando.current

    setEstado('preparando')
    mensaje.current('Cargando modelos…')

    // Sin WebGPU a propósito: en GPU móvil ORT devuelve audio corrupto.
    // Ver el comentario de inicializarMotor() en data/motor-tts.ts.
    const promesa = inicializarMotor({
      alModelo: (nombre, i, total) => mensaje.current(`Cargando modelos ${i}/${total}: ${nombre}`),
      alProgreso: (p) => {
        if (p.desdeCache) {
          mensaje.current(`Modelo en caché: ${p.archivo}`)
          return
        }
        const porcentaje = p.total ? Math.round((p.cargado / p.total) * 100) : 0
        mensaje.current(
          `Descargando ${p.archivo} ${porcentaje}% (${(p.cargado / MB).toFixed(1)} MB)`,
        )
      },
    }).then(({ backend: real }) => {
      backend.current(real)
    })

    const conManejo = promesa.catch((error) => {
      // Un fallo (red, OOM) no envenena la visita: se limpia para reintentar.
      inicializando.current = null
      setEstado('error')
      throw error
    })

    inicializando.current = conManejo
    return conManejo
  }

  async function asegurarVoz(voz: string): Promise<void> {
    // El worker tiene un único estilo de voz: dos cargas concurrentes dejarían
    // el que termine último, que no tiene por qué ser el pedido. Se serializan.
    if (vozEnCurso.current) await vozEnCurso.current.catch(() => {})
    if (vozCargada.current === voz) return

    mensaje.current(`Cargando voz ${voz}…`)
    const promesa = cargarVoz({
      voz,
      alProgreso: (p) =>
        mensaje.current(p.desdeCache ? `Voz ${voz} en caché` : `Descargando voz ${voz}…`),
    }).then(() => {
      vozCargada.current = voz
    })

    vozEnCurso.current = promesa
    try {
      await promesa
    } finally {
      if (vozEnCurso.current === promesa) vozEnCurso.current = null
    }
  }

  /**
   * Prepara motor y voz. Si el motor ya estaba listo sólo verifica la voz, y si
   * la voz elegida cambió (por ejemplo durante la precarga) la recarga.
   */
  async function preparar(voz: string): Promise<void> {
    try {
      await iniciar()
      await asegurarVoz(voz)
      setEstado('listo')
      mensaje.current('Modelos listos.')
    } catch (error) {
      setEstado(estaIniciado() ? 'listo' : 'error')
      throw error
    }
  }

  return { estado, preparar }
}
