# Desarrollo — Supertonic AudioBook (web)

Guía para trabajar en este repo: montar el entorno, entender las capas, correr los tests y desplegar. Lo que necesita el usuario final está en el [README](../README.md); el diseño y las mediciones, en el [plan del port](plan-port-react.md).

## Requisitos

- **Node.js 20+ y npm** (el CI usa Node 22).
- Red la primera vez que se abre la app: los pesos del modelo no están en el repo.
- Windows, macOS o Linux. No hay dependencias nativas.

## Puesta en marcha

```bash
npm install    # postinstall: copia el WASM de onnxruntime-web a public/ort/
npm run dev    # http://localhost:5173
```

`vite.config.ts` agrega `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Embedder-Policy: require-corp` en `dev` y `preview`. Eso habilita `SharedArrayBuffer` y el WASM multihilo. En GitHub Pages las cabeceras no se pueden configurar, así que ahí las inyecta `public/coi-serviceworker.js` (la primera visita recarga la página una vez).

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Vite con las cabeceras de aislamiento. |
| `npm run build` | `tsc --noEmit` + build a `dist/`. Es el único typecheck que hay. |
| `npm run preview` | Sirve `dist/` con las mismas cabeceras. |
| `npm test` / `npm run test:watch` | Vitest en modo `node`, sin DOM. |
| `npm run copy:ort` | Copia solo `ort-wasm-simd-threaded.jsep.{wasm,mjs}` a `public/ort/`. Corre también en `postinstall`. |
| `npm run assets:fetch` | Baja los ~398 MB a `assets/` (ignorado por git) para reproducir las mediciones del plan. La app **no** los usa en runtime. |

## Estructura

```
src/
├── App.tsx                    # composition root: UI + orquestación del flujo
├── main.tsx                   # monta React y carga index.css
├── index.css                  # sistema visual completo (variables + componentes)
├── domain/                    # puro: sin React, sin DOM, sin red
│   ├── limpiar-markdown.ts    # Markdown → texto hablable
│   └── segmentar-texto.ts     # texto → segmentos de hasta 1500 caracteres
├── data/                      # adaptadores concretos
│   ├── ajustes.ts             # defaults, validación y localStorage
│   ├── motor-tts.ts           # cliente del worker (promesas sobre mensajes)
│   ├── cache-modelos.ts       # descarga de HF + Cache Storage
│   └── wav.ts                 # Float32Array → WAV PCM16
├── workers/tts.worker.ts      # motor ORT + helper.js, fuera del hilo de UI
└── lib/supertonic/helper.js   # vendor MIT: se copia, no se toca
tests/                         # vitest, un archivo por unidad
scripts/                       # copiado del WASM y descarga de pesos
public/                        # coi-serviceworker.js + ort/ (generado)
```

Reglas que sostienen la arquitectura:

1. `domain/` no importa de `data/`, de `workers/` ni de React.
2. `App.tsx` es el único lugar que compone dominio + adaptadores.
3. `helper.js` es código del vendor (MIT). Se envuelve; no se refactoriza ni se le cambian los defaults.
4. Código, comentarios y documentación en español.

## Modelo, descarga y caché

- Los pesos salen de `https://huggingface.co/Supertone/supertonic-3/resolve/main`; la constante es `HF_BASE` en `data/cache-modelos.ts`.
- Se cachean en Cache Storage bajo `supertonic-modelos-v1`: los 4 ONNX, `tts.json`, `unicode_indexer.json` y el JSON de la voz elegida (7 entradas tras una corrida completa).
- **La clave de caché debe ser la URL estable `resolve/main/...`.** Los archivos grandes responden 302 hacia una CDN con URL firmada que caduca en ~1 hora; cachear esa URL rompe los aciertos al día siguiente.
- La descarga usa `response.body.tee()` + `cache.put`: nunca se materializa el `ArrayBuffer` del archivo entero, que en el ONNX grande son 256 MB extra en el peor momento.
- `conCacheDeModelos()` intercepta `fetch` mientras dura la carga del motor, así `helper.js` sigue funcionando con rutas normales.
- `listarCache()` y `borrarCache()` existen en el adaptador pero todavía no tienen UI.
- Si cambia el formato o la versión de los pesos, subí `CACHE_NAME`: es lo que invalida la caché vieja.

## Motor en Web Worker

`data/motor-tts.ts` habla con `workers/tts.worker.ts` por mensajes:

- Peticiones: `init` (con `wasmPaths` y `usarWebGPU`), `voz` y `sintetizar`.
- Eventos: `modelo`, `descarga`, `paso` y `listo`; además `ok`, `resultado` (el `Float32Array` se transfiere, no se copia) y `error`.

Detalles que no conviene romper:

