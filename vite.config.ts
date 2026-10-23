import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * GitHub Pages sirve el sitio en /<repo>/, así que las rutas deben ser relativas.
 *
 * COOP/COEP habilitan SharedArrayBuffer -> ORT usa varios hilos wasm y la
 * creación de sesiones pasa de ~165 s a ~14 s. En producción GitHub Pages no
 * permite headers, así que ahí lo resuelve `coi-serviceworker`.
 */
const aislamiento = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

/**
 * onnxruntime-web referencia su wasm con `new URL(..., import.meta.url)`, así
 * que Vite emite una copia en `assets/` de 27 MB que nunca se pide: el worker
 * fija `ort.env.wasm.wasmPaths` y usa la de `public/ort/`. Sin esto, el deploy
 * lleva el mismo wasm dos veces.
 */
const sinWasmDuplicado = {
  name: 'sin-wasm-duplicado',
  generateBundle(_opciones: unknown, bundle: Record<string, unknown>) {
    for (const archivo of Object.keys(bundle)) {
      if (archivo.endsWith('.wasm')) delete bundle[archivo]
    }
  },
}

export default defineConfig({
  plugins: [react(), sinWasmDuplicado],
  base: './',
  server: { headers: aislamiento },
  preview: { headers: aislamiento },
})
