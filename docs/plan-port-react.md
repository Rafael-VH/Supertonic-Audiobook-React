# Plan de port a React (web) — Supertonic-AudioBook

> Auditoría del proyecto de escritorio + plan paso a paso para llevar la app a una **web app React** con inferencia TTS en el navegador (WebGPU, fallback WASM).
>
> Fecha: 2026-10-21. Revisado y corregido el 2026-10-22 con una ejecución real del motor en navegador (§11).
>
> Todo lo afirmado abajo está verificado contra el código de este repo, contra las APIs reales de Hugging Face / GitHub (salidas citadas en §4 y §5) y contra mediciones reales sobre `onnxruntime-web` (§11). Donde el plan original se equivocaba, la corrección está marcada con **CORREGIDO**.

---

## 1. Resumen ejecutivo

| Pregunta | Respuesta corta |
|---|---|
| ¿Hay que reimplementar el TTS? | **No.** El vendor (Supertone Inc.) ya publicó un port web oficial: `supertone-oss-archive/supertonic/web/`. Su `helper.js` (19 KB) implementa el pipeline completo de Supertonic 3 sobre ONNX Runtime Web, incluido el chunking de texto largo. Se copia y se envuelve en React. **Código MIT; los pesos son Open RAIL-M** (§4.4). |
| ¿Cuál es el trabajo real? | (a) descarga + caché de los pesos, (b) puerto de las reglas de Markdown/segmentación a JS, (c) UI React que replique la de escritorio, (d) deploy en GitHub Pages. |
| ¿Se puede publicar en GitHub Pages? | **Sí, pero los pesos no van en el repo.** `vector_estimator.onnx` pesa 256 MB y GitHub bloquea archivos >100 MB. Los pesos se bajan de Hugging Face en runtime y se cachean en Cache Storage. CORS verificado, incluido `206 Partial Content` (§4.2). |
| ¿Cuánto pesa la primera carga? | **~401 MB** (398,1 MB de ONNX + 2,9 MB de voces + 286 KB de config). Sin caché, la primera vez es una descarga larga. |
| ¿Qué motor de inferencia? | **WebGPU** (Chrome/Edge 113+) cuando existe. Fallback **WASM multihilo** mediante `coi-serviceworker` (§5.3). |
| ¿Qué tan rápido es en CPU? | **Medido**: RTF **1,82** (5 pasos, 4 hilos, i5-2430M de 2011) → 1,8 s de cómputo por segundo de audio. **RTF 0,87** con 2 pasos (calidad robótica). Inviable para audiolibros en hardware viejo; aceptable para documentos cortos. Referencia WebGPU del vendor: RTF ~0,02–0,1 (§11). |
| ¿Hay forma barata de acelerarlo? | **No.** HF **no publica variantes int8/cuantizadas** (§4.3). Las únicas palancas son WebGPU o bajar pasos. |
| ¿Formatos de salida? | WAV resuelto y suficiente. MP3/OGG/FLAC requieren encoders WASM extra → fuera del MVP (§8). |
| ¿Escala el proyecto? | Sí: la arquitectura Clean actual (dominio puro / datos / presentación) se porta 1:1 a `src/domain`, `src/data`, `src/presentation`. Los tests de dominio se portan tal cual (28 tests). |

---

## 2. Auditoría del proyecto actual (desktop)

### 2.1 Estructura y regla de dependencia

Arquitectura limpia de 3 capas, dependencia **siempre hacia adentro**. `app/main.py` es el composition root y es el **único** archivo que puede importar de `data/`.

```
app/
├── main.py                       # composition root: fábricas + flags --cli / --self-test
├── domain/                       # ← no importa nada de data/ ni presentation/
│   ├── entities/archivo.py       # entidad Archivo
│   ├── repositories/             # Protocols (motor_tts.py, exportador_audio.py,
│   │                             #   repositorio_archivos.py, repositorio_preferencias.py)
│   ├── use_cases/
│   │   ├── limpiar_markdown.py   # saneado de Markdown → texto plano
│   │   ├── segmentar_texto.py    # troceado en segmentos hablables
│   │   ├── formato.py            # FORMATOS_NATIVOS / normalizar_formatos
│   │   ├── sintetizar_muestra.py # SintetizarMuestra (preview de voz)
│   │   └── procesar_archivo.py   # ProcesarArchivo: orquestador principal
│   └── constantes.py             # (LANGUAGES_VOZ, VOCES, defaults)
├── data/                         # ← implementaciones concretas de los Protocols
│   ├── config.py                 # rutas, sample rate, formatos, margen de RAM
│   └── repositories/             # MotorSupertonic, ExportadorAudioSoundfile,
│                                 #   RepositorioArchivosLocal, PreferenciasJSONLocal
└── presentation/                 # ← consume solo el dominio
    ├── cli.py                    # argparse + tqdm opcional
    ├── gui.py                    # Tkinter (≈1850 líneas), i18n ES/EN, temas/estilos
    └── self_test.py              # smoke test con síntesis real
```

`docs/architecture.md` (capas), `docs/domain.md` (reglas), `docs/data.md` (implementaciones), `docs/presentation.md` (interfaces), `docs/packaging.md` (empaquetado). `app/SupertonicAudioBook.spec` define el bundle de PyInstaller.

### 2.2 Reglas de negocio a preservar (son el corazón del port)

