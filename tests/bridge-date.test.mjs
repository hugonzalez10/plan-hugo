// Regresión: una entrada del bridge SIN `date` debe atribuirse al día de su `ts`, no a
// "hoy". Antes, mergeBridge usaba `entry.date || todayKey()`, así que una comida/agua vieja
// sin fecha se volcaba en el día actual cada sync e inflaba el progreso de hoy. bridgeDateKey
// deriva la fecha del ts. Vive en src/sync.mjs y se importa directo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayKey } from '../src/dates.mjs';
import { bridgeDateKey } from '../src/sync.mjs';

test('date explícita manda sobre ts', () => {
  assert.equal(bridgeDateKey({ date: '2026-06-06', ts: 1781018941384 }), '2026-06-06');
});

test('sin date: deriva el día del ts (no hoy)', () => {
  const ts = 1780796215000; // mousse sin date del JSON real
  assert.equal(bridgeDateKey({ ts }), todayKey(new Date(ts)));
  // y NO debe caer en hoy (salvo que casualmente hoy sea ese día)
  if (todayKey() !== todayKey(new Date(ts))) {
    assert.notEqual(bridgeDateKey({ ts }), todayKey());
  }
});

test('sin date ni ts: último recurso es hoy', () => {
  assert.equal(bridgeDateKey({}), todayKey());
  assert.equal(bridgeDateKey(null), todayKey());
});

test('ts inválido cae a hoy', () => {
  assert.equal(bridgeDateKey({ ts: 'no-soy-un-numero' }), todayKey());
});
