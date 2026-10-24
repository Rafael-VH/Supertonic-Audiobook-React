# Plan de implementación por fases

Plan de ejecución de las funcionalidades que todavía no están implementadas, en el orden recomendado. El catálogo de qué existe y qué falta es [funcionalidades.md](funcionalidades.md); el diseño técnico y las mediciones, [plan-port-react.md](plan-port-react.md).

> Base: `main` en `165606e` (2026-10-24). Cada fase es un entregable verificable por separado: se puede publicar sin esperar a la siguiente.

## Cómo leer este plan

- **Tamaño**: S ≈ medio día · M ≈ 1–2 días · L ≈ 3 días o más. Son órdenes de magnitud, no compromisos.
- Cada fase declara **objetivo**, **depende de**, **tareas**, **criterios de aceptación**, **riesgos** y **esfuerzo**.
- Los criterios de aceptación son la definición de terminado: si uno no se puede verificar, la fase no está cerrada.
- Todas las fases comparten los [criterios transversales](#criterios-transversales).

## Resumen y orden

| Fase | Nombre | Funcionalidades | Tamaño | Depende de | Estado |
|---|---|---|---|---|---|
| **0** | Base mínima | Extensión real del archivo + arnés de tests de UI | S | — | 🟡 arnés hecho; extensión pendiente |
| **1** | Menos espera | Precarga del motor · ETA de cómputo | M | 0 | ✅ 2026-10-24 |
| **2** | Visibilidad | Log de síntesis | M | 0 | ⬜ |
| **3** | Base testeable | Orquestador en el dominio · tests de UI y del flujo | M | 2 | ⬜ |
| **4** | Salida útil | Cancelar con audio parcial · selector de formatos | S–M | 3 | ⬜ |
| **5** | Producto bilingüe | i18n ES/EN · Acerca de | L | 3 | ⬜ |
| **6** | Paridad con el desktop | Muestra de voz · panel de modelos · paneles separados | M | 1, 2, 5 | ⬜ |
| **7** | Estética | Temas neumo y skeuo | M | 5 | ⬜ |
| **8** | Endurecimiento | Test de humo en navegador real | S | 4 | ⬜ |

**Por qué este orden**

1. **Fase 1 primero** porque ataca la queja más cara del producto: hoy la descarga de ~400 MB empieza recién al tocar *Generar*, y no hay ninguna estimación de espera. Ambas mejoras son pequeñas y no requieren refactor.
2. **Fase 2** hace visible lo que el motor ya sabe (descargas, pasos, errores) sin cambiar el flujo; es barata y reduce el soporte.
3. **Fase 3** convierte `App.tsx` en algo testeable. Es el habilitador de cancelar con audio parcial, de i18n sin duplicar strings y de los paneles.
4. **Fase 4** entrega resultados tangibles (no perder el trabajo al cancelar, formatos explícitos) sobre la base de la fase 3.
5. **Fase 5** multiplica el alcance del producto, pero reescribir textos antes del refactor obliga a tocarlos dos veces.
6. **Fases 6–7** son paridad y cosmética: valor real, pero no bloquean nada.
7. **Fase 8** sella lo anterior con una prueba de punta a punta que los tests unitarios no cubren.

---

## Fase 0 — Base mínima (S)

**Objetivo:** dejar el terreno limpio antes de agregar funcionalidades: cerrar una inconsistencia visible y habilitar tests de UI, que hoy no existen.

**Estado:** 🟡 el arnés de tests de UI está montado (jsdom + Testing Library) y lo usa la fase 1; la extensión real del archivo sigue pendiente.

**Depende de:** nada.

### 0.1 Extensión real del archivo

Hoy el chip y el nombre de descarga están fijos a `.md`: un `.txt` se rotula como Markdown.

- Crear `src/domain/nombre-archivo.ts` con `separarNombre(nombre): { base, extension }`, tolerante a nombres sin extensión y a mayúsculas (`.MD`).
- En `App.tsx`, guardar la extensión junto al nombre base y usarla en el chip. La descarga sigue siendo `<base>.wav`.
- Tests en `tests/nombre-archivo.test.ts`: `.md`, `.markdown`, `.txt`, nombre sin extensión, varios puntos.

**Aceptación:** cargar `notas.txt` muestra `notas.txt` en el chip; la descarga sigue siendo `notas.wav`; tests nuevos en verde.

### 0.2 Arnés de tests de UI

Hoy Vitest corre sólo en entorno `node`, así que la UI no tiene red.

- Agregar `jsdom`, `@testing-library/react` y `@testing-library/user-event` como devDependencies.
- Mantener `environment: 'node'` por defecto y usar el docblock `// @vitest-environment jsdom` en los archivos de UI, para no cambiar los tests de `node` existentes.
- Crear `tests/app-layout.test.tsx` con `vi.mock('../src/data/motor-tts')` y dos casos: sin archivo la tarjeta de ajustes no existe; tras cargar un `.md` con `DataTransfer`, el panel aparece y el contenedor tiene la clase de dos columnas.
- Documentar el patrón en `docs/desarrollo.md` (sección de tests).

**Aceptación:** `npm test` corre los tests de `node` + los nuevos de UI sin tocar los existentes; el mock del motor impide cualquier descarga real.

**Riesgo:** `jsdom` no implementa `DataTransfer` ni `URL.createObjectURL` de forma completa. Mitigación: pequeños stubs locales en el test, no polyfills globales.

---

## Fase 1 — Menos espera: precarga y ETA (M)

**Objetivo:** que la primera conversión se sienta mucho menos larga sin tocar el modelo ni el hosting: adelantar el trabajo y decir cuánto falta.

**Estado:** ✅ implementada el 2026-10-24 en `src/ui/useMotor.ts`, `src/domain/eta.ts` y `App.tsx`, con 14 tests nuevos (39 → 53 en total).

**Depende de:** fase 0 (tests de UI para no romper el layout mientras se toca `App.tsx`).

### 1.1 Precarga del motor al elegir archivo

Hoy `prepararMotor()` se llama dentro de `generar()`, así que los ~400 MB empiezan a bajar recién cuando el usuario ya eligió voz y pasos.

- Extraer el estado del motor a un hook `src/ui/useMotor.ts` con `estado: 'inactivo' | 'preparando' | 'listo' | 'error'` y `preparar()`.
- `procesarArchivo()` dispara `void preparar()` después de aceptar el archivo. La promesa existente de `inicializarMotor()` ya deduplica: si el usuario toca *Generar* mientras carga, se espera la misma promesa y no hay segunda descarga.
- El error de precarga **no** se muestra como error rojo: se registra y se reintenta al generar. Un archivo válido nunca debe quedar bloqueado por una precarga fallida.
- La línea de estado existente informa el avance de la precarga; el botón sigue habilitado (no bloquea la edición de ajustes).
- Si el usuario cambia de archivo durante la precarga, no se reinicia nada: los pesos son los mismos.

**Aceptación:**

- Elegir un `.md` inicia la descarga/verificación sin tocar *Generar*.
- Con la precarga en curso, *Generar* no abre una segunda carga (una sola secuencia de eventos de descarga).
- Con los modelos en caché, elegir archivo no muestra "Descargando".
- Si la precarga falla, *Generar* reintenta y funciona.

**Riesgo:** competir por red y CPU con la lectura del archivo. Es marginal (leer un `.md` es instantáneo) y el `postMessage` del worker no bloquea la UI.

### 1.2 ETA de cómputo

Hoy la UI muestra la duración estimada del **audio** (`~N min`), no la espera de **cómputo**, que con RTF ~1,8 parece colgada.

- Crear `src/domain/eta.ts`, puro y testeable:

  ```ts
  type Avance = { caracteresHechos: number; audioSegundos: number; ms: number }
  // Devuelve null hasta que haya audio medido.
  estimarRestante(avance: Avance, caracteresTotales: number): number | null
  ```

  Con el primer segmento se calculan dos ratios reales del equipo: segundos de audio por carácter y RTF (`ms / 1000 / audioSegundos`). El restante es `caracteresRestantes × segundosPorCarácter × RTF`. No se usa un RTF de tabla porque depende del hardware.
- En `App.tsx`, mostrar `faltan ≈ X min` junto a la barra **sólo después del primer segmento**; antes, una nota de que la estimación aparece al terminar el primero. Formato corto: `~4 min restantes`.
- Suavizar con una media de los últimos dos segmentos para que el número no salte; redondear a minutos arriba de 60 s y a "menos de 1 min" por debajo.
- Al cancelar, se descarta.

**Aceptación:**

- Tras el primer segmento aparece una estimación.
- La estimación es monótona decreciente en una corrida sin sobresaltos y llega a 0 al terminar.
- En la corrida de referencia (1.379 caracteres) el error final queda por debajo del 40 %. Se mide y se anota en el plan; no se ajusta a ojo.
- Tests de `eta.ts`: sin audio devuelve `null`, escala proporcional, no divide por cero, ignora caracteres restantes negativos.

**Riesgo:** una primera estimación mala por un segmento atípico. Mitigación: etiqueta "estimado" y suavizado; nunca bloquea la corrida.

**Esfuerzo:** 1.1 S · 1.2 S–M.

---

## Fase 2 — Log de síntesis (M)

**Objetivo:** reemplazar la línea única de estado por un registro consultable, como el de la app de escritorio, sin duplicar información.

**Depende de:** fase 0. No depende de la fase 1, pero conviene después para no registrar mensajes de un flujo que va a cambiar.

- Crear `src/ui/useRegistro.ts`: `{ lineas, agregar(nivel, mensaje), limpiar() }` con niveles `info | avance | exito | error`, id incremental y hora. Tope de 200 líneas (descarta las más viejas).
- Crear `src/ui/Registro.tsx`: panel con `role="log"`, altura máxima ~12 rem, scroll propio, autoscroll sólo si el usuario está al final, y botón *Limpiar*. Colapsable en pantallas angostas.
- Enrutar `anunciar()` a los dos destinos: la línea de estado sigue mostrando **lo último** (accesible con `aria-live`), y el registro acumula el historial. No se duplica el texto en voz alta.
- Registrar: inicio de carga de modelos, cada archivo de descarga, voz cargada, segmento `i/n`, cada 10 pasos de denoising (no los 5 de cada segmento), cancelación, resultado con RTF y errores con su mensaje.
- Limpiar el registro al iniciar una corrida; conservarlo al cambiar de archivo hasta la próxima generación.

**Aceptación:**

- Una corrida completa deja un historial legible con modelo, voz, segmentos y resultado.
- Con la lista scrolleada hacia arriba, un mensaje nuevo no arrastra el scroll.
- El panel no aparece sin archivo cargado (coherente con los ajustes).
- Tests de `useRegistro` (tope de líneas, niveles, limpieza) y de `Registro` (render y autoscroll).

**Riesgo:** el log compite por espacio con los ajustes en la columna derecha. Mitigación: el registro va debajo de los ajustes y con altura máxima fija; en móvil queda colapsado.

---

## Fase 3 — Base testeable: orquestador y tests (M)

**Objetivo:** sacar el flujo de `App.tsx` y cubrirlo con tests, antes de tocar la salida y los textos.

**Depende de:** fase 2 (el registro ya define qué eventos hay que emitir).

- Crear `src/domain/procesar-archivo.ts` con las dependencias inyectadas, como el `ProcesarArchivo` del desktop:

  ```ts
  type Motor = { sintetizar(opciones): Promise<{ muestras: Float32Array; sampleRate: number }> }
  type Resultado = {
    muestras: Float32Array[]      // segmentos completados, en orden
    sampleRate: number
    segmentosTotales: number
    cancelado: boolean
    ms: number
  }
  procesar(opciones: {
    texto: string
    sintesis: { lang: string; pasos: number; velocidad: number }
    motor: Motor
    debeCancelar: () => boolean
    alProgreso: (hecho: number, total: number, paso: number) => void
    alRegistro: (nivel: Nivel, mensaje: string) => void
  }): Promise<Resultado>
  ```

- `App.tsx` queda con el estado de UI y la traducción de eventos; deja de tener el bucle.
- Tests de `procesar-archivo` con un motor falso: corrida completa, cancelación antes del primer segmento, cancelación entre segmentos (devuelve los completados), error del motor, texto vacío.
- Ampliar los tests de UI: editar el texto actualiza los chips; el selector de voz persiste en `localStorage`; *Generar* se deshabilita sin texto; el mock del motor simula progreso.

**Aceptación:**

- `App.tsx` no contiene bucles de síntesis ni cálculos de WAV.
- Tests: los 39 actuales + los de fase 0/2 + ~12 nuevos, todos en verde.
- `npm run build` sigue pasando sin cambios en el bundle del worker.

**Riesgo:** refactor sin red hasta tener los tests. Mitigación: escribir los tests del orquestador contra el código actual como referencia antes de mover el bucle; hacerlo en un solo commit verificable.

---

## Fase 4 — Salida útil (S–M)

**Objetivo:** no perder el trabajo al cancelar y dejar explícito qué formatos existen.

**Depende de:** fase 3 (el orquestador devuelve los segmentos completados).

### 4.1 Cancelar con audio parcial

- Si `resultado.muestras.length > 0`, concatenar y ofrecer el WAV de lo generado, con la etiqueta "Audio parcial (N de M segmentos)".
- Si no hay ningún segmento completo, mantener el mensaje actual y no generar archivo.
- El nombre de descarga se mantiene; el detalle aclara que es parcial.

**Aceptación:** cancelar a mitad produce un WAV reproducible de los segmentos completados; cancelar en el primero no produce archivo; el motor sigue cargado y un segundo intento no descarga.

### 4.2 Selector de formatos

- Crear `src/domain/formato.ts` con `FORMATOS` (`wav` disponible; `mp3`, `ogg`, `flac` no) y `normalizarFormatos`, con tests.
- Mostrar en ajustes un grupo de opciones: WAV seleccionado, el resto deshabilitado con "próximamente". Sin encoders nuevos: la salida sigue siendo WAV.
- No persistir la selección mientras haya una sola opción real; cuando se sume un encoder, se agrega a `Ajustes` con normalización.

**Aceptación:** la UI refleja el estado real (WAV sí, resto no) y no promete descargas que no existen; tests de `normalizarFormatos`.

**Riesgo:** que el selector se lea como una regresión ("antes no había y ahora está deshabilitado"). Mitigación: texto de ayuda "MP3, OGG y FLAC requieren un codificador extra; hoy se entrega WAV".

---

## Fase 5 — Producto bilingüe: i18n y Acerca de (L)

**Objetivo:** que la app hable inglés además de español y que las licencias y créditos sean visibles, requisito del port.

**Depende de:** fase 3 (sin extraer el flujo, cada texto se toca dos veces).

### 5.1 i18n ES/EN

- Agregar `idioma: 'es' | 'en'` a `Ajustes` (idioma de **interfaz**, distinto de `lang` de la voz) con normalización y persistencia.
- Crear `src/i18n/es.ts` y `src/i18n/en.ts` con un objeto tipado: `type Claves = keyof typeof es`, y `en` declarado como `Record<Claves, string>`. Un texto faltante rompe `tsc`, no la UI.
- Migrar **todos** los textos visibles: títulos, botones, chips, mensajes de estado, errores, `aria-label`, niveles del registro, nota de pasos y textos del `<dialog>`.
- `document.documentElement.lang` sigue al idioma elegido; el título de la página no cambia (es marca).
- Test de paridad de claves y de cambio de idioma en la UI (los textos cambian sin recargar).

**Aceptación:** alternar ES/EN traduce toda la interfaz, persiste tras recargar y no queda ningún string en español fuera del diccionario (revisión con búsqueda de texto literal en `App.tsx`).

### 5.2 Acerca de

- Componente `src/ui/AcercaDe.tsx` con `<dialog>` nativo: versión, licencia del código, licencia OpenRAIL-M de los pesos, atribución a Supertone Inc., links al repo del vendor y a Hugging Face.
- La versión sale de `package.json` vía `define` en `vite.config.ts` (sin importar el JSON en runtime).
- Abrir desde el panel de ajustes; cerrar con `Esc`, con el botón y con clic en el fondo. Foco inicial en el botón de cerrar.

**Aceptación:** el diálogo se abre y cierra por teclado; los créditos coinciden con el README; tests de apertura/cierre y de que el nombre accesible existe.

**Riesgo:** i18n puede crecer a reescribir copys. Mitigación: sólo se traduce lo existente; no se agregan textos nuevos salvo los de *Acerca de*.

---

## Fase 6 — Paridad con el desktop (M)

**Objetivo:** cerrar las tres funciones de la app de escritorio que todavía faltan y que no dependen de infraestructura nueva.

**Depende de:** fase 1 (motor preparado), fase 2 (registro) y fase 5 (textos y diálogos traducidos).

### 6.1 Muestra de voz

- Botón *Escuchar* junto al selector de voz: sintetiza una frase corta por idioma (20–40 caracteres) con la voz y el idioma elegidos y la reproduce.
- Reutiliza `inicializarMotor()` (ya preparado) y `cargarVoz()`; si cambió la voz, recarga el estilo.
- Un solo elemento `Audio` reutilizado; se revoca el `objectURL` anterior.
- Deshabilitado durante una generación; errores al registro.

**Aceptación:** la muestra suena con la voz elegida, dura pocos segundos, no interfiere con una generación y no vuelve a descargar los modelos.

### 6.2 Panel de modelos

- `src/ui/PanelModelos.tsx`: lista lo que devuelve `listarCache()` con tamaño legible y total; botón *Borrar caché* con confirmación.
- Advertir que borrar no afecta la sesión en curso (el worker mantiene las sesiones), pero la próxima visita vuelve a descargar ~400 MB.
- Deshabilitado mientras hay una generación.

**Aceptación:** muestra las 7 entradas tras una corrida; el total ronda 401 MB; borrar vacía la lista; recargar y generar vuelve a descargar.

### 6.3 Paneles separados

- Con archivo cargado: arriba de 820 px (el breakpoint que ya existe), dos columnas (texto / ajustes + registro + resultado); por debajo, dos pestañas *Entrada* y *Síntesis* que preservan el estado al cambiar.
- Sin archivo, se mantiene el estado vacío actual.
- Accesible: `role="tablist"`, `aria-selected`, foco conservado.

**Aceptación:** a 1280 px se ven las dos columnas; a 600 px las pestañas cambian sin perder texto ni ajustes; sin desborde horizontal en 320 px.

**Riesgo:** es la función de menor valor de la lista. Si el cronograma aprieta, se pospone completa: no bloquea nada.

---

## Fase 7 — Estética: temas neumo y skeuo (M)

**Objetivo:** cumplir la paridad visual del desktop sin comprometer legibilidad.

**Depende de:** fase 5 (selectores traducidos y persistencia ya extendida).

- Agregar `estilo: 'material' | 'neumo' | 'skeuo'` a `Ajustes` con normalización y default `material`.
- `data-estilo` en `<html>`; los temas se implementan con variables CSS (`--sombra`, `--borde`, gradientes de superficie), no con reglas duplicadas por componente.
- Selector en ajustes con los tres estilos.
- Verificar contraste de texto y foco en las 6 combinaciones (3 estilos × 2 temas) con `getComputedStyle`, no a ojo.
- Tests de persistencia y de que `data-estilo` cambia.

**Aceptación:** cambiar de estilo no mueve el layout ni rompe controles; el anillo de foco sigue visible; ninguna combinación baja el contraste por debajo de lo actual.

**Riesgo:** neumorfismo con sombras suaves puede perder affordance en botones. Mitigación: bordes y foco explícitos se mantienen en todos los estilos.

---

## Fase 8 — Endurecimiento: test de humo real (S)

**Objetivo:** cubrir el único tramo que los tests unitarios no pueden: motor real, red real y WAV resultante.

**Depende de:** fase 4 (flujo de salida estable).

- Script `scripts/humo.mjs` con Playwright, **opt-in** (`HUMO=1 npm run humo`), que levante `npm run preview`, cargue un `.md` de prueba, espere el audio, verifique que el WAV tiene cabecera RIFF válida y que una segunda corrida no descarga.
- No se ejecuta en CI: descarga 398 MB y depende de Hugging Face.
- Documentar el runbook y el último resultado en `docs/desarrollo.md`, con fecha y equipo.

**Aceptación:** una corrida verde registrada (fecha, navegador, RTF medido) y el runbook reproducible por otra persona.

---

## Criterios transversales

Todas las fases, sin excepción:

1. **Tests y typecheck**: `npm test` y `npm run build` en verde. Si la fase agrega lógica, agrega tests; si toca la UI, al menos un test de componente.
2. **Checklist manual** de `docs/desarrollo.md` para lo que los tests no cubren (build real, consola limpia, caché en caliente).
3. **Documentación**: actualizar la fila correspondiente en [funcionalidades.md](funcionalidades.md) y, si cambia el estado por fase, la tabla de [plan §0](plan-port-react.md#0-estado-de-implementación-2026-10-24).
4. **Alcance**: no se toca `helper.js`, no se cambian los defaults de §2.3, no se auto-hospedan los pesos, no se reactiva WebGPU.
5. **Commits**: uno por funcionalidad (o uno por fase si son inseparables), con mensaje convencional en español y el estado de verificación en el cuerpo.
6. **Sin linter ni formatter**: el typecheck es la red; no se introduce tooling nuevo en estas fases.

## Riesgos del plan

| Riesgo | Fase | Impacto | Mitigación |
|---|---|---|---|
| Refactor de `App.tsx` sin tests | 3 | Alto | Fase 0 monta el arnés; los tests del orquestador se escriben contra el comportamiento actual antes de mover código |
| ETA engañosa por hardware o segmentos atípicos | 1 | Medio | Calibración con el primer segmento, suavizado y etiqueta "estimado" |
| Precarga fallida bloquea la primera conversión | 1 | Medio | El error se registra, no se muestra en rojo y *Generar* reintenta |
| i18n incompleta o textos duplicados | 5 | Medio | Diccionario tipado: una clave faltante rompe `tsc`; test de paridad |
| Audio parcial grande en memoria | 4 | Bajo | Se mantiene el comportamiento actual (todo en RAM); streaming a OPFS queda fuera de alcance |
| Borrar caché con el motor cargado confunde | 6 | Bajo | Aviso explícito de que la sesión sigue viva y la próxima visita re-descarga |
| Temas con contraste insuficiente | 7 | Bajo | Verificación con `getComputedStyle` en las 6 combinaciones |

## Decisiones abiertas (con recomendación)

1. **¿ETA antes del primer segmento?** Recomendado: no. Cualquier RTF fijo sería ficción en otro hardware; se muestra sólo la duración del audio hasta tener una medición real.
2. **¿Segundo botón "Detener ahora"?** Recomendado: no en estas fases. La cancelación cooperativa ya evita recargar el modelo; se reevalúa si aparece como queja real.
3. **¿Pestañas de entrada/síntesis?** Recomendado: sólo como adaptación por debajo de 820 px (fase 6). En escritorio, dos columnas ya resuelven el espacio.
4. **¿Idioma de la muestra de voz?** Recomendado: el mismo `lang` elegido para la síntesis; no un selector aparte.
5. **¿Los tests de UI en `npm test`?** Recomendado: sí, con entorno `jsdom` por archivo; el costo es de milisegundos, no de red.

## Fuera de alcance

No forman parte de este plan, por decisión: multiarchivo o carpetas, encoders MP3/OGG/FLAC, backend de síntesis, PWA/offline, auto-hospedaje de los pesos, WebGPU activo, cuantización de los ONNX y streaming del WAV a OPFS. Los motivos están en [funcionalidades.md](funcionalidades.md#fuera-de-alcance).

## Seguimiento

- Estado por funcionalidad: [funcionalidades.md](funcionalidades.md).
- Estado por fase del port y mediciones: [plan-port-react.md §0](plan-port-react.md#0-estado-de-implementación-2026-10-24).
- Al cerrar una fase, actualizar las dos tablas anteriores en el mismo commit que el código.
