import fs from 'node:fs'
import path from 'node:path'

const src = path.resolve('node_modules/onnxruntime-web/dist')
const dst = path.resolve('public/ort')
fs.mkdirSync(dst, { recursive: true })

const patterns = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort.webgpu.mjs',
  'ort.wasm.mjs',
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
