# Supertonic-AudioBook - React (web)

Port web de [Supertonic-AudioBook](https://github.com/Rafael-VH/Supertonic-AudioBook): convierte archivos Markdown en audio usando **Supertonic 3** con inferencia **100 % en el navegador** (ONNX Runtime Web + WebGPU, fallback WASM). Sin servidor, sin nube, sin GPU de servidor.

> **Estado**: andamiaje inicial (Fase 0). La inferencia TTS todavia no esta conectada; el plan completo esta en [`docs/plan-port-react.md`](docs/plan-port-react.md).

## Requisitos

- **Node.js 20+** para desarrollo.
- **Chrome o Edge 113+** para inferencia con WebGPU. El fallback WASM funciona, pero es mucho mas lento.

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build     # typecheck + genera dist/
npm run preview   # sirve dist/ localmente
```

## Como funciona

1. El navegador descarga los pesos del modelo (~398 MB) desde Hugging Face y los cachea en Cache Storage: la segunda visita no vuelve a descargarlos.
2. Los `.md` se limpian y segmentan con las mismas reglas que la version de escritorio.
3. La sintesis corre en el navegador con ONNX Runtime Web y se descarga como WAV.

## Creditos y licencias

- Modelo de voz: **Supertonic 3**, de Supertone Inc. - licencia OpenRAIL-M.
- Port web de referencia (motor `helper.js`): [`supertone-oss-archive/supertonic`](https://github.com/supertone-oss-archive/supertonic) - licencia MIT.
- ONNX Runtime Web - MIT.
