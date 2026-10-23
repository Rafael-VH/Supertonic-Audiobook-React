/**
 * Codificación WAV PCM16.
 *
 * Replica `writeWavFile()` de `lib/supertonic/helper.js` (MIT) para poder
 * codificar en el hilo principal sin importar `helper.js`, que arrastra ORT
 * entero al bundle de la UI.
 */
export function muestrasAWav(muestras: Float32Array, sampleRate: number): ArrayBuffer {
  const bitsPerSample = 16
  const numChannels = 1
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataSize = muestras.length * 2

  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const escribir = (offset: number, texto: string) => {
    for (let i = 0; i < texto.length; i++) view.setUint8(offset + i, texto.charCodeAt(i))
  }

  escribir(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  escribir(8, 'WAVE')
  escribir(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  escribir(36, 'data')
  view.setUint32(40, dataSize, true)

  const pcm = new Int16Array(muestras.length)
  for (let i = 0; i < muestras.length; i++) {
    const limitado = Math.max(-1, Math.min(1, muestras[i]))
    pcm[i] = Math.floor(limitado * 32767)
  }
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer))

  return buffer
}
