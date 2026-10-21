import type { InferenceSession, SessionOptions, Tensor } from 'onnxruntime-web'

/**
 * Tipos del motor TTS adaptado de `src/lib/supertonic/helper.js` (vendor, MIT).
 *
 * El `.d.ts` hermano de un `.js` sin tipos: permite importar el motor desde
 * TypeScript sin `allowJs` ni `any` en el consumidor.
 */

export interface InferenceResult {
  wav: number[]
  duration: number[]
}

export declare class Style {
  ttl: Tensor
  dp: Tensor
  constructor(ttlTensor: Tensor, dpTensor: Tensor)
}

export declare class TextToSpeech {
  sampleRate: number
  call(
    text: string,
    lang: string,
    style: Style,
    totalStep: number,
    speed?: number,
    silenceDuration?: number,
    progressCallback?: ((step: number, total: number) => void) | null,
  ): Promise<InferenceResult>
  batch(
    textList: string[],
    langList: string[],
    style: Style,
    totalStep: number,
    speed?: number,
    progressCallback?: ((step: number, total: number) => void) | null,
  ): Promise<InferenceResult>
}

export declare function loadTextToSpeech(
  onnxDir: string,
  sessionOptions?: SessionOptions,
  progressCallback?: ((name: string, index: number, total: number) => void) | null,
): Promise<{ textToSpeech: TextToSpeech; cfgs: Record<string, unknown> }>

export declare function loadVoiceStyle(voiceStylePaths: string[], verbose?: boolean): Promise<Style>

export declare function loadCfgs(onnxDir: string): Promise<Record<string, unknown>>

export declare function loadOnnx(onnxPath: string, options?: SessionOptions): Promise<InferenceSession>

export declare function writeWavFile(audioData: ArrayLike<number>, sampleRate: number): ArrayBuffer

export declare const AVAILABLE_LANGS: readonly string[]

export declare function isValidLang(lang: string): boolean
