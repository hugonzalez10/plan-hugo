// Utilidades base sin dependencias (ids, normalización de nombres). Extraídas de app.jsx en la
// modularización (Etapa 1). Son el piso del que cuelgan seed.mjs y, más adelante, storage/sync:
// por eso normalizeName —el bloqueador recurrente— vive acá y no en un módulo de dominio.

// UUID v4 (crypto si está; fallback determinista-suficiente para ids locales).
export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Normaliza un nombre para dedup/lookup: minúsculas, trim, colapsa espacios. DEBE coincidir
// carácter a carácter con _norm() de bridge-writer.gs (lo verifica coupling.test).
export function normalizeName(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Id de dispositivo persistente (clave propia en localStorage). Viaja en cada entrada de agua
// de la app (source:'app') para que el dispositivo origen reconozca su propio eco al leer
// bridge.water[] y no lo doble-cuente. En node/tests (sin localStorage) → 'dev-unknown'.
export function getDeviceId() {
  try {
    let id = localStorage.getItem('plan-hugo-device-id');
    if (!id) { id = uuid(); localStorage.setItem('plan-hugo-device-id', id); }
    return id;
  } catch { return 'dev-unknown'; }
}
