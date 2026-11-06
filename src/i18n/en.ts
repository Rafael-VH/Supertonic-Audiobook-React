import type { Clave } from './es'

/** Diccionario inglés. El tipo obliga a traducir todas las claves de `es`. */
export const en: Record<Clave, string> = {
  // Header and theme
  'tema.aClaro': 'Switch to light mode',
  'tema.aOscuro': 'Switch to dark mode',
  'tema.claro': 'Light mode',
  'tema.oscuro': 'Dark mode',

  intro:
    'Turn a Markdown file into audio. Everything runs in your browser: the text is never uploaded to a server.',

  // File zone
  'zona.soltar': 'Drop the file',
  'zona.cambiar': 'Change file',
  'zona.arrastrar': 'Drag your .md file here',
  'zona.arrastrarOtro': 'drag another one or click to choose it',
  'zona.elegir': 'or click to choose it',

  // Metadata
  'chip.caracteres': '{n} characters',
  'chip.segmento': '{n} segment',
  'chip.segmentos': '{n} segments',
  'chip.minutos': '~{n} min of audio',
  'aviso.largo':
    'Long text: on WASM this can take much longer than real time. Try a single chapter first.',
  'texto.ver': 'View and edit the cleaned text',

  // Settings
  'ajustes.titulo': 'Settings',
  'ajustes.voz': 'Voice',
  'ajustes.idiomaVoz': 'Voice language',
  'ajustes.pasos': 'Steps',
  'ajustes.velocidad': 'Speed',
  'ajustes.formato': 'Format',
  'ajustes.idiomaInterfaz': 'Interface language',
  'ajustes.nota':
    'More steps mean better quality in exchange for more time. The text is split into fragments of up to {max} characters. MP3, OGG and FLAC need an extra encoder; today the output is WAV.',

  // Actions and progress
  'acciones.convirtiendo': 'Converting…',
  'acciones.generar': 'Generate audio',
  'acciones.cancelar': 'Cancel',
  'acciones.preparando': 'preparing models…',
  'progreso.calculando': 'Calculating the remaining time…',
  'progreso.faltan': 'About {tiempo} left',

  // Result
  'resultado.titulo': 'Result',
  'resultado.descargar': 'Download {archivo}.wav',
  'resultado.detalle': '{segundos} s of audio in {tiempo} s · RTF {rtf} · {tamano} MB',
  'resultado.parcial': 'Partial audio ({hechos} of {total} segments) · {detalle}',

  // UI state and errors
  'estado.sinArchivo': 'You have not chosen a file yet.',
  'estado.listoParaConvertir': '“{nombre}” is ready to convert.',
  'estado.cancelando': 'Cancelling after the current segment…',
  'error.extension': '“{nombre}” is not a .md file.',
  'error.sinTexto': '“{nombre}” has no text after cleaning the Markdown.',
  'error.precarga': 'The models could not be prepared; it will retry when you generate.',
  'error.generico': 'Error: {mensaje}',

  // Orchestrator messages
  'motor.sinTexto': 'There is no text to synthesize.',
  'motor.preparando': 'Preparing engine…',
  'motor.sintetizando': 'Synthesizing segment {n} of {total}…',
  'motor.paso': 'Segment {n} of {total} — step {hecho}/{pasos}',
  'motor.log': 'Segment {n} of {total}: {audio} s of audio, {ms} ms compute, RTF {rtf}, ~{mb} MB',
  'motor.canceladoSinAudio': 'Cancelled. No audio was generated.',
  'motor.canceladoParcial':
    'Cancelled after {hechos} of {total} segments. Partial audio generated.',
  'motor.listo': 'Done.',
  'motor.cancelado': 'Cancelled.',

  // Engine loading messages
  'carga.iniciando': 'Loading models…',
  'carga.modelo': 'Loading models {i}/{total}: {nombre}',
  'carga.modeloCache': 'Model in cache: {archivo}',
  'carga.descargando': 'Downloading {archivo} {pct}% ({mb} MB)',
  'carga.voz': 'Loading voice {voz}…',
  'carga.vozCache': 'Voice {voz} in cache',
  'carga.vozDescargando': 'Downloading voice {voz}…',
  'carga.lista': 'Models ready.',

  // Formats
  'formato.proximamente': 'coming soon',

  // About
  'acerca.titulo': 'About',
  'acerca.cerrar': 'Close',
  'acerca.version': 'Version {version}',
  'acerca.codigo': 'This application code: MIT license.',
  'acerca.modelo': 'Supertonic 3 model, by Supertone Inc.: OpenRAIL-M license.',
  'acerca.pesos': 'The weights are downloaded from Hugging Face and are not included in this repository.',
  'acerca.helper': 'Vendor helper.js (supertonic): MIT license.',
  'acerca.ort': 'ONNX Runtime Web: MIT license.',
  'acerca.coi': 'coi-serviceworker: MIT license.',
  'acerca.repoVendor': 'Vendor repository',
  'acerca.huggingFace': 'Hugging Face',

  // Voice language names
  'idioma.es': 'Spanish',
  'idioma.en': 'English',
  'idioma.pt': 'Portuguese',
  'idioma.fr': 'French',
  'idioma.it': 'Italian',
  'idioma.de': 'German',
  'idioma.nl': 'Dutch',
  'idioma.sv': 'Swedish',
  'idioma.da': 'Danish',
  'idioma.fi': 'Finnish',
  'idioma.et': 'Estonian',
  'idioma.lv': 'Latvian',
  'idioma.lt': 'Lithuanian',
  'idioma.pl': 'Polish',
  'idioma.cs': 'Czech',
  'idioma.sk': 'Slovak',
  'idioma.sl': 'Slovenian',
  'idioma.hr': 'Croatian',
  'idioma.hu': 'Hungarian',
  'idioma.ro': 'Romanian',
  'idioma.bg': 'Bulgarian',
  'idioma.el': 'Greek',
  'idioma.ru': 'Russian',
  'idioma.uk': 'Ukrainian',
  'idioma.tr': 'Turkish',
  'idioma.ar': 'Arabic',
  'idioma.hi': 'Hindi',
  'idioma.ko': 'Korean',
  'idioma.ja': 'Japanese',
  'idioma.vi': 'Vietnamese',
  'idioma.id': 'Indonesian',
  'idioma.na': 'Automatic',
}
