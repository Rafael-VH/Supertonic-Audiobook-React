# Supertonic AudioBook (web)

Convertí un archivo Markdown o de texto en un audiolibro en WAV. La síntesis de voz corre **entera en tu navegador**: el texto no se sube a ningún servidor.

**[Abrir la app →](https://rafael-vh.github.io/Supertonic-Audiobook-React/)**

## Cómo se usa

1. **Cargá el archivo.** Arrastrá un `.md`, `.markdown` o `.txt` a la zona de carga, o hacé clic para elegirlo. Se limpia el Markdown (títulos, negritas, enlaces, código) y podés revisar o editar el texto resultante.
2. **Ajustá la voz.** Al cargar el archivo aparece el panel de ajustes al lado del texto: voz, idioma, pasos y velocidad.
3. **Generá el audio.** El botón *Generar audio* sintetiza el texto por segmentos y muestra el avance.
4. **Descargalo.** Al terminar tenés un reproductor y el botón *Descargar `<nombre>`.wav*.

## La primera vez tarda: ~400 MB

La primera vez se descargan los pesos del modelo (~400 MB) desde Hugging Face y quedan guardados en el navegador. Las visitas siguientes no los vuelven a bajar, siempre que no borres los datos del sitio.

La descarga arranca apenas elegís el archivo, en segundo plano, así que se solapa con el tiempo que tardás en revisar el texto y elegir la voz. La espera depende de tu conexión: con 20 Mbps son unos 3 minutos; con 50 Mbps, alrededor de 1 minuto. Después hay una carga fija de unos 10–30 segundos para preparar el motor.

## Los ajustes

| Control | Qué hace |
|---|---|
| **Voz** | 10 voces: M1–M5 masculinas y F1–F5 femeninas. Por defecto, M1. |
| **Idioma** | 31 idiomas, más *Automático* para que lo deduzca el modelo. Por defecto, español. |
| **Pasos** | De 5 a 12. Más pasos dan mejor calidad a cambio de más tiempo de cómputo. Por defecto, 5. |
| **Velocidad** | De 0,7× a 2×. Por defecto, 1,1×. |

Se guardan en tu navegador y se recuperan en la próxima visita. También se recuerda el tema claro u oscuro.

## Cuánto tarda la síntesis

Depende casi por completo de tu procesador, porque la inferencia corre en CPU (WASM). En un portátil de 2011 medimos unos **1,8 segundos de cómputo por cada segundo de audio** con 5 pasos: 5 minutos de audio tardaron unos 9 minutos. En un equipo moderno debería ser bastante más rápido, pero no está medido.

Mientras se genera, la app muestra cuánto falta con una estimación basada en lo que midió en tu propio equipo; aparece al terminar el primer segmento, no antes.

Conclusión práctica: sirve muy bien para artículos, notas y capítulos cortos; un audiolibro completo de varias horas puede llevar mucho tiempo. Bajar los pasos a 5 (el valor por defecto) ya es el atajo más efectivo.

## Privacidad

El texto se procesa en la pestaña y nunca se envía a un servidor. La única conexión externa es la descarga de los pesos del modelo desde Hugging Face; una vez cacheados, la app funciona sin red.

## Requisitos

- Un navegador de escritorio moderno con WebAssembly: Chrome, Edge, Firefox o Safari recientes. Probado en Chrome y Edge de escritorio y en un celular Android; Firefox y Safari no están verificados.
- Alrededor de 1 GB de memoria libre y ~400 MB de espacio de almacenamiento del navegador.
- Una conexión estable la primera vez.

## Limitaciones conocidas

- **Un archivo por vez** y una única salida en WAV (44,1 kHz, PCM 16 bits).
- **Sólo WAV**: MP3, OGG y FLAC todavía no están implementados.
- **Cancelar** corta al terminar el segmento en curso (puede tardar algunos minutos en equipos lentos), a cambio de no volver a cargar el modelo.
- **WebGPU está desactivado**: en GPUs móviles ONNX Runtime 1.30 devuelve audio corrupto sin lanzar ningún error. Se usa WASM multihilo.
- La interfaz está en español por ahora.

## Créditos y licencias

- Modelo de voz: **Supertonic 3**, de Supertone Inc. — licencia [OpenRAIL-M](https://huggingface.co/Supertone/supertonic-3). Los pesos se descargan desde su repositorio en Hugging Face; no están incluidos en este repo.
- `src/lib/supertonic/helper.js` es una copia del port web del vendor, [`supertone-oss-archive/supertonic`](https://github.com/supertone-oss-archive/supertonic) — licencia MIT.
- [ONNX Runtime Web](https://onnxruntime.ai/) — licencia MIT.
- [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) — licencia MIT.

## Para desarrolladores

- [docs/funcionalidades.md](docs/funcionalidades.md): catálogo de todo lo que hace la app y de lo que está planificado, con el estado de cada funcionalidad.
- [docs/plan-implementacion.md](docs/plan-implementacion.md): plan de ejecución por fases de lo que falta, con tareas, criterios de aceptación y riesgos.
- [docs/desarrollo.md](docs/desarrollo.md): cómo correr el proyecto, arquitectura, tests, deploy y problemas conocidos.
- [docs/plan-port-react.md](docs/plan-port-react.md): plan del port desde la app de escritorio, decisiones técnicas y mediciones.
