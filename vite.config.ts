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

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { headers: aislamiento },
  preview: { headers: aislamiento },
})
