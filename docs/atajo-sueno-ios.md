# Atajo iOS "Plan Hugo Health" — corregir el sueño (método de ventana)

## Por qué

El atajo que corre cada noche y postea la sección `health` al bridge venía **inflando el sueño**:
**sumaba la duración de cada muestra** de sueño de la noche. Como varias apps escriben la misma
noche en Salud (el picker de Fuente muestra **5**: `Apple Watch de Hugo`, `AutoSleep`, `HeartWatch`,
`Salud`, `Sleep Cycle`) y sus muestras se **solapan**, la suma se dispara → noches de 11-23 h
(p. ej. los **15.2 h** que aparecieron en la tarjeta Sueño).

La app ya se blindó con un guard que **descarta todo sueño > 14 h**
(`sanitizeSleepHours` / `MAX_PLAUSIBLE_SLEEP_H = 14` en **`src/fields.mjs`**), así que un valor
inflado ya no entra —pero entonces el día queda **sin dato de sueño**. La corrección de raíz es del
lado del atajo. Este arreglo es **device-side** (app Atajos en el iPhone), no toca el código del repo.

## Lo que NO funciona (probado el 2026-07-01)

Antes de llegar al método bueno se descartaron dos caminos "obvios":

1. **Filtrar por `Fuente = Apple Watch`** (como se hizo con pasos y energía activa) → **devuelve
   CERO muestras** para el sueño. Se probó con las 5 fuentes, una por una: **todas dan cero**. El
   filtro de Fuente de Atajos **no funciona** sobre muestras de Análisis de sueño (limitación de
   Shortcuts). **Este es el bloqueador central:** no se puede deduplicar por fuente.

2. **Sumar la duración solo de las muestras `Asleep`** → sigue inflando, porque las 5 apps
   escriben `Asleep` para la misma noche y esas muestras se solapan. `Valor es Asleep` saca el
   "In Bed" pero **no** el solape entre apps.

> Los valores de sueño en Salud están en **inglés** (`Asleep`, `In Bed`, `Awake`), no en español.

## El cambio — método de ventana

En vez de **sumar duraciones** (sensible al solape y al nº de apps), medir la **ventana de sueño**:

```
ventana = (máxima Fecha de fin de la noche) − (mínima Fecha de inicio de la noche)
```

Esto es **inmune al solape**: da igual cuántas apps escriban la misma noche ni cuánto se pisen —
la ventana entre el primer "me dormí" y el último "me desperté" es la misma. Y **no depende del
filtro de Fuente** (que está roto).

Pasos en el atajo, reemplazando el bloque que suma:

1. **Buscar muestras de salud** — Tipo **Análisis de sueño** (Sleep Analysis), Valor **es `Asleep`**
   (incluye subfases `Core/Deep/REM`; excluye `In Bed` y `Awake`). **Sin** filtro de Fuente.
   Ventana temporal: **Fecha de inicio en el último 1 día** (no exijas además "fin es hoy": esa
   combinación devolvió cero al mediodía).
2. **Mínima Fecha de inicio** de las muestras encontradas y **máxima Fecha de fin**.
   - En Shortcuts, para sacar mín/máx hay que convertir cada fecha a número (segundos desde una
     referencia) con "Obtener fechas del texto" / "Formato de fecha" → número, luego usar
     "Obtener número mínimo/máximo" del listado.
3. **Resta**: `máxFin − mínInicio` en segundos → **÷ 3600** → horas. Redondea a 1 decimal.
4. Guarda en la variable `SuenoHoras` y postea igual que hoy.

> Sesgo conocido: si hubo un despertar largo en medio de la noche, la ventana lo cuenta como sueño
> (sobrestima un poco). Es un error de minutos, muchísimo menor que el **×5** de sumar solapes, y
> queda holgadamente bajo el guard de 14 h. Aceptable.

## Arquitectura (dónde encaja este atajo)

"Sueño" es un **sub-atajo**: solo **calcula y devuelve** las horas (su última acción, `SuenoHoras`,
es el output). **No postea nada por sí mismo.** El que envía al bridge es el atajo maestro **"Plan
Hugo Health"**, que corre los sub-atajos y arma el POST:

```
Plan Hugo Health:
  Fecha actual → Aplicar formato (yyyy-MM-dd)
  Ejecutar Steps    → variable Pasos
  Ejecutar Calorias → variable EnergiaActiva
  Ejecutar FC       → variable FCReposo
  Ejecutar Vo2max   → variable VO2
  Ejecutar Sueño    → variable SuenoHoras     ← consume ESTE atajo
  Obtener contenido de URL (POST al bridge con todas las variables)
```

Por eso arreglar "Sueño" arregla el pipeline completo: "Plan Hugo Health" usa su resultado tal cual.

