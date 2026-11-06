/**
 * Diccionario español. Es la fuente de las claves: `Clave` sale de acá y `en`
 * se declara como `Record<Clave, string>`, así que una traducción faltante
 * rompe `tsc` en vez de mostrar una clave en la UI.
 *
 * Los marcadores entre llaves (`{nombre}`) se reemplazan en `crearTraductor`.
 */
export const es = {
  // Cabecera y tema
  'tema.aClaro': 'Cambiar a modo claro',
  'tema.aOscuro': 'Cambiar a modo oscuro',
  'tema.claro': 'Modo claro',
  'tema.oscuro': 'Modo oscuro',

  intro:
    'Convertí un archivo Markdown en audio. Todo el procesamiento ocurre en tu navegador: el texto no se sube a ningún servidor.',

  // Zona de archivo
  'zona.soltar': 'Soltá el archivo',
  'zona.cambiar': 'Cambiar archivo',
  'zona.arrastrar': 'Arrastrá tu archivo .md acá',
  'zona.arrastrarOtro': 'arrastrá otro o hacé clic para elegirlo',
  'zona.elegir': 'o hacé clic para elegirlo',

  // Metadatos
  'chip.caracteres': '{n} caracteres',
  'chip.segmento': '{n} segmento',
  'chip.segmentos': '{n} segmentos',
  'chip.minutos': '~{n} min de audio',
  'aviso.largo':
    'Texto largo: en WASM puede tardar bastante más que el tiempo real. Probá primero con un capítulo.',
  'texto.ver': 'Ver y editar el texto limpio',

  // Ajustes
  'ajustes.titulo': 'Ajustes',
  'ajustes.voz': 'Voz',
  'ajustes.idiomaVoz': 'Idioma de la voz',
  'ajustes.pasos': 'Pasos',
  'ajustes.velocidad': 'Velocidad',
  'ajustes.formato': 'Formato',
  'ajustes.idiomaInterfaz': 'Idioma de la interfaz',
  'ajustes.nota':
    'Más pasos dan mejor calidad a cambio de más tiempo. El texto se corta en fragmentos de hasta {max} caracteres. MP3, OGG y FLAC requieren un codificador extra; hoy se entrega WAV.',

  // Acciones y progreso
  'acciones.convirtiendo': 'Convirtiendo…',
  'acciones.generar': 'Generar audio',
  'acciones.cancelar': 'Cancelar',
  'acciones.preparando': 'preparando modelos…',
  'progreso.calculando': 'Calculando el tiempo restante…',
  'progreso.faltan': 'Faltan ≈ {tiempo}',

  // Resultado
  'resultado.titulo': 'Resultado',
  'resultado.descargar': 'Descargar {archivo}.wav',
  'resultado.detalle': '{segundos} s de audio en {tiempo} s · RTF {rtf} · {tamano} MB',
  'resultado.parcial': 'Audio parcial ({hechos} de {total} segmentos) · {detalle}',

  // Estado y errores de la UI
  'estado.sinArchivo': 'Todavía no elegiste ningún archivo.',
  'estado.listoParaConvertir': '«{nombre}» listo para convertir.',
  'estado.cancelando': 'Cancelando al terminar el segmento en curso…',
  'error.extension': '«{nombre}» no es un archivo .md.',
  'error.sinTexto': '«{nombre}» no tiene texto después de limpiar el Markdown.',
  'error.precarga': 'No se pudieron preparar los modelos; se reintenta al generar.',
  'error.generico': 'Error: {mensaje}',

  // Mensajes del orquestador
  'motor.sinTexto': 'No hay texto para sintetizar.',
  'motor.preparando': 'Preparando motor…',
  'motor.sintetizando': 'Sintetizando segmento {n} de {total}…',
  'motor.paso': 'Segmento {n} de {total} — paso {hecho}/{pasos}',
  'motor.log':
    'Segmento {n} de {total}: {audio} s de audio, {ms} ms cómputo, RTF {rtf}, ~{mb} MB',
  'motor.canceladoSinAudio': 'Cancelado. No se generó audio.',
  'motor.canceladoParcial':
    'Cancelado tras {hechos} de {total} segmentos. Audio parcial generado.',
  'motor.listo': 'Listo.',
  'motor.cancelado': 'Cancelado.',

  // Mensajes de carga del motor
  'carga.iniciando': 'Cargando modelos…',
  'carga.modelo': 'Cargando modelos {i}/{total}: {nombre}',
  'carga.modeloCache': 'Modelo en caché: {archivo}',
  'carga.descargando': 'Descargando {archivo} {pct}% ({mb} MB)',
  'carga.voz': 'Cargando voz {voz}…',
  'carga.vozCache': 'Voz {voz} en caché',
  'carga.vozDescargando': 'Descargando voz {voz}…',
  'carga.lista': 'Modelos listos.',

  // Formatos
  'formato.proximamente': 'próximamente',

  // Acerca de
  'acerca.titulo': 'Acerca de',
  'acerca.cerrar': 'Cerrar',
  'acerca.version': 'Versión {version}',
  'acerca.codigo': 'Código de esta aplicación: licencia MIT.',
  'acerca.modelo': 'Modelo Supertonic 3, de Supertone Inc.: licencia OpenRAIL-M.',
  'acerca.pesos':
    'Los pesos se descargan desde Hugging Face y no se incluyen en este repositorio.',
  'acerca.helper': 'helper.js del vendor (supertonic): licencia MIT.',
  'acerca.ort': 'ONNX Runtime Web: licencia MIT.',
  'acerca.coi': 'coi-serviceworker: licencia MIT.',
  'acerca.repoVendor': 'Repositorio del vendor',
  'acerca.huggingFace': 'Hugging Face',

  // Nombres de los idiomas de la voz
  'idioma.es': 'Español',
  'idioma.en': 'Inglés',
  'idioma.pt': 'Portugués',
  'idioma.fr': 'Francés',
  'idioma.it': 'Italiano',
  'idioma.de': 'Alemán',
  'idioma.nl': 'Neerlandés',
  'idioma.sv': 'Sueco',
  'idioma.da': 'Danés',
  'idioma.fi': 'Finés',
  'idioma.et': 'Estonio',
  'idioma.lv': 'Letón',
  'idioma.lt': 'Lituano',
  'idioma.pl': 'Polaco',
  'idioma.cs': 'Checo',
  'idioma.sk': 'Eslovaco',
  'idioma.sl': 'Esloveno',
  'idioma.hr': 'Croata',
  'idioma.hu': 'Húngaro',
  'idioma.ro': 'Rumano',
  'idioma.bg': 'Búlgaro',
  'idioma.el': 'Griego',
  'idioma.ru': 'Ruso',
  'idioma.uk': 'Ucraniano',
  'idioma.tr': 'Turco',
  'idioma.ar': 'Árabe',
  'idioma.hi': 'Hindi',
  'idioma.ko': 'Coreano',
  'idioma.ja': 'Japonés',
  'idioma.vi': 'Vietnamita',
  'idioma.id': 'Indonesio',
  'idioma.na': 'Automático',
} as const

export type Clave = keyof typeof es
