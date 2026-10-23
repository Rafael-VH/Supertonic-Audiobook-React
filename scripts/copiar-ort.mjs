import fs from 'node:fs'
import path from 'node:path'

const src = path.resolve('node_modules/onnxruntime-web/dist')
const dst = path.resolve('public/ort')
fs.mkdirSync(dst, { recursive: true })

// Solo el build "jsep": es el único que pide el navegador (verificado en
// runtime). Las variantes asyncify y no-jsep suman ~39 MB que nunca se
// descargan, y `ort.webgpu.mjs`/`ort.wasm.mjs` no se importan.
const patterns = [
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
]

for (const p of patterns) {
  const s = path.join(src, p)
  if (fs.existsSync(s)) {
    fs.copyFileSync(s, path.join(dst, p))
    console.log('copiado', p)
  } else {
    console.log('omitido', p)
  }
}
console.log('public/ort listo')
