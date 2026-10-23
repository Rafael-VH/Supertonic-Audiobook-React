/**
 * Ajustes de síntesis: valores válidos, defaults y persistencia en localStorage.
 *
 * Los valores del desktop (docs/plan-port-react.md §2.3) son la referencia:
 * 5 pasos, velocidad 1.1, voz M1.
 */

export type Tema = 'claro' | 'oscuro'

export type Ajustes = {
  voz: string
  lang: string
  pasos: number
  velocidad: number
  tema: Tema
}

/** Sólo lo que necesitamos de localStorage; así los tests no necesitan DOM. */
export type Almacen = {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
}

export const VOCES = ['M1', 'M2', 'M3', 'M4', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5'] as const

/** Idiomas que acepta `helper.js` (`AVAILABLE_LANGS`), con nombre legible. */
export const IDIOMAS: ReadonlyArray<readonly [codigo: string, nombre: string]> = [
  ['es', 'Español'],
  ['en', 'Inglés'],
  ['pt', 'Portugués'],
  ['fr', 'Francés'],
  ['it', 'Italiano'],
  ['de', 'Alemán'],
  ['nl', 'Neerlandés'],
  ['sv', 'Sueco'],
  ['da', 'Danés'],
  ['fi', 'Finés'],
  ['et', 'Estonio'],
  ['lv', 'Letón'],
  ['lt', 'Lituano'],
  ['pl', 'Polaco'],
  ['cs', 'Checo'],
  ['sk', 'Eslovaco'],
  ['sl', 'Esloveno'],
  ['hr', 'Croata'],
  ['hu', 'Húngaro'],
  ['ro', 'Rumano'],
  ['bg', 'Búlgaro'],
  ['el', 'Griego'],
  ['ru', 'Ruso'],
  ['uk', 'Ucraniano'],
  ['tr', 'Turco'],
  ['ar', 'Árabe'],
  ['hi', 'Hindi'],
  ['ko', 'Coreano'],
  ['ja', 'Japonés'],
  ['vi', 'Vietnamita'],
  ['id', 'Indonesio'],
  ['na', 'Automático'],
]

export const PASOS_MIN = 5
export const PASOS_MAX = 12
export const VELOCIDAD_MIN = 0.7
export const VELOCIDAD_MAX = 2

export const AJUSTES_DEFECTO: Ajustes = {
  voz: 'M1',
  lang: 'es',
  pasos: 5,
  velocidad: 1.1,
  tema: 'claro',
}

/** Preferencia del sistema; en un entorno sin `matchMedia` (tests) es 'claro'. */
export function temaDelSistema(): Tema {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
  } catch {
    return 'claro'
  }
}

export const CLAVE_AJUSTES = 'supertonic.ajustes'

function acotar(valor: unknown, minimo: number, maximo: number, defecto: number): number {
  const numero = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(numero)) return defecto
  return Math.min(maximo, Math.max(minimo, numero))
}

/**
 * Lee los ajustes guardados, campo por campo. localStorage es entrada externa:
 * puede tener basura, valores viejos o tipos raros, así que nada se confía.
 */
export function normalizarAjustes(bruto: unknown): Ajustes {
  const datos = (typeof bruto === 'object' && bruto !== null ? bruto : {}) as Partial<Ajustes>

  return {
    voz: VOCES.includes(datos.voz as (typeof VOCES)[number]) ? datos.voz! : AJUSTES_DEFECTO.voz,
    lang: IDIOMAS.some(([codigo]) => codigo === datos.lang) ? datos.lang! : AJUSTES_DEFECTO.lang,
    pasos: Math.round(acotar(datos.pasos, PASOS_MIN, PASOS_MAX, AJUSTES_DEFECTO.pasos)),
    velocidad: acotar(datos.velocidad, VELOCIDAD_MIN, VELOCIDAD_MAX, AJUSTES_DEFECTO.velocidad),
    tema: datos.tema === 'oscuro' || datos.tema === 'claro' ? datos.tema : AJUSTES_DEFECTO.tema,
  }
}

export function cargarAjustes(almacen?: Almacen): Ajustes {
  const destino = almacen ?? globalThis.localStorage
  if (!destino) return { ...AJUSTES_DEFECTO }

  try {
    const texto = destino.getItem(CLAVE_AJUSTES)
    if (!texto) return { ...AJUSTES_DEFECTO, tema: temaDelSistema() }
    return normalizarAjustes(JSON.parse(texto))
  } catch {
    return { ...AJUSTES_DEFECTO }
  }
}

export function guardarAjustes(ajustes: Ajustes, almacen?: Almacen): void {
  const destino = almacen ?? globalThis.localStorage
  if (!destino) return

  try {
    destino.setItem(CLAVE_AJUSTES, JSON.stringify(normalizarAjustes(ajustes)))
  } catch {
    // Modo privado o cuota llena: perder la preferencia no rompe nada.
  }
}