| Regla | Ubicación | Qué hace | Cómo se porta a web |
|---|---|---|---|
| Saneado de Markdown | `use_cases/limpiar_markdown.py` | Quita títulos, negrita/cursiva, links, imágenes, blockquotes, listas, bloques de código (``` y ~~~), `hr`; normaliza saltos de línea; recorta. **No** toca operadores matemáticos (`*`, `_`, `→`, comparadores) ni `snake_case`. | JS pura, función pura → se porta tal cual, con sus 17 tests. |
| Segmentación | `use_cases/segmentar_texto.py` | `MAX_CHARS_PER_SEGMENT = 1500`, `MERGE_THRESHOLD = 200`, no parte abreviaturas españolas (`_ABREVIATURAS`), divide párrafos largos por oraciones. | JS pura. **Ojo**: el chunker del vendor usa 300 (120 para ko/ja) — ver §7. |
| Orquestación | `use_cases/procesar_archivo.py` | leer → limpiar → segmentar → sintetizar → exportar. Publica **atómicamente** (`os.replace`) y **solo al terminar** el archivo. Flush por memoria (`memoria_safe_margin_bytes`). Cancela entre segmentos exportando lo generado. | TS con `AbortController` + escritura en IndexedDB/opfs. |
| Formatos | `use_cases/formato.py` | `normalizar_formatos` valida y normaliza la lista de formatos. | JS pura. |
| Muestra de voz | `use_cases/sintetizar_muestra.py` | Genera y reproduce una muestra corta con la voz/idioma elegidos. | Playback con Web Audio API. |
| Búsqueda de archivos | `data/repositories/repositorio_archivos.py` | Lista `.md` con **orden natural** (numerados primero, ceros a la izquierda deterministas, no-numerados antes que su numerado). | JS pura sobre `FileList`. |

### 2.3 Constantes y defaults (paridad exacta)

| Constante | Desktop | Web (upstream/vendor) | Nota |
|---|---|---|---|
| Sample rate | `SAMPLE_RATE = 44100` | `cfgs.ae.sample_rate = 44100` ✅ | Idéntico |
| Silencio entre chunks | `SILENCE_DURATION_SECS = 0.6` | `silenceDuration = 0.3` (default de `call`) | **Decidido: 0.6** (paridad con el desktop; se pasa como 6.º argumento de `call()`). |
| Pasos de inferencia | `DEFAULT_TTS_STEPS = 5` (slider 5–12) | README upstream: default 8 | **Decidido: 5 por defecto.** El 8 del vendor cuesta ~60 % más de tiempo de cómputo sin mejora audible que justifique el default. Slider 5–12 se mantiene. |
| Velocidad | `DEFAULT_SPEED = 1.1` (slider 0.7–2.0) | `speed = 1.05` (rango rec. 0.9–1.5) | Decidir (§7) |
| Voz por defecto | `DEFAULT_VOICE = "M1"` | M1 | Igual |
| Idiomas | `LANGUAGES_VOZ` = 31 + `"na"` (32) | `AVAILABLE_LANGS` = 32, **mismos códigos** ✅ | Copiar la tupla tal cual |
| Formatos | wav/flac/ogg/mp3 (`wav`+`mp3` por defecto) | solo WAV | WAV en el MVP |
| Margen de RAM | `MEMORY_SAFE_MARGIN_BYTES = 500 MB` | n/a | En web, el límite es la memoria de la pestaña |

### 2.4 Superficie de UI a replicar en React

De `docs/presentation.md` y `gui.py`:

- **Tabs**: "Entrada y salida" (carpetas + lista de archivos) y "Síntesis y registro" (opciones + log). Responsive: bajo 900 px → tabs; arriba → dos columnas.
- **Carpetas**: origen (entrada) y salida de audio, con botón "Examinar…" → en web: `<input type="file" webkitdirectory>` (carpeta de entrada) + carpeta de salida vía File System Access API o descarga.
- **Lista de archivos**: multi-selección, botones Todo / Nada / Refrescar, contador; vacío = todos.
- **Formatos**: checkboxes WAV/FLAC/OGG/MP3, obliga a elegir ≥1.
- **Voz**: combobox con 10 voces (M1–M5, F1–F5).
- **Idioma de la voz**: combobox con los 32 `LANGUAGES_VOZ` (nativo vs código), persiste.
- **Pasos**: slider 5–12. **Velocidad**: slider 0.7–2.0.
- **Escuchar**: botón `▶` que genera y reproduce una muestra corta (texto de ejemplo por idioma).
- **Procesar / Cancelar**: `▶ Procesar` y `■ Cancelar` (cancela entre segmentos y exporta lo generado).
- **Progreso**: barra + porcentaje + estado ("Archivo {i} de {n}", "{actual}/{total} segmentos sintetizados").
- **Log**: niveles coloreados, con la config al inicio, `▶ N/M` por archivo, progreso por segmento (máx. ~20 líneas/archivo), `✔` fin, errores con traceback y tiempo total.
- **Feedback**: snackbar flotante estilo Material en lugar de diálogos modales.
- **Ajustes** (ventana flotante): Tema (Claro/Oscuro), Estilo (Material/Neumorfismo/Skeuomorfismo), Idioma (ES/EN), Acerca de (versión, licencia MIT, crédito del modelo Supertonic 3 / Supertone Inc. OpenRAIL-M, links a repo/HF/GitHub).
- **Preferencias persistentes**: tema, estilo, idioma, voz, pasos, velocidad, idioma de voz, formatos, carpetas → en web: `localStorage`.
- **i18n**: `TRADUCCIONES` con **~95 claves × 2 idiomas** (es/en). Es un diccionario plano: se porta tal cual.

### 2.5 Tests existentes (28)

| Archivo | Tests | Qué cubre |
|---|---|---|
| `tests/test_limpiar_markdown.py` | 17 | todas las reglas de saneado, incluidos los casos "no tocar" (operadores, `snake_case`, negrita pegada) |
| `tests/test_segmentar_texto.py` | 5 | segmentación, fusión, abreviaturas |
| `tests/test_procesar_archivo.py` | 10 | flush por memoria, publicación atómica, no duplicar audio, no destruir salida previa, cancelación |
| `tests/test_repositorio_archivos.py` | 9 | orden natural, `.md` only, roundtrip de lectura |

Todos son de dominio puro (sin I/O salvo `procesar_archivo`, que usa doubles). **Se portan casi 1:1** a `vitest`.

### 2.6 CLI (no se porta, pero documenta el comportamiento esperado)

`cli.py`: `-a/--archivo`, `-v/--voz`, `--steps`, `--speed`, `-f/--formato`, `-V/--verbose`, `-q/--quiet`. Normaliza formatos, asegura carpetas, y para `--archivo` valida que la ruta resuelta quede **dentro** de `archivos/` (guard anti path-traversal). En web, el equivalente es el `FileList` del navegador: no hay path traversal posible.

---

## 3. Qué se reusa del port oficial del vendor

Fuente: <https://github.com/supertone-oss-archive/supertonic> (`web/`, licencia MIT en el repo raíz).

| Archivo upstream | Tamaño | Qué aporta | Decisión |
|---|---|---|---|
| `web/helper.js` | 19.345 B | Pipeline TTS completo (UnicodeProcessor, Style, TextToSpeech, `loadCfgs`, `loadTextProcessor`, `loadOnnx`, `loadTextToSpeech`, `loadVoiceStyle`, `chunkText`, `writeWavFile`) | **Copiar verbatim** en `src/lib/supertonic/helper.js` con el aviso de licencia del vendor. |
| `web/main.js` | 10.023 B | Demo vanilla (UI + flujo) | Solo como referencia de UX; la UI real se reescribe en React. |
| `web/index.html` + `web/style.css` | 6.452 + 7.843 B | Estilos de la demo | Referencia visual; en React se usan CSS modules / Tailwind a criterio. |
| `web/package.json` | 461 B | `onnxruntime-web ^1.17.0`, `fft.js ^4.0.3`, `vite ^5` | Se adopta `onnxruntime-web` (npm latest: **1.30.0**, MIT). |
| `web/vite.config.js` | 1.126 B | Serve de `assets/` | Se adapta (los assets no serán locales, ver §5). |

### 3.1 API del motor (superficie exacta a usar)

```js
// Carga (una sola vez por sesión)
const { textToSpeech, cfgs } = await loadTextToSpeech(onnxDir, {
  executionProviders: ['webgpu'],   // fallback: ['wasm']
  graphOptimizationLevel: 'all',
}, (nombre, i, total) => setProgresoDescarga(i / total));

// Estilo de voz (JSON pre-extraído del vendor)
const style = await loadVoiceStyle([`${base}/voice_styles/M1.json`], false);

// Síntesis
const { wav, duration } = await textToSpeech.call(
  texto,          // string
  lang,           // 'es' | 'en' | ... | 'na'
  style,          // objeto Style
  totalStep,      // int (pasos)
  speed,          // float (1.0 = normal)
  0.3,            // silenceDuration (s) entre chunks
  (paso, total) => setProgreso(paso / total)
);

// Salida
const blob = writeWavFile(wav, textToSpeech.sampleRate);  // sampleRate = 44100
```

Detalles verificados en el código upstream:

- `textToSpeech.sampleRate` viene de `cfgs.ae.sample_rate` = **44100** (`tts.json`).
- **Chunking ya implementado**: `call()` hace `chunkText(text, maxLen)` con `maxLen = 120` para ko/ja y **300** para el resto; entre chunks inserta `silenceDuration` s de silencio. `chunkText` parte por oraciones.
- Rutas que espera: `${onnxDir}/tts.json`, `${onnxDir}/unicode_indexer.json`, `${onnxDir}/*.onnx`; los estilos de voz se pasan como rutas sueltas.
- **Los pesos NO están en el repo del vendor**: `web/assets` es un symlink a `assets/`, que no existe en el repo. El README del vendor dice bajarlos con `hf download`. En el port web los vamos a **descargar en runtime desde HF**, no a servirlos localmente.

---

## 4. Los pesos: fuente, tamaños y el límite de GitHub

Fuente canónica: <https://huggingface.co/Supertone/supertonic-3> (mirror archivado: `supertone-oss-archive/supertonic-3`).

| Archivo | Bytes | ¿Entra en GitHub? |
|---|---|---|
| `onnx/vector_estimator.onnx` | 256.534.781 | ❌ (>100 MB) |
| `onnx/vocoder.onnx` | 101.424.195 | ❌ (>100 MB) |
| `onnx/text_encoder.onnx` | 36.416.150 | ✅ |
| `onnx/duration_predictor.onnx` | 3.700.147 | ✅ |
| `onnx/unicode_indexer.json` | 277.676 | ✅ |
| `onnx/tts.json` | 8.253 | ✅ |
| `voice_styles/{M1..M5,F1..F5}.json` | ~291 KB c/u (2,9 MB total) | ✅ |
| **Total ONNX** | **398.075.273** | — |

URL base para runtime (con `resolve/main`, que redirige al CDN):

```
https://huggingface.co/Supertone/supertonic-3/resolve/main/onnx/<archivo>
https://huggingface.co/Supertone/supertonic-3/resolve/main/voice_styles/<voz>.json
```

### 4.1 Redirects firmados — restricción de diseño CRÍTICA

Los archivos grandes **no se sirven directamente**: `/resolve/main/...` responde **302** hacia una CDN con URL firmada y caducidad.

```
HTTP/1.1 302 Found
Location: https://us.aws.cdn.hf.co/xet-bridge-us/...&Signature=MEUCIQ...&Expires=1792696739
```

Reglas que esto impone al cargador (y que el código actual incumple):

1. **Nunca persistir ni reutilizar la URL final.** Pedir siempre la URL estable `resolve/main/...` y dejar que el navegador siga el redirect. La firmada caduca (~1 h).
2. **La clave de `cache.put()` debe ser la URL estable**, no la redirigida. Si se cachea por la firmada, la caché deja de acertar al día siguiente.
3. `fetch` con redirect cross-origin: la respuesta final es `opaque` sólo si no hay CORS; acá **sí hay CORS**, así que se puede leer el cuerpo y clonarlo a la caché.
4. Los archivos chicos (`tts.json`) responden **307** al `resolve-cache`; mismo criterio.

### 4.2 CORS verificado (2026-10-22)

Medido con `curl -sL -r 0-1023 -H "Origin: https://mi-sitio.github.io"`:

| Salto | Cabeceras observadas |
|---|---|
| `/resolve/main/...` | `302` + `access-control-allow-origin: https://mi-sitio.github.io` (refleja el Origin) + `access-control-expose-headers: Accept-Ranges, Content-Range, X-Linked-Size, ETag, …` |
| CDN final (`us.aws.cdn.hf.co`) | `206 Partial Content` + `access-control-allow-origin: *` + `content-range: bytes 0-1023/101424195` |

⇒ `fetch()` cross-origin desde `*.github.io` **funciona**, y **soporta Range** (`Accept-Ranges: bytes`, `X-Linked-Size`), o sea: descarga por tramos y escritura incremental en Cache Storage son posibles.

### 4.3 No hay variantes int8

El repo publica **sólo fp32**: 4 ONNX. No existe `*int8*.onnx` ni versión cuantizada. Los RTF de ~0,1 que circulan para Supertonic provienen de conversiones propias de terceros (p. ej. `sherpa-onnx`), **no de este repo**.

**Consecuencia:** no hay palanca barata de velocidad. Acelerar exige WebGPU, bajar pasos, o cuantizar por cuenta propia (proyecto aparte, con riesgo de degradar la voz). Descartado del MVP.

`config.json` del repo es un **stub** que sólo sirve para contar descargas ("The actual model is located at `onnx/`"). No usarlo como manifiesto: el índice real es `onnx/tts.json`.

### 4.4 Licencia

| Componente | Licencia | Implicación |
|---|---|---|
| `helper.js` y código del vendor | **MIT** | Copiar con aviso de copyright. |
| Pesos del modelo | **BigScience Open RAIL-M** | Uso comercial permitido, pero: (a) hay que **propagar las restricciones de uso** de Attachment A al distribuir; (b) **prohibido usar las marcas** del Licensor (no llamar al producto "Supertonic"); (c) cláusula 7 reserva restricciones de runtime; (d) sin garantía. |

⇒ Para un demo personal en Pages no cambia nada. Para producto: incluir copia de la licencia en "Acerca de" y no usar la marca del vendor en el nombre.

**Consecuencia de diseño:** los 3 archivos grandes se descargan en runtime; los 3 pequeños (`text_encoder.onnx` 36 MB, `duration_predictor.onnx` 3,7 MB, `unicode_indexer.json`, `tts.json`) **se pueden commitear** en el repo nuevo para reducir la primera descarga a ~360 MB… salvo que `text_encoder.onnx` + `duration_predictor.onnx` siguen sumando 40 MB (permitido, pero el repo se pone pesado). Decisión recomendada: **commitear solo los JSON** (`tts.json`, `unicode_indexer.json`, `voice_styles/*.json` ≈ 3,2 MB) y bajar **los 4 ONNX** desde HF.

---

## 5. Viabilidad técnica (verificada)

### 5.1 Ops del ONNX

Inspección del header de `vector_estimator.onnx`: **solo ops estándar** (Conv, MatMul, Gemm, LayerNormalization, Softmax, Erf, Pad, ReduceSum, Where, ConstantOfShape, Slice, Gather, Transpose, Reshape, Cast, Div, Mul, Add, Sigmoid, Tanh, Split, Concat, Unsqueeze, Squeeze, Range, Shape, Identity, Constant, Cos/Sin, GridSample, etc.). **Cero ops custom de Microsoft** (`com.microsoft.*`).

⇒ El modelo es ejecutable en **WebGPU** y en **WASM**, sin fallback de provider custom.

### 5.2 WebGPU

- Chrome/Edge **113+**; Firefox y Safari tienen soporte parcial/completo en versiones recientes, no garantizado.
- Requiere **contexto seguro (HTTPS)** → GitHub Pages ✅.
- El ORT Web de WebGPU compila los kernels por subgrafo; con ops estándar funciona sin intervención.

**CORREGIDO — WebGPU está desactivado por defecto.** El EP `webgpu` de ORT 1.30 **devuelve audio corrupto en GPUs móviles**: la app sintetiza y reporta `backend: webgpu`, pero el WAV resultante es un tono continuo (un zumbido periódico), no voz, y **no lanza ningún error**. Evidencia: el mismo texto en la misma versión desplegada produce voz correcta en una laptop (sin adaptador WebGPU → `backend: wasm`) y basura en un celular (`backend: webgpu`). El audio WASM fue verificado por análisis del WAV (44,1 kHz, F0 150–425 Hz, ZCR normal), no sólo "suena bien". Consecuencia: `inicializarMotor()` usa `usarWebGPU: false` por defecto; el cableado hasta el worker queda intacto para reactivarlo cuando se valide en hardware real. Esto invalida el supuesto de velocidad de §5.3 (20–80×): **hoy la única ruta confiable es WASM**.

### 5.3 WASM: multihilo sí es posible en GitHub Pages — **CORREGIDO**

El plan original afirmaba que sin cabeceras no hay `SharedArrayBuffer` y por tanto WASM queda single-thread. **La primera parte es cierta; la conclusión no.**

- GitHub Pages no permite cabeceras propias, es correcto. Pero **`coi-serviceworker`** (gzuidhof) inyecta `COOP: same-origin` + `COEP: require-corp` desde un service worker del mismo origen. Resultado: `crossOriginIsolated === true` y `SharedArrayBuffer` disponible **también en Pages**. Recarga la página una vez, la primera visita. Requiere HTTPS (Pages ✅).
- **Medido con esas cabeceras**: 4 hilos arrancan y sintetizan correctamente (`crossOriginIsolated: true`, `sab: true`). La ganancia en la máquina de prueba fue sólo **17 %** (1,77 → 1,48 de RTF), porque tiene 2 núcleos físicos; en CPUs de 6–8 núcleos la ganancia debería ser mucho mayor (no medido).
- **Aun así, WebGPU es el camino real** para audiolibros: la diferencia no es de 2×, es de 20–80×.
- WASM sirve, y sirve de verdad, para documentos cortos: un artículo de 5 min de audio se genera en ~9 min de CPU en hardware de 2011, mucho menos en hardware moderno.
- **CORREGIDO — `proxy` NO sirve con este `helper.js`**: `ort.env.wasm.proxy = true` mueve la inferencia a un worker sin `SharedArrayBuffer`, pero ORT **transfiere** los `ArrayBuffer` de los tensores al worker (los detacha). El motor reutiliza los tensores del estilo en cada paso de denoising, así que la primera llamada funciona y la segunda explota con `Failed to execute 'postMessage' on 'Worker': An ArrayBuffer is detached and could not be cloned`. Verificado en el skeleton. Con `proxy = false` la síntesis funciona; el precio es que bloquea el hilo de UI. La solución correcta es mover **el motor entero** a un Web Worker propio (transferir texto, devolver `Float32Array`), no usar el proxy de ORT.
- **CORREGIDO — bug real del repo**: `ort.env.wasm.wasmPaths` debe ser una **ruta absoluta** (`/ort/` o `new URL('ort/', document.baseURI).href`). Con `'./ort/'`, ORT la resuelve **relativa al módulo** (`/node_modules/.vite/deps/ort/…`) y falla con `no available backend found`. Verificado: con esa ruta el motor nunca arranca.

### 5.4 Caché de pesos en el navegador

Los 4 ONNX (~398 MB) no se descargan en cada visita. Estrategia:

- **Cache Storage API** (`caches.open('supertonic-models-v1')`), claveado por nombre de archivo + versión. **Nunca por la URL redirigida de HF** (§4.1): esa caduca en ~1 h y la caché dejaría de acertar.
- Descarga con `fetch` sobre la URL estable → `response.body` → `cache.put`, en streaming: **sin materializar el `ArrayBuffer`** (bufferizar 256 MB mientras el heap WASM ya tiene los pesos es la causa directa del OOM, §5.5).
- En la UI: "Modelos: 3/4 descargados (180 MB)" + botón "Borrar caché".
- La cuota de Cache Storage en Chrome es ~60 % del disco por origen ⇒ 400 MB entran de sobra.
- Alternativa simple (más chica): no cachear nada y recomendar usar la app con WebGPU. **El cacheo es el primer paso porque sin él la app es inservible.** Prioridad: alta.

### 5.5 Memoria

`vector_estimator.onnx` son 256 MB de pesos → en el navegador quedan en memoria (GPU para WebGPU). Presupuesto realista por pestaña: ~1 GB con los 4 modelos cargados. Por eso los pesos se cargan **una vez y se reutilizan** (no por archivo), y el flush por memoria de desktop se reinterpreta como "liberar tensores entre archivos".

**Medido**: la carga completa de 398 MB funcionó en una máquina con 8 GB de RAM y sintetizó 94,8 s de audio en una sola llamada sin OOM. Pero el código actual de `cache-modelos.ts` **bufferiza el archivo entero en RAM** antes de escribir en caché (256 MB extra en el pico) mientras el heap WASM ya tiene los pesos. Eso es exactamente el "Out of memory" que documenta el troubleshooting del vendor. **Regla:** descargar con `ReadableStream` y escribir a `cache.put(request, response)` sin materializar el `ArrayBuffer`; si se necesita el buffer para ONNX, dejar que ORT lo lea desde la respuesta cacheada.

**Medido también**: una llamada de 1.379 caracteres produjo 94,8 s de audio en una sola invocación sin problema — el chunking interno del vendor (`chunkText`, 300 chars) funciona; el long-form no es un riesgo de arquitectura.

---

## 6. Arquitectura propuesta del repo nuevo

Repo nuevo (nombre pendiente de definir), por ejemplo `supertonic-audiobook-web`:

```
supertonic-audiobook-web/
├── public/
│   ├── coi-serviceworker.min.js  # COOP/COEP en GitHub Pages → SharedArrayBuffer (§5.3)
│   ├── ort/                      # wasm de onnxruntime-web (copiado en build)
│   └── models/                   # tts.json, unicode_indexer.json (commitear)
├── src/
│   ├── domain/                   # ← puro, sin React ni DOM
│   │   ├── limpiar-markdown.ts   # puerto de use_cases/limpiar_markdown.py
│   │   ├── segmentar-texto.ts    # puerto de use_cases/segmentar_texto.py
│   │   ├── formato.ts            # normalizar_formatos
│   │   ├── procesar-archivo.ts   # orquestador (inyecta motor + exportador)
│   │   └── constantes.ts         # LANGUAGES_VOZ, VOCES, defaults
│   ├── data/                     # implementaciones de los ports del dominio
│   │   ├── motor-tts.ts          # adapter sobre helper.js (loadTextToSpeech)
│   │   ├── exportador-audio.ts   # WAV/FLAC/OGG/MP3
│   │   ├── archivos-web.ts       # FileList → lista de .md con orden natural
│   │   ├── preferencias.ts       # localStorage
│   │   └── cache-modelos.ts      # Cache Storage + descarga con progreso
│   ├── presentation/
│   │   ├── App.tsx
│   │   ├── components/           # PanelEntrada, PanelSintesis, ListaArchivos,
│   │   │                         #   OpcionesSintesis, BarraProgreso, Log,
│   │   │                         #   Snackbar, DialogoAjustes
│   │   ├── hooks/                # useMotor, useProcesamiento, usePreferencias, useI18n
│   │   └── i18n/                 # es.ts / en.ts (mismas claves que TRADUCCIONES)
│   ├── lib/supertonic/helper.js  # ← copia verbatim del vendor (MIT)
│   └── main.tsx
├── tests/                        # vitest (puertos de app/tests/)
├── docs/plan-port-react.md       # ← este documento (copiado desde el repo desktop)
└── package.json                  # react, react-dom, onnxruntime-web, vite, vitest
```

Reglas que se mantienen del proyecto desktop (mismo nombre de las que ya existen en `AGENTS.md`):

1. `domain/` no importa de `data/` ni de `presentation/`.
2. El composition root (`main.tsx` / `App.tsx`) es el único que inyecta dependencias.
3. Código, comentarios y docs en español. UI bilingüe ES/EN.

---

## 7. Paso a paso

### Fase 0 — Andamiaje del repo (30 min)

```bash
npm create vite@latest supertonic-audiobook-web -- --template react-ts
cd supertonic-audiobook-web
npm i onnxruntime-web
npm i -D vitest @vitest/ui jsdom
git init && git add -A && git commit -m "chore: andamiaje vite + react + onnxruntime-web"
```

- Copiar `docs/plan-port-react.md` a este repo.
- `README.md` en español: qué es, requisitos (Chrome/Edge 113+ para WebGPU), cómo correr, advertencia de ~400 MB de descarga.
- `.gitignore`: `node_modules`, `dist`, `public/ort/` (se genera en build).

### Fase 1 — Motor TTS en el navegador (el corazón)

1. Copiar `helper.js` del vendor a `src/lib/supertonic/helper.js` **verbatim**, con el encabezado de licencia/autorización:
   ```
   // Basado en supertone-oss-archive/supertonic (MIT) — https://github.com/supertone-oss-archive/supertonic
   ```
2. `src/data/cache-modelos.ts`:
   - `descargarModelo(url, nombre, onProgress)` → `cache.match` → si no, `fetch` con `ReadableStream` y `cache.put`.
   - Cache key: `supertonic-models-v1/<nombre>`; clave de versión para invalidar.
   - Reporta bytes descargados para la barra de progreso.
3. `src/data/motor-tts.ts`: adapter que expone el `Protocol` del dominio:
   ```ts
   interface MotorTTS { sintetizar(texto, opts): Promise<Float32Array> }
   ```
   - `cargar()`: descarga/cachea los 4 ONNX + `tts.json` + `unicode_indexer.json`, llama `loadTextToSpeech(onnxDir, { executionProviders })`.
   - Detección de backend:
     ```ts
     const tieneWebGPU = !!navigator.gpu && !!(await navigator.gpu.requestAdapter());
     if (tieneWebGPU) {
       const ep = ['webgpu'];
     } else {
       // obligatorio: ruta ABSOLUTA. Con './ort/' ORT resuelve contra el módulo y da 404.
       ort.env.wasm.wasmPaths = new URL('ort/', document.baseURI).href;
       ort.env.wasm.numThreads = crossOriginIsolated ? Math.min(navigator.hardwareConcurrency, 4) : 1;
       ort.env.wasm.proxy = true;   // inferencia en worker: no congela la UI
     }
     ```
   - **`coi-serviceworker`**: copiar `coi-serviceworker.min.js` a `public/`, registrarlo desde `main.tsx` antes de todo. Es lo que habilita `crossOriginIsolated` (y por tanto `SharedArrayBuffer` + multihilo) en GitHub Pages. La primera visita recarga la página una vez.
   - `sintetizar()`: `textToSpeech.call(texto, lang, style, steps, speed, silence, onStep)`.
   - `cargarEstilo(voz)`: `loadVoiceStyle([`${base}/voice_styles/${voz}.json`])` — cacheado también.
   - **URLs de HF**: siempre `resolve/main/...` (nunca la redirigida; ver §4.1). Descarga por streaming a Cache Storage, sin materializar el `ArrayBuffer` (§5.5).
4. **Probar en local primero** con la demo del vendor como sanity check: clonar `supertonic`, `hf download` de los pesos, `npm run dev`. Si el vendor no sintetiza en tu Chrome, no vas a sintetizar en React: eso valida el entorno antes de escribir UI.

### Fase 2 — Descarga + caché (integrada en Fase 1, pero es un hito propio)

- UI de "Preparando modelos" con: estado por archivo, bytes, %, botón de cancelar y de borrar caché.
- Test manual: recargar la página → los pesos NO se vuelven a bajar (Cache Storage hit). **Ojo**: si la clave es la URL redirigida y no la estable, este test pasa hoy y falla mañana (§4.1).
- Medir: tiempo de primera carga y tiempo de carga con caché.
- **Baseline medido** (disco local, sin red): 12–33 s de carga de los 398 MB. Sumarle la descarga según ancho de banda: 20 Mbps ≈ 160 s, 50 Mbps ≈ 64 s, 100 Mbps ≈ 32 s.
- **Requisito de producto**: mostrar el **backend detectado** (WebGPU / WASM n hilos) y un **ETA estimado** antes de procesar. Sin esto, el usuario cree que la app se colgó. El ETA se calcula con el RTF del backend (§11): `ETA = duración_estimada_del_audio × RTF`.

### Fase 3 — Puerto del dominio (Markdown → segmentos)

1. `src/domain/limpiar-markdown.ts`: portar `use_cases/limpiar_markdown.py` **función por función**, con los mismos nombres y los mismos tests.
2. `src/domain/segmentar-texto.ts`: portar `segmentar_texto.py` con `MAX_CHARS_PER_SEGMENT = 1500`, `MERGE_THRESHOLD = 200` y `_ABREVIATURAS`.
3. `src/domain/procesar-archivo.ts`: orquestador con:
   - `debeDetenerse()` entre segmentos → cancela y publica lo generado.
   - Exportación **atómica**: en web = escribir el WAV completo en un Blob y recién entonces dispararlo como descarga (o escribirlo en OPFS/IDB y moverlo). Nunca publicar un WAV parcial.
   - `onProgreso(segmentosHechos, total)`.
4. Tests con `vitest`: portar los 28 tests de `app/tests/` (17 + 5 + 10 + 9). Los de `procesar_archivo` usan un motor/exportador falsos (fakes), igual que en Python.

**Decisión de paridad clave (§7.1):** el chunker del vendor corta a 300 caracteres; el desktop corta a 1500. En web conviene usar **el chunker nativo del vendor** (300) porque ya intercala silencios y está probado con el modelo, y usar `segmentar_texto` (1500) como **pre-segmentación** solo para el saneado de Markdown y el registro de progreso. Concretamente:

- `limpiar_markdown` (nuestro) → texto plano.
- `segmentar_texto` (nuestro, 1500) → unidades lógicas para el log/progreso.
- `textToSpeech.call` (vendor, 300) → chunks reales de inferencia.

Si se quiere control total, se puede llamar `textToSpeech.batch(textList, langList, ...)` con nuestra segmentación de 1500 y gestionar los silencios a mano (es lo que hace `call()` internamente). **Empezar con `call()` y no tocarlo.**

### Fase 4 — UI React

Orden de implementación (de menor a mayor riesgo):

1. **Layout**: header con título + botón de ajustes; tabs "Entrada y salida" / "Síntesis y registro"; responsive con `useMediaQuery('(min-width: 900px)')` replicando el criterio del desktop.
2. **Panel de entrada**: selector de **un archivo `.md` por vez** (`<input type="file" accept=".md">`). **Decisión de producto:** la versión web no puede elegir carpeta, así que se abandona el `webkitdirectory` del desktop; cada `.md` sigue siendo una unidad de audio, igual que en el original. Flujo: `limpiarMarkdown()` → `segmentarTexto()` → síntesis por segmento → concatenar → un WAV con el nombre del archivo.
3. **Panel de opciones**: formatos (checkboxes), voz (10), idioma (32), pasos (5–12), velocidad (0.7–2.0), botón Escuchar.
4. **Log**: componente con niveles coloreados, autoscroll, tope de ~20 líneas por archivo.
5. **Progreso**: barra + % + estado.
6. **Snackbar** para feedback (no modales).
7. **Ajustes**: tema claro/oscuro, estilo (Material/Neumorfismo/Skeuomorfismo — replicar con CSS: `box-shadow` dual para neumo, bordes y gradientes para skeuo), idioma ES/EN, Acerca de con los links del vendor.
8. **Preferencias**: `localStorage` con el mismo esquema de claves del desktop (`tema`, `estilo`, `idioma`, `voz`, `pasos`, `velocidad`, `lang_voz`, `formatos`, carpetas).

**Prioridad honesta:** los temas/estilos son la parte más "bonita" y la menos diferenciada. Si el tiempo aprieta: tema claro/oscuro + Material primero; neumo/skeuo al final.

### Fase 5 — Formatos de salida

- **WAV**: `writeWavFile(wav, sampleRate)` del vendor → Blob → descarga. Resuelto.
- **FLAC / OGG / MP3**: requieren encoder en WASM (`@wasm-audio-decoders` no encode; hay librerías tipo `lamejs` para MP3, `flac.js`, `ogg-vorbis`). Decisión: **fuera del MVP**. En el MVP, el selector de formatos muestra solo WAV y el resto queda deshabilitado con la nota "próximamente".
- Si se implementan: encodear **fuera del hilo de inferencia** (Web Worker) para no congelar la UI.

### Fase 6 — Tests

- `vitest` con los 28 tests del dominio portados.
- 1 test de humo: cargar modelos → sintetizar 10 caracteres → `wav.length > 0` (solo en navegador, con `npm run test:browser` o Playwright; no en CI por los 400 MB).
- Test de la UI con `@testing-library/react` para: selección de archivos, validación de formato, cambio de idioma.

### Fase 7 — Deploy

1. `vite build` → `dist/`.
2. `public/ort/` debe existir en `dist/` (script de build: `cp -r node_modules/onnxruntime-web/dist/* public/ort/` o equivalente Windows).
3. `base: './'` en `vite.config.ts` (o `base: '/<repo>/'` si se sirve bajo subpath) — GitHub Pages sirve en `/<repo>/` salvo con dominio propio.
4. Workflow `.github/workflows/deploy.yml`: build + `actions/deploy-pages`.
5. **Límite de GitHub Pages**: 1 GB por sitio, 100 MB por archivo. Los JSON de modelos (3,2 MB) van en el repo; los ONNX **nunca**.
6. Checklist post-deploy: (a) el navegador pide los pesos a HF y los cachea; (b) la primera síntesis funciona; (c) recargar no re-descarga; (d) el fallback WASM se activa en un navegador sin WebGPU; (e) `crossOriginIsolated === true` gracias a `coi-serviceworker` y `numThreads > 1`; (f) no hay `404` de `ort-wasm-*.mjs` en la consola.

---

## 8. Riesgos y mitigaciones

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| 1 | Primera carga de ~400 MB | Alto | Cache Storage + descarga por streaming con progreso visible; mostrar el tamaño antes de empezar; permitir "usar modelos locales" si el usuario ya los tiene. |
| 2 | WASM lento (medido RTF 1,5–1,8 en hardware de 2011) | Alto | WebGPU como camino principal; `coi-serviceworker` para multihilo; UI que muestre backend activo **y ETA**; el README exige Chrome/Edge 113+. |
| 3 | `helper.js` del vendor es un snapshot archivado | Medio | Fijar la revisión (commit) del vendor que se copia; el port queda aislado en `src/lib/supertonic/` para poder actualizarlo. |
| 4 | Divergencia de silencios/pasos/velocidad vs desktop | Bajo | §7.1: documentar los defaults elegidos y exponerlos en la UI. |
| 5 | Publicar WAVs largos en memoria | Medio | El audio de un libro entero en un `Blob` puede pesar cientos de MB; preferir descarga por archivo (un Blob por archivo) y, si se necesita unmerged, escribir a OPFS/IDB por partes. |
| 6 | Reimplementar reglas de Markdown y que difieran del desktop | Medio | Portar los tests **antes** de la UI: los 17 casos de `limpiar_markdown` son la especificación ejecutable. |
| 7 | Licencia del modelo | Medio | Pesos **Open RAIL-M** (no MIT): propagar restricciones de Attachment A y **no usar la marca "Supertonic"** en el nombre del producto. Código del vendor: MIT. Créditos en "Acerca de". |
| 8 | GitHub Pages sin COOP/COEP | Bajo (mitigado) | `coi-serviceworker` habilita `crossOriginIsolated` y `SharedArrayBuffer`. Verificado que el multihilo arranca con esas cabeceras. |
| 9 | Redirects firmados de HF caducan (~1 h) | Alto | Clave de caché = URL estable `resolve/main/...`; nunca persistir la URL del CDN. Ver §4.1. |
| 10 | El visitante tiene hardware de 2011 o móvil | Alto | Es el riesgo de producto, no de código. Comunicar el ETA antes de procesar y sugerir "modo rápido (2 pasos)" con aviso de calidad. No prometer audiolibros completos. |
| 11 | No hay int8 publicado | Medio | Sin palanca barata de velocidad; int8 propio queda fuera del MVP (§4.3). |

---

## 9. Fuera de alcance (YAGNI)

- Backend / API de síntesis en servidor: el objetivo es 100 % local en el navegador.
- Encodeadores MP3/OGG/FLAC (MVP = WAV).
- Móvil / PWA instalable / service worker offline. (El único service worker del MVP es `coi-serviceworker`, y existe sólo para inyectar `COOP`/`COEP`; no cachea la app.)
- Tema neumo/skeuo si el tiempo aprieta (se puede añadir después sobre el tema Material).
- Panel de "voz" con las 10 texturas: el modelo ya trae M1–M5 / F1–F5 pre-extraídas; no hace falta generar ni previsualizar estilos nuevos.
- Anything que requiera GPU en servidor.

---

## 10. Definición de terminado

- [ ] Se genera audio (WAV) de un `.md` de prueba en Chrome/Edge con WebGPU, en la web app.
- [ ] La UI replica las 3 pestañas/paneles del desktop con log, progreso, cancelar, snackbar y ajustes.
- [ ] Idioma ES/EN con las mismas claves que `TRADUCCIONES`.
- [ ] Los pesos se cachean: la segunda visita no descarga.
- [ ] Los 28 tests de dominio están portados y en verde.
- [ ] `git diff` del dominio JS vs Python es revisable línea por línea (mismo orden de funciones).
- [ ] Deploy en GitHub Pages funcionando con `base` correcto.
- [ ] El motor arranca en el build de producción (no sólo en `npm run dev`): `wasmPaths` absoluto, sin `404` de `ort-wasm-*.mjs` (§5.3).
- [ ] `crossOriginIsolated === true` en Pages gracias a `coi-serviceworker`, y `numThreads > 1` confirmado en consola.
- [ ] La UI muestra el backend detectado y un ETA antes de procesar.
- [ ] La caché usa la URL estable como clave: recargar **al día siguiente** no vuelve a descargar.
- [ ] RTF medido y documentado para WebGPU y para WASM en al menos 2 máquinas, con la tabla del §11 actualizada.
- [ ] README en español con requisitos, licencias (MIT código / RAIL-M pesos) y créditos.

---

## 11. Anexo: mediciones reales (2026-10-22)

Todo el resto de este documento es análisis. **Esta sección son números medidos** ejecutando el motor de verdad en un navegador.

### 11.1 Método

- Se sirvió el repo por HTTP con `COOP: same-origin` + `COEP: require-corp` (equivalente a lo que aporta `coi-serviceworker`).
- Import map `onnxruntime-web` → `onnxruntime-web/dist/ort.wasm.min.mjs`; WASM servido desde `public/ort/`.
- Se cargaron los 4 ONNX y las voces desde `public/assets/` (los 398 MB reales descargados de HF).
- Se usó **`src/lib/supertonic/helper.js` verbatim** del repo: `loadTextToSpeech` → `loadVoiceStyle('M1')` → `textToSpeech.call(texto, 'es', style, steps, 1.1, 0.3, null)`.
- Medición con Chrome headless vía `puppeteer-core`, cronometrando dentro de la página.

### 11.2 Máquina de prueba (piso pesimista)

| Componente | Valor |
|---|---|
| CPU | Intel Core i5-2430M (Sandy Bridge, 2011), **2 núcleos / 4 hilos**, 2,4 GHz, **sin AVX2** |
| RAM | 7,9 GB |
| GPU | Intel HD Graphics 3000 → **sin WebGPU** |
| Navegador | Chrome 155 |
| Runtime | onnxruntime-web (WASM) |

### 11.3 Resultados

RTF = segundos de cómputo por segundo de audio generado. **RTF = 1 significa tiempo real.**

| Pasos | Hilos | Caracteres | Audio | Cómputo | **RTF** | Carga de modelos |
|---|---|---|---|---|---|---|
| 5 | 1 | 60 | 4,36 s | 7,74 s | **1,77** | 33,1 s |
| 5 | 4 | 60 | 4,36 s | 6,44 s | **1,48** | 32,1 s |
| 5 | 4 | 1.379 | 94,83 s | 172,30 s | **1,82** | 12,3 s |
| 2 | 4 | 137 | 9,80 s | 8,53 s | **0,87** | 13,9 s |

- El audio salió **válido**: WAV de 4.184.760 muestras a 44.100 Hz en la llamada larga.
- Carga del estilo de voz (JSON de 292 KB): 52–177 ms.
- El texto largo no degrada el RTF → es estado estacionario, no overhead.
- 4 hilos vs 1 hilo: **+17 %**, limitado por los 2 núcleos físicos.

### 11.4 Lectura de los números

| Escenario | 5 pasos (RTF 1,82) | 2 pasos (RTF 0,87) |
|---|---|---|
| Artículo de 5 min de audio | ~9 min | ~4 min |
| Capítulo de 30 min | ~55 min | ~26 min |
| Audiolibro de 10 h | **~18 h** | ~8,7 h |

**Referencia del vendor**: su tabla publica RTF 0,018–0,023 (5 pasos) en un **M4 Pro** — ~79× más rápido que esta medición. No es comparable (Apple Silicon 2024 + backend nativo vs. dual-core de 2011 + WASM), pero fija el techo: **con WebGPU esto es casi instantáneo; sin WebGPU, la velocidad depende enteramente del CPU del visitante.**

**Extrapolación (NO medida)**: un CPU moderno de 6–8 núcleos con AVX2 debería quedar en RTF 0,3–0,6 en WASM, o sea 2–3× más rápido que tiempo real. Tratarlo como hipótesis hasta medirlo.

### 11.5 El propio vendor coincide

Del `web/README.md` oficial, sección Troubleshooting:

> **Slow generation** — "If using WebAssembly, try a browser that supports WebGPU. […] Consider using fewer denoising steps for faster (but lower quality) results."

> **Out of memory errors** — "Try shorter text inputs […] Use a browser with more available memory. Close other tabs to free up memory."

### 11.6 Lo que NO se midió (no afirmar como hecho)

- WebGPU (la máquina de prueba no tiene GPU compatible).
- Safari/iOS: límite de 4 GB del heap WASM32 + desalojo de pestañas con ~400 MB de pesos.
- Firefox.
- Throttling térmico en corridas de 2 h.
- Descarga real por red (todos los `msCarga` son de disco local).
- Desalojo de Cache Storage bajo presión de almacenamiento.
- ONNX cuantizados (no existen publicados, §4.3).

### 11.7 Cómo reproducirlo

1. Descargar los pesos: `hf download Supertone/supertonic-3 --local-dir public/assets` (o usar los que ya están).
2. Copiar el WASM de ORT: `node scripts/copiar-ort.mjs`.
3. Servir `public/` con cabeceras `COOP: same-origin` y `COEP: require-corp`.
4. Cargar `helper.js` verbatim + import map a `ort.wasm.min.mjs`.
5. Llamar `textToSpeech.call(texto, 'es', style, 5, 1.1, 0.3, null)` y cronometrar.
6. Repetir con `numThreads = 1` y `numThreads = 4` para aislar el efecto del multihilo.

### 11.8 Skeleton en producción: medido (2026-10-22)

Primera prueba de punta a punta con el camino real que usará el usuario: `vite build` + `vite preview`, modelos bajados de Hugging Face, caché en Cache Storage, síntesis con la voz M1.

| Corrida | Origen de los pesos | Click → audio | Descarga | Audio generado | RTF |
| --- | --- | --- | --- | --- | --- |
| Fría | Hugging Face | 352 s | 398 MB (~320 s) | 4,46 s | 6,60 |
| Caliente | Cache Storage | 30 s | 0 MB | 4,46 s | 4,26 |

Qué confirma:

- **La caché acierta de verdad**: la segunda corrida no descarga nada; `caches` tiene las 7 entradas (4 ONNX + `tts.json` + `unicode_indexer.json` + `M1.json`).
- **La URL firmada no se persiste**: los archivos grandes (302 → CDN firmada) quedan cacheados bajo `resolve/main`, así que sobreviven al vencimiento de la firma.
- **Streaming sin bufferizar**: `response.body.tee()` + `cache.put` evita el pico de 256 MB en RAM. No hubo OOM en una máquina con 2,3 GB libres.
- **La creación de sesiones es el costo fijo**: ~11 s en caliente, y mucho más con la máquina cargada. Es lo que domina la recarga, no la síntesis.

Qué **no** confirma: los RTF de esta tabla no son comparables con §11.3. Durante estas corridas la máquina estaba saturada (21 procesos de Chrome, 2,3 GB libres de 8 GB): el propio harness de referencia se degradó de 0,87 a 1,06 y su carga de 13,8 s a 40,7 s. Sirven como orden de magnitud del camino completo, no como benchmark.

Nota operativa: `public/assets` (382 MB, gitignoreado) está bloqueado por un proceso del sistema y no se pudo mover; `vite build` lo copia a `dist` (36 s de build). No afecta a Pages —nunca se commitea—, pero conviene moverlo a `assets/` cuando el lock desaparezca.
