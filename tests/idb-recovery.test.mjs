// Fase 4: rescate desde el espejo IndexedDB. localStorage es el store primario; IndexedDB es un
// espejo durable que solo RESCATA cuando el local arrancó vacío (__freshStart) y el espejo trae
// datos reales — nunca pisa datos locales buenos. recoverFromMirror vive en src/storage.mjs y se
// importa directo (con su migrateState real). El camino IDB real se verifica en el navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recoverFromMirror } from '../src/storage.mjs';
import { buildSeed } from '../src/seed.mjs';

const J = (o) => JSON.stringify(o);
// recoverFromMirror corre migrateState() sobre el espejo: los mirrors deben tener el shape
// completo de un estado real, así que se parten de buildSeed() (un estado nuevo válido) y se
// sobreescribe solo el campo bajo prueba. Antes se stubeaba migrateState; ahora es integración real.

test('datos locales buenos (sin __freshStart) → NO rescata aunque haya espejo', () => {
  const local = { userProfile: { age: 36 }, days: {} };
  assert.equal(recoverFromMirror(local, J({ ...buildSeed(), userProfile: { age: 99 } })), null);
});

test('arranque vacío + espejo con perfil → rescata el espejo', () => {
  const local = { __freshStart: true, days: {} };
  const mirror = { ...buildSeed(), userProfile: { age: 36 }, days: { '2026-06-10': {} } };
  const r = recoverFromMirror(local, J(mirror));
  assert.ok(r);
  assert.equal(r.userProfile.age, 36);
  assert.equal(r.__freshStart, undefined); // el estado rescatado no arrastra el marcador
});

test('arranque vacío + espejo con días (sin perfil) → rescata', () => {
  const local = { __freshStart: true };
  const r = recoverFromMirror(local, J({ ...buildSeed(), days: { '2026-06-01': { extras: [] } } }));
  assert.ok(r);
});

test('arranque vacío + espejo con pesos → rescata', () => {
  const local = { __freshStart: true };
  const r = recoverFromMirror(local, J({ ...buildSeed(), weights: [{ date: '2026-06-01', weightKg: 90 }] }));
  assert.ok(r);
});

test('arranque vacío + espejo SIN datos reales → null (device nuevo de verdad)', () => {
  const local = { __freshStart: true };
  // buildSeed() trae userProfile null, days {} y weights [] → sin datos reales que rescatar.
  assert.equal(recoverFromMirror(local, J(buildSeed())), null);
});

test('arranque vacío + espejo corrupto o ausente → null', () => {
  const local = { __freshStart: true };
  assert.equal(recoverFromMirror(local, '{no es json'), null);
  assert.equal(recoverFromMirror(local, null), null);
});