## El POST (lo hace "Plan Hugo Health")

El contrato del bridge no cambia. Se postea a la sección `health`:

```json
{
  "op": "add",
  "section": "health",
  "today": "2026-07-01",
  "entries": [
    { "date": "2026-07-01", "sleepHours": 6.4, "source": "apple-health" }
  ]
}
```

- URL: `<BRIDGE_URL>?k=<BRIDGE_TOKEN>` (ver la tabla en `skills/food-tracker/SKILL.md`).
- Método POST vía la acción "Obtener contenido de URL"; sigue el redirect (como `curl -sL`).
- `sleepHours` debe quedar **≤ 14** tras el fix; si por lo que sea llega > 14, el guard de la app
  lo descarta (no plantará "15 h"), pero el objetivo es que ya no ocurra.

## Editar el atajo — dónde

- La acción "Buscar muestras" y sus filtros **no se ven bien en el Mac**, y macOS suele conceder
  Atajos en tier "click" (sin escribir ni arrastrar acciones) → **edita el atajo en el iPhone**.

## Automatización (auto-ejecución, para no olvidar correrlo)

"Plan Hugo Health" envía **todo junto** en cada corrida (sueño + pasos + energía + FC + VO2), no por
partes. Para que corra solo se usan **dos Automatizaciones personales apuntando al MISMO atajo**:

- **09:30 diario** → captura el **sueño** de la noche recién sincronizado (ventana sin siestas) y la
  actividad parcial de la mañana.
- **21:30 diario** → captura la **actividad completa** del día (pasos/energía/FC finales); como el
  merge del bridge es "último valor no vacío gana", sobrescribe los parciales de la mañana.

Cómo crearlas (iPhone, se repite dos veces cambiando la hora):
`Atajos → pestaña Automatización → + → Crear automatización personal → Hora del día → 09:30 (y otra
a 21:30) → Diariamente → Siguiente → Ejecutar atajo → "Plan Hugo Health" → activar` **Ejecutar
inmediatamente** `(NO "Preguntar antes") → Listo`.

> Caveat de la corrida de 21:30: recalcula el sueño, y en un día con **siesta** la ventana "últimos
> 1 día" la incluye → el sueño puede inflarse (> 14 h). No es grave: el guard de la app descarta todo
> sueño > 14 h, así que la app sigue mostrando el valor bueno de la mañana; solo el bridge queda con
> un número feo ese día. Si molesta, la alternativa prolija es una copia del maestro **sin** el paso
> `Ejecutar Sueño` para las 21:30 (así el sueño solo lo escribe la corrida de las 09:30).

## Verificar

- A la mañana siguiente, abre la app → **Salud** → tile **Sueño**: el valor debe ser realista
  (5-8 h) y el sparkline muestra la **línea de umbral 6 h** con las noches bajo el umbral marcadas.
- El backfill histórico (`tooling/import-takeout.mjs`) ataca el mismo solape pero con más precisión
  que el atajo: **fusiona los intervalos solapados y suma los disjuntos** (`mergeIntervals` en
  `takeout-parse.mjs`), así descarta los despertares entre bloques que la ventana `máx−mín` sí
  contaría. Hace **gap-fill**: solo rellena noches sin dato o con el valor inflado (> 14 h); un dato
  bueno del Watch (≤ 14 h) **se respeta**, así que este atajo y el backfill no se pisan.

## Estado (handoff, 2026-07-01)

- **Atajo "Sueño" reconstruido con método de ventana → VERIFICADO.** El 01-jul "Plan Hugo Health"
  corrió y escribió sueño **6.5 h** (realista) + pasos/energía/FC/VO2. Contraste con días previos del
  atajo roto en el bridge: 29-06 = 26.3 h, 30-06 = 15.2 h, 27-06 = 14.6 h. El fix quedó demostrado.
- **Backfill Takeout corrido:** 175 noches (2022→2026), METs (19 workouts) y curva FC (10 workouts).
  Creds del bridge en `skills/food-tracker/SKILL.md` (leerlas de ahí, nunca inline).
- **Formato de fecha (no rompe nada):** el atajo escribe `DD-MM-YY` (`01-07-26`) y el backfill escribió
  `YYYY-MM-DD` (`2026-07-01`). El bridge guarda ambos keys, pero la app los reconcilia: `healthDateKey`
  (`src/sync.mjs`) normaliza los dos al mismo día, y el guard `sanitizeSleepHours` (`src/fields.mjs`)
  descarta los inflados > 14 h del atajo viejo, dejando el valor limpio. Bridge con keys redundantes =
  cosmético, no requiere limpieza.
- **Único pendiente (device-side):** crear las 2 Automatizaciones (09:30 y 21:30) en el iPhone — ver
  sección "Automatización" arriba.
