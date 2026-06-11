// Fase 4: rescate desde el espejo IndexedDB. localStorage es el store primario; IndexedDB es un
// espejo durable que solo RESCATA cuando el local arrancó vacío (__freshStart) y el espejo trae
// datos reales — nunca pisa datos locales buenos. Aquí probamos la decisión PURA recoverFromMirror
// (stub de migrateState como pass-through). El camino IDB real se verifica en el navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, '..', 'app.jsx'), 'utf8');
const m = appSrc.match(/function recoverFromMirror\s*\([\s\S]*?\n\}/);
assert.ok(m, 'no se encontró recoverFromMirror');
// Stub: migrateState = identidad (la migración real se prueba aparte).
const recoverFromMirror = new Function(`
  function migrateState(x){ return x; }
  ${m[0]}
  return recoverFromMirror;
`)();

const J = (o) => JSON.stringify(o);

test('datos locales buenos (sin __freshStart) → NO rescata aunque haya espejo', () => {
  const local = { userProfile: { age: 36 }, days: {} };
  assert.equal(recoverFromMirror(local, J({ userProfile: { age: 99 } })), null);
});

test('arranque vacío + espejo con perfil → rescata el espejo', () => {
  const local = { __freshStart: true, days: {} };
  const mirror = { userProfile: { age: 36 }, days: { '2026-06-10': {} } };
  const r = recoverFromMirror(local, J(mirror));
  assert.ok(r);
  assert.equal(r.userProfile.age, 36);
  assert.equal(r.__freshStart, undefined); // el estado rescatado no arrastra el marcador
});

test('arranque vacío + espejo con días (sin perfil) → rescata', () => {
  const local = { __freshStart: true };
  const r = recoverFromMirror(local, J({ days: { '2026-06-01': { extras: [] } } }));
  assert.ok(r);
});

test('arranque vacío + espejo con pesos → rescata', () => {
  const local = { __freshStart: true };
  const r = recoverFromMirror(local, J({ weights: [{ date: '2026-06-01', weightKg: 90 }] }));
  assert.ok(r);
});

test('arranque vacío + espejo SIN datos reales → null (device nuevo de verdad)', () => {
  const local = { __freshStart: true };
  assert.equal(recoverFromMirror(local, J({ days: {}, weights: [] })), null);
});

test('arranque vacío + espejo corrupto o ausente → null', () => {
  const local = { __freshStart: true };
  assert.equal(recoverFromMirror(local, '{no es json'), null);
  assert.equal(recoverFromMirror(local, null), null);
});
