/**
 * Acerca de: versión, licencias y créditos en un `<dialog>` nativo.
 *
 * La versión llega por `define` desde `vite.config.ts`; en los tests la
 * constante no existe y el guardia deja `0.0.0`.
 */

import { useEffect, useRef } from 'react'
import type { Traductor } from '../i18n/traductor'

declare const __APP_VERSION__: string

const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

const REPO_VENDOR = 'https://github.com/supertone-oss-archive/supertonic'
const HUGGING_FACE = 'https://huggingface.co/Supertone/supertonic-3'

type Props = {
  abierto: boolean
  alCerrar: () => void
  t: Traductor
}

export function AcercaDe({ abierto, alCerrar, t }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const cerrar = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const elemento = dialogo.current
    if (!elemento) return

    // `showModal` no existe en jsdom: ahí abrimos el diálogo sin modal para
    // que el contenido sea visible en los tests. En el navegador siempre hay
    // `showModal` y el diálogo queda modal, con backdrop y foco atrapado.
    if (!elemento.open) {
      if (typeof elemento.showModal === 'function') elemento.showModal()
      else elemento.open = true
    }
    cerrar.current?.focus()
  }, [abierto])

  if (!abierto) return null

  return (
    <dialog
      ref={dialogo}
      className="acerca"
      aria-labelledby="acerca-titulo"
      onCancel={(evento) => {
        evento.preventDefault()
        alCerrar()
      }}
      onClick={(evento) => {
        // Clic en el fondo: el evento nace en el propio <dialog>.
        if (evento.target === evento.currentTarget) alCerrar()
      }}
    >
      <div className="acerca-cabecera">
        <h2 id="acerca-titulo">{t('acerca.titulo')}</h2>
        <button type="button" className="fantasma" onClick={alCerrar} ref={cerrar}>
          {t('acerca.cerrar')}
        </button>
      </div>

      <p className="acerca-version">{t('acerca.version', { version: VERSION })}</p>

      <ul className="acerca-creditos">
        <li>{t('acerca.codigo')}</li>
        <li>
          {t('acerca.modelo')}{' '}
          <a href={HUGGING_FACE} target="_blank" rel="noreferrer">
            {t('acerca.huggingFace')}
          </a>
        </li>
        <li>
          {t('acerca.helper')}{' '}
          <a href={REPO_VENDOR} target="_blank" rel="noreferrer">
            {t('acerca.repoVendor')}
          </a>
        </li>
        <li>{t('acerca.ort')}</li>
        <li>{t('acerca.coi')}</li>
      </ul>

      <p className="acerca-nota">{t('acerca.pesos')}</p>
    </dialog>
  )
}
