/**
 * Traducción de la interfaz.
 *
 * `crearTraductor(idioma)` devuelve la misma firma que consumen la UI, el
 * orquestador y el hook del motor: `t(clave, params)`. Los marcadores `{x}` de
 * la plantilla se reemplazan con `params`; uno ausente queda visible para que
 * el error salte en la revisión y no en producción.
 */

import { en } from './en'
import { es, type Clave } from './es'
import type { IdiomaInterfaz } from '../data/ajustes'

export type { Clave }

export type Parametros = Record<string, string | number>

export type Traductor = (clave: Clave, parametros?: Parametros) => string

const DICCIONARIOS: Record<IdiomaInterfaz, Record<Clave, string>> = { es, en }

export function crearTraductor(idioma: IdiomaInterfaz): Traductor {
  const diccionario = DICCIONARIOS[idioma]

  return (clave, parametros) => {
    const plantilla = diccionario[clave]
    if (!parametros) return plantilla

    return plantilla.replace(/\{(\w+)\}/g, (marcador, nombre: string) => {
      const valor = parametros[nombre]
      return valor === undefined ? marcador : String(valor)
    })
  }
}
