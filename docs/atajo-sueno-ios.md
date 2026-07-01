# Atajo iOS "Plan Hugo Health" — corregir el sueño (Asleep-only, Apple Watch)

## Por qué

El atajo que corre cada noche y postea la sección `health` al bridge venía **inflando el sueño**:
sumaba muestras **"In Bed"** (tiempo en cama) + **"Asleep"** (tiempo dormido), que se **solapan**
→ noches de 15-23 h (p. ej. los 15.2 h que aparecieron). Es el mismo bug de solapamiento
multi-fuente que trae Google Fit. La app ya se blindó con un guard que **descarta todo sueño
> 14 h** (`sanitizeSleepHours` en `src/dates.mjs`), así que un valor inflado ya no entra —pero
entonces el día queda **sin dato de sueño**. La corrección de raíz es del lado del atajo.

Este arreglo es **device-side** (app Atajos en el iPhone), no toca el código del repo.

## El cambio

En la acción del atajo que lee el sueño de Salud:

1. **Solo "Asleep", nunca "In Bed".**
   - En "Buscar muestras de salud" (Find Health Samples) elige el tipo **Análisis de sueño**
     (Sleep Analysis) y filtra **Valor = Dormido/Asleep** (en iOS reciente: `Asleep` y sus
     subfases `Core/Deep/REM`; **excluye `In Bed` y `Awake`**).
   - Con eso desaparece el solapamiento In-Bed + Asleep dentro del propio reloj.

2. **Fuente = Apple Watch.**
   - Agrega un filtro **Fuente (Source) = Apple Watch** (o "reloj de Hugo"), igual que ya se hace
     para pasos y energía activa (ver memorias `salud-pasos-doble-conteo` y
     `salud-energia-activa-discrepancia`). Así no se cuentan muestras duplicadas que el iPhone
     u otras apps escriben en Salud.
   - Nota: la acción "Buscar muestras" y su filtro de Fuente **no se ven en el Mac**; hay que
     editar el atajo **en el iPhone**.

3. **Suma la duración y convierte a horas.**
   - Suma la duración de las muestras Asleep de la noche y divídela por 3600 (o usa "Duración"
     de cada muestra). Redondea a 1 decimal.

## El POST (idéntico al de hoy)

El contrato del bridge no cambia. El atajo sigue posteando a la sección `health`:

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

## Verificar

- A la mañana siguiente, abre la app → **Salud** → tile **Sueño**: el valor debe ser realista
  (5-8 h) y el sparkline muestra la **línea de umbral 6 h** con las noches bajo el umbral marcadas.
- El backfill histórico (`tooling/import-takeout.mjs`) hace **gap-fill**: solo rellena noches sin
  dato o con el valor inflado (> 14 h). Un dato bueno del Watch (≤ 14 h) **se respeta**, así que
  este atajo y el backfill no se pisan.