- **Una inicialización por visita.** `inicializarMotor()` reutiliza la misma promesa: un doble clic no dispara dos cargas y cancelar no obliga a re-verificar el modelo. Si la carga falla, la promesa se limpia para permitir reintentar. Cubierto por `tests/motor-una-vez.test.ts`.
- **Cancelar es cooperativo.** Se marca la corrida y se corta antes del próximo segmento. No se usa `terminate()` porque destruye las sesiones de ORT y obliga a recrearlas (≈11 s en caliente y minutos con el modelo frío). El costo es que cancelar espera al segmento en curso.
- **`wasmPaths` se calcula en el hilo principal** (`new URL('ort/', document.baseURI)`) y viaja en `init`: dentro del worker no existe `document`. Una ruta relativa hace que ORT la resuelva contra el módulo y falle con `no available backend found`.
- **`ort.env.wasm.proxy = false`.** Con `proxy = true`, ORT detacha los `ArrayBuffer` de los tensores que este `helper.js` reutiliza en cada paso y la segunda síntesis explota.
- **`numThreads`** depende de `crossOriginIsolated` (tope 4). El worker loguea `coi`, núcleos e hilos al arrancar: es la forma rápida de comprobar el aislamiento.
- **WebGPU está apagado a propósito** (`usarWebGPU: false` fijo). El EP `webgpu` de ORT 1.30 devuelve un tono continuo en GPUs móviles sin lanzar error. El cableado sigue vivo; reactivarlo exige validar el WAV en hardware real.
- **La voz elegida vive en el worker.** Si cambia el ajuste de voz hay que volver a llamar a `cargarVoz()` antes de sintetizar; `App.tsx` lo controla con `vozCargada`.

## Tests y verificación

```bash
npm test        # 39 tests: limpiar-markdown, segmentar-texto, ajustes, motor, WAV
npm run build   # typecheck + bundle
```

No hay linter ni formatter: el typecheck del build es la red. Los tests corren en entorno `node`, así que las unidades con DOM o Worker se prueban con dobles (ver `motor-una-vez.test.ts`); no hay tests de UI.

Antes de dar por buena una UI o un cambio en la carga del motor, además de los tests:

1. `npm run build && npm run preview` y abrir el build real (no sólo `dev`).
2. Consola limpia: sin `404` de `ort-wasm-*.mjs` ni de favicon.
3. `crossOriginIsolated === true` en la consola (`coi: true` en el log del worker).
4. Cargar un `.md`, comprobar que aparecen los ajustes en dos columnas y ajustar voz o pasos.
5. Generar un texto corto y descargar el WAV.
6. Generar otra vez sin recargar: no debe decir "Cargando modelos".
7. Cancelar a mitad y comprobar que el siguiente intento no vuelve a cargar el modelo.

## Deploy

Push a `main` dispara [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml): `npm ci`, `npm run build` y `actions/deploy-pages`. No hay secretos: la app es estática.

- `base: './'` en `vite.config.ts` porque Pages sirve bajo `/<repo>/`.
- `public/ort/` se regenera en cada build; no se versiona.
- El `dist/` completo ronda los 28 MB. El plugin `sin-wasm-duplicado` evita que Vite emita una segunda copia del WASM (27 MB que nadie pedía).
- Los pesos **nunca** entran al repo: GitHub rechaza archivos de más de 100 MB y Pages no sirve desde Git LFS. Tampoco conviene auto-hospedarlos por la banda (100 GB/mes) y porque cada visitante en frío pagaría los mismos ~400 MB.

## Problemas conocidos

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `no available backend found` | `wasmPaths` relativo o `public/ort/` vacío | Recalcular en el hilo principal y correr `npm run copy:ort`. |
| `An ArrayBuffer is detached…` en la segunda síntesis | `ort.env.wasm.proxy = true` | Dejarlo en `false` y usar el worker propio. |
| El WAV suena como un tono continuo | GPU móvil con el EP `webgpu` de ORT 1.30 | Mantener WebGPU apagado. |
| El modelo se vuelve a descargar | Caché borrada, navegador sin cuota o clave de caché con URL firmada | Revisar `CACHE_NAME` y que `cache.put` use la URL estable. |
| La página descarga el WASM dos veces | Plugin `sin-wasm-duplicado` desactivado | Verificar el `dist/` con `du`. |
| Los ajustes no persisten | Modo privado o `localStorage` bloqueado | Es esperado: `guardarAjustes()` ignora el error. |

## Estado y siguientes pasos

La foto actual del repo por fase está en [plan §0](plan-port-react.md#0-estado-de-implementación-2026-10-24) y la lista priorizada de mejoras en [plan §12](plan-port-react.md#12-plan-de-mejoras-2026-10-24). Lo pendiente de mayor valor: precarga del motor al elegir archivo, ETA de cómputo, log de síntesis, tests de UI y selector de formatos.
