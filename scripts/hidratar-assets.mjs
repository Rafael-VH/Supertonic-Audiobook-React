import fs from 'node:fs'
import path from 'node:path'

const HF_BASE = 'https://huggingface.co/Supertone/supertonic-3/resolve/main'

const ONNX_FILES = [
  'tts.json',
  'unicode_indexer.json',
  'duration_predictor.onnx',
  'text_encoder.onnx',
  'vector_estimator.onnx',
  'vocoder.onnx',
]

// Voces reales de Supertonic 3: 5 masculinas + 5 femeninas
const VOICE_STYLE_FILES = [
  ...Array.from({ length: 5 }, (_, i) => `M${i + 1}.json`),
  ...Array.from({ length: 5 }, (_, i) => `F${i + 1}.json`),
]

const onnxDir = path.resolve('assets/onnx')
const voiceDir = path.resolve('assets/voice_styles')

fs.mkdirSync(onnxDir, { recursive: true })
fs.mkdirSync(voiceDir, { recursive: true })

async function descargar(url, destino) {
  if (fs.existsSync(destino)) {
    const stats = fs.statSync(destino)
    if (stats.size > 0) {
      console.log('existe', path.basename(destino), `(${Math.round(stats.size / 1024)} KB)`)
      return
    }
  }

  console.log('descargando', url)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destino, buf)
  console.log('ok', path.basename(destino), `(${Math.round(buf.length / 1024)} KB)`)
}

async function main() {
  for (const f of ONNX_FILES) {
    await descargar(`${HF_BASE}/onnx/${f}`, path.join(onnxDir, f))
  }
  for (const f of VOICE_STYLE_FILES) {
    await descargar(`${HF_BASE}/voice_styles/${f}`, path.join(voiceDir, f))
  }
  console.log('assets listos en assets/')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})