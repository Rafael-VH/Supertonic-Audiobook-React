# Funcionalidades

Registro de todo lo que hace hoy la app y de lo que está planificado. Cada fila dice qué hace la funcionalidad y dónde vive en el código.

**Leyenda:** ✅ implementada · 🟡 parcial · ⬜ planificada

> Fuente de verdad del estado por fase: [plan §0](plan-port-react.md#0-estado-de-implementación-2026-10-24). Prioridad de lo que sigue: [plan §12](plan-port-react.md#12-plan-de-mejoras-2026-10-24). Este archivo es el catálogo; el plan explica el porqué.

## Entrada de archivos

| Estado | Funcionalidad | Qué hace | Dónde |
|---|---|---|---|
| ✅ | Elegir un archivo | Abre el selector del sistema y acepta `.md`, `.markdown` y `.txt` (`accept` + validación por regex). | `App.tsx` (`alElegirArchivo`) |
| ✅ | Arrastrar y soltar | Detecta `dragover`/`drop`, resalta la zona y toma el primer archivo soltado. | `App.tsx` (`alSoltar`) |
| ✅ | Validar el archivo | Rechaza extensiones que no correspondan y avisa si el texto queda vacío después de limpiar el Markdown. | `App.tsx` (`procesarArchivo`) |
| ✅ | Un archivo por vez | Cargar otro archivo reemplaza el anterior y libera el audio generado de la sesión previa. | `App.tsx` |
| ✅ | Reemplazar el archivo | La zona de carga se compacta y pasa a decir *Cambiar archivo*, siempre que no haya una generación en curso. | `App.tsx`, `index.css` |
| ✅ | Bloquear la entrada mientras genera | El `input` y los ajustes quedan deshabilitados durante la síntesis. | `App.tsx` |

## Texto y metadatos

| Estado | Funcionalidad | Qué hace | Dónde |
|---|---|---|---|
| ✅ | Limpiar Markdown | Quita bloques y código inline, títulos, negritas, cursivas, enlaces, imágenes, citas, reglas horizontales y viñetas; normaliza líneas en blanco. Respeta operadores (`2 * 3`, `5 > 3`) y `snake_case`. | `domain/limpiar-markdown.ts` |
| ✅ | Segmentar el texto | Corta en fragmentos de hasta 1500 caracteres, fusiona párrafos de menos de 200 y divide por oraciones respetando abreviaturas (`Dr.`, `Sr.`, `etc.`). | `domain/segmentar-texto.ts` |
| ✅ | Editar el texto limpio | Un desplegable con `textarea` permite corregir el resultado antes de generar; los metadatos se recalculan al escribir. | `App.tsx` |
| ✅ | Metadatos del archivo | Muestra nombre, cantidad de caracteres, cantidad de segmentos y duración estimada del audio (~900 caracteres por minuto). | `App.tsx` |
| ✅ | Aviso de texto largo | Por encima de 50 000 caracteres avisa que en WASM puede tardar mucho más que el tiempo real. | `App.tsx` (`AVISO_CARACTERES`) |

## Ajustes de síntesis

| Estado | Funcionalidad | Qué hace | Dónde |
|---|---|---|---|
| ✅ | Voz | Elige entre 10 voces preentrenadas: M1–M5 (masculinas) y F1–F5 (femeninas). Al cambiar la voz, se recarga su estilo antes de sintetizar. | `data/ajustes.ts`, `data/motor-tts.ts` |
| ✅ | Idioma | 31 idiomas más *Automático*, con los mismos códigos que acepta el modelo. | `data/ajustes.ts` (`IDIOMAS`) |
| ✅ | Pasos de inferencia | Slider de 5 a 12, paso 1. Más pasos, más calidad y más tiempo; el valor por defecto es 5. | `App.tsx`, `data/ajustes.ts` |
| ✅ | Velocidad | Slider de 0,7× a 2× en incrementos de 0,05; por defecto 1,1×. | `App.tsx`, `data/ajustes.ts` |
| ✅ | Persistir ajustes | Guarda voz, idioma, pasos, velocidad y tema como JSON en `localStorage` (`supertonic.ajustes`), normalizando cada campo al leer. | `data/ajustes.ts` |
| ✅ | Panel contextual | La tarjeta de ajustes no se muestra hasta que hay un archivo cargado; entonces aparece al lado del texto. | `App.tsx` |
| ✅ | Disposición adaptable | Con archivo, texto y ajustes van en dos columnas (por encima de 820 px de ancho) y se apilan en pantallas angostas. | `index.css` (`.paneles.dos-columnas`) |
| ✅ | Tema claro/oscuro | Alterna con un botón, respeta `prefers-color-scheme` si no hay preferencia guardada y se aplica antes del primer pintado. | `App.tsx`, `data/ajustes.ts`, `index.css` |

## Generación y salida

| Estado | Funcionalidad | Qué hace | Dónde |
|---|---|---|---|
| ✅ | Generar audio | Valida que haya texto, segmenta, prepara el motor y sintetiza segmento por segmento. | `App.tsx` (`generar`) |
| ✅ | Progreso | Barra con porcentaje que combina segmento actual y paso de denoising, con `role="progressbar"`. | `App.tsx`, `index.css` |
| ✅ | Estado en vivo | Línea `aria-live` con el paso, la descarga, la cancelación, el error o el resultado. | `App.tsx` |
| ✅ | Cancelar | Corta antes del siguiente segmento sin destruir el motor e informa cuántos segmentos se completaron. | `App.tsx` (`pedirCancelacion`) |
| ✅ | Reproductor | Al terminar aparece un `<audio controls>` con el WAV generado (Blob). | `App.tsx` |
| ✅ | Descarga del WAV | Descarga un archivo `<nombre>.wav` con el nombre del original. | `App.tsx` |
| ✅ | Detalle del resultado | Muestra duración del audio, tiempo total, RTF y tamaño del WAV. | `App.tsx` |
| ✅ | Backend visible | Chip con el backend activo (`wasm`), útil para diagnosticar rendimiento. | `App.tsx` |
| ✅ | WAV PCM16 | Concatena los segmentos y codifica mono a 44,1 kHz, 16 bits, en el hilo principal. | `data/wav.ts` |

## Motor, modelos y rendimiento

| Estado | Funcionalidad | Qué hace | Dónde |
|---|---|---|---|
| ✅ | Descarga de pesos con progreso | Baja los 4 ONNX y los JSON desde Hugging Face mostrando archivo, porcentaje y MB descargados. | `data/cache-modelos.ts` |
| ✅ | Caché persistente | Guarda los pesos en Cache Storage (`supertonic-modelos-v1`) bajo la URL estable: recargar no vuelve a descargar. | `data/cache-modelos.ts` |
| ✅ | Descarga sin bufferizar | Usa `response.body.tee()` + `cache.put` para no materializar los 256 MB del ONNX grande en memoria. | `data/cache-modelos.ts` |
| ✅ | Inicialización única por visita | `inicializarMotor()` reutiliza la misma promesa: no se re-verifica el modelo dentro de la pestaña, ni siquiera tras cancelar. | `data/motor-tts.ts` |
| ✅ | Voz a demanda | Carga el JSON de la voz elegida y lo mantiene mientras no cambie el ajuste. | `data/motor-tts.ts`, `workers/tts.worker.ts` |
| ✅ | Inferencia en Web Worker | El motor corre fuera del hilo de UI: la pestaña no se congela y el progreso se pinta en vivo. | `workers/tts.worker.ts` |
| ✅ | WASM multihilo | Con `crossOriginIsolated` usa hasta 4 hilos; si no hay aislamiento, cae a 1 sin fallar. | `workers/tts.worker.ts` |
| ✅ | Aislamiento en hosts sin cabeceras | `coi-serviceworker` inyecta COOP/COEP en GitHub Pages para habilitar `SharedArrayBuffer`. | `public/coi-serviceworker.js`, `index.html` |
| ✅ | Protocolo por mensajes | `init`, `voz` y `sintetizar` con eventos de modelo, descarga, paso y resultado transferido. | `data/motor-tts.ts`, `workers/tts.worker.ts` |

## Distribución y calidad

| Estado | Funcionalidad | Qué hace | Dónde |
|---|---|---|---|
| ✅ | Build con typecheck | `tsc --noEmit` + Vite; emite `dist/` de ~28 MB sin el WASM duplicado. | `package.json`, `vite.config.ts` |
| ✅ | Deploy automático | Push a `main` construye y publica en GitHub Pages. | `.github/workflows/deploy.yml` |
| ✅ | Tests unitarios | 39 tests de dominio y adaptadores con Vitest. | `tests/` |
| ✅ | Favicon sin 404 | Icono inline como data URI, sin archivo binario extra. | `index.html` |

## Próximas funcionalidades

Ordenadas por relación valor/riesgo. Las que llevan \* no están en [plan §12](plan-port-react.md#12-plan-de-mejoras-2026-10-24): salen de la paridad con la app de escritorio o de huecos detectados en el código.

| Estado | Funcionalidad | Qué hará | Prioridad |
|---|---|---|---|
| ⬜ | Precarga del motor | Arrancar la descarga y la preparación al elegir el archivo, para que la espera se solape con los ajustes en vez de empezar al tocar *Generar*. | Alta |
| ⬜ | ETA de cómputo | Estimar la espera (`duración del audio × RTF`) y mostrarla antes y durante la generación, no sólo la duración del audio. | Alta |
| ⬜ | Log de síntesis | Reemplazar la línea de estado por un registro con niveles, autoscroll y tope de líneas, como el de la app de escritorio. | Alta |
| ⬜ | Orquestador en el dominio | Extraer el flujo de `App.tsx` a `domain/procesar-archivo.ts` con dobles, para poder testearlo. | Media |
| ⬜ | Tests de UI | Cubrir selección de archivo, cambio de idioma y aparición de los ajustes con `@testing-library/react`. | Media |
| ⬜ | Selector de formatos | Mostrar WAV activo y MP3/OGG/FLAC deshabilitados con *próximamente*, como promete el plan. | Media |
| ⬜ | i18n ES/EN | Interfaz bilingüe con las mismas claves que la app de escritorio. | Media |
| ⬜ | Acerca de | Versión, créditos y licencias (MIT del código, OpenRAIL-M de los pesos) accesibles desde la UI. | Media |
| ⬜ | Cancelar con audio parcial | Ofrecer el WAV de los segmentos ya completados al cancelar, como hace el desktop. | Media |
| ⬜ | Muestra de voz\* | Botón *Escuchar* que sintetiza y reproduce una frase corta con la voz y el idioma elegidos. | Media |
| ⬜ | Panel de modelos\* | Ver qué archivos están en caché, cuánto ocupan y borrarlos desde la UI (`listarCache()` y `borrarCache()` ya existen). | Baja |
| ⬜ | Temas neumo/skeuo | Variantes visuales sobre el tema Material actual mediante variables CSS por `data-estilo`. | Baja |
| ⬜ | Paneles separados\* | Replicar las pestañas de entrada y de síntesis/registro del desktop. | Baja |

## Fuera de alcance

Decisiones tomadas, no pendientes:

- **Varios archivos o una carpeta entera**: la web trabaja con un archivo por vez, a diferencia del desktop.
- **MP3/OGG/FLAC**: requieren encoders WASM extra; el MVP entrega WAV.
- **Backend de síntesis**: el objetivo es que nada salga del navegador.
- **PWA instalable u offline**: el único service worker es `coi-serviceworker`, que sólo aporta las cabeceras de aislamiento.
- **Auto-hospedar los ~400 MB**: los límites de GitHub y la banda de Pages lo hacen inviable; los pesos se bajan de Hugging Face.
- **WebGPU activo**: el EP de ONNX Runtime 1.30 produce audio corrupto en GPUs móviles; queda apagado hasta validarlo en hardware real.
- **Pesos cuantizados**: no hay variantes int8 publicadas y cuantizar por cuenta propia es un proyecto aparte.

## Cómo mantener este archivo

Al agregar o cambiar una funcionalidad, actualizá su fila en el mismo cambio: estado, descripción y archivo. Si la funcionalidad viene del plan, enlazá la sección correspondiente en vez de duplicar el diseño. Si se descarta algo, movelo a *Fuera de alcance* con el motivo, en lugar de borrarlo.
