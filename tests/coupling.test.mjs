// Guard del acoplamiento app ↔ bridge: el dedup por contenido solo funciona si
// normalizeName() de app.jsx y _norm() de bridge-writer.gs normalizan IDÉNTICO. Está
// documentado como "NO cambiar / debe coincidir carácter a carácter" en ambos lados,
// pero nada lo verificaba: tocar uno y no el otro rompía el dedup en silencio. Este
// test extrae normalizeName de app.jsx (función pura, sin JSX) y la compara contra
// _norm del .gs sobre una batería de strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gs } from './load-gs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, '..', 'app.jsx'), 'utf8');

// Extrae el cuerpo de `function normalizeName(...) { ... }` (no contiene JSX).
const m = appSrc.match(/function normalizeName\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
assert.ok(m, 'no se encontró normalizeName en app.jsx');
const normalizeName = new Function(`${m[0]}; return normalizeName;`)();

const SAMPLES = [
  '  Empanada   de   Pino ',
  'Café CON Leche',
  'PAN amasado',
  'Té\tverde',
  'arroz   blanco',
  'Pollo a la plancha',
  'Yogurt Colun Protein Plus',
  '',
  '   ',
  'ÑOQUIS de papa',
];

test('normalizeName (app) y _norm (bridge) coinciden carácter a carácter', () => {
  for (const s of SAMPLES) {
    assert.equal(normalizeName(s), gs._norm(s), `divergen en: ${JSON.stringify(s)}`);
  }
});

test('normalizeName tolera null/undefined igual que _norm', () => {
  assert.equal(normalizeName(null), gs._norm(null));
  assert.equal(normalizeName(undefined), gs._norm(undefined));
});
