// Clasificación de métricas de composición corporal por rangos de referencia (semáforo
// Bajo/Bien/Alto/Muy alto), pura (sin React/JSX). Extraída de app.jsx en la modularización
// (Etapa 1, sub-etapa 2). Autocontenida. El mapa de colores SEGMENT_TONE se queda en app.jsx
// (es CSS de un componente).

// Rangos de referencia (adulto; por defecto hombre, como Hugo) para clasificar cada
// métrica tipo "semáforo" igual que Speediance (Bajo/Bien/Alto/Muy alto → SEGMENT_TONE).
// Cada `bands` es una lista ordenada [maxExclusivo, label]; el último label aplica al
// resto. Solo incluimos métricas con un estándar clínico claro y útil; las que no
// tienen rango absoluto significativo (kg de grasa/músculo, peso) no llevan semáforo.
// Umbrales de referencia general — ajustables si tu báscula usa otra escala.
export const REFERENCE_RANGES = {
  bodyFatPct:    { M: [[8, 'Bajo'], [20, 'Bien'], [25, 'Alto'], [Infinity, 'Muy alto']],
                   F: [[15, 'Bajo'], [28, 'Bien'], [33, 'Alto'], [Infinity, 'Muy alto']] },
  visceralFat:   { both: [[10, 'Bien'], [15, 'Alto'], [Infinity, 'Muy alto']] },
  bmi:           { both: [[18.5, 'Bajo'], [25, 'Bien'], [30, 'Alto'], [Infinity, 'Muy alto']] },
  waistHipRatio: { M: [[0.90, 'Bien'], [1.0, 'Alto'], [Infinity, 'Muy alto']],
                   F: [[0.80, 'Bien'], [0.85, 'Alto'], [Infinity, 'Muy alto']] },
  ffmi:          { M: [[18, 'Bajo'], [22, 'Bien'], [25, 'Alto'], [Infinity, 'Muy alto']],
                   F: [[15, 'Bajo'], [19, 'Bien'], [22, 'Alto'], [Infinity, 'Muy alto']] },
  waterPct:      { M: [[50, 'Bajo'], [65, 'Bien'], [Infinity, 'Alto']],
                   F: [[45, 'Bajo'], [60, 'Bien'], [Infinity, 'Alto']] },
  proteinPct:    { both: [[16, 'Bajo'], [20, 'Bien'], [Infinity, 'Alto']] },
  musclePct:     { M: [[40, 'Bajo'], [55, 'Bien'], [Infinity, 'Alto']],
                   F: [[35, 'Bajo'], [50, 'Bien'], [Infinity, 'Alto']] },
};

// Devuelve el label de estado ('Bajo'|'Bien'|'Alto'|'Muy alto') para una métrica, o
// null si no hay rango definido o el valor no es numérico.
export function evalMetric(key, value, profile) {
  const def = REFERENCE_RANGES[key];
  if (!def || value == null || value === '') return null;
  const n = Number(value);
  if (!isFinite(n)) return null;
  const sex = profile?.sex === 'F' ? 'F' : 'M';
  const bands = def.both || def[sex];
  if (!bands) return null;
  for (const [max, label] of bands) {
    if (n < max) return label;
  }
  return bands[bands.length - 1][1];
}
