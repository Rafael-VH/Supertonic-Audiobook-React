import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sirve el sitio en /<repo>/, asi que las rutas deben ser relativas.
export default defineConfig({
  plugins: [react()],
  base: './',
})
