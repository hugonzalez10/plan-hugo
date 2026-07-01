// Parser de sueño del import de Google Takeout. La pieza crítica: FUSIONAR los segmentos
// solapados antes de sumar. Google Fit recibe segmentos de varias fuentes (Apple Watch + otras
// apps) que se solapan; sumar crudo infla la noche a 15-23 h (bug confirmado). También verifica
// la atribución por noche (fecha del despertar) y la zona horaria America/Santiago.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sleepHoursByNight, mergeIntervals, deriveMets, localDateKey, MAX_SLEEP_H } from '../tooling/takeout-parse.mjs';

// nanos exacto = ms + '000000' (evita perder precisión que da ms*1e6 en double).
const nanos = (iso) => String(Date.parse(iso)) + '000000';
const seg = (intVal, startIso, endIso) => ({
  fitValue: [{ value: { intVal } }],
  startTimeNanos: nanos(startIso),
  endTimeNanos: nanos(endIso),
});

test('fusiona dos fuentes solapadas: no suma crudo (12h) sino la unión real (7h)', () => {
  const points = [
    seg(4, '2026-06-19T23:00:00-04:00', '2026-06-20T06:00:00-04:00'), // Watch, 7h
    seg(2, '2026-06-20T00:00:00-04:00', '2026-06-20T05:00:00-04:00'), // otra app, 5h dentro del anterior
  ];
  const byNight = sleepHoursByNight(points);
  assert.equal(byNight['2026-06-20'], 7.0, 'no fusionó: sumó crudo el solape');
});

test('el caso patológico (segmentos multi-fuente) queda ≤ techo fisiológico', () => {
  // Muchos segmentos solapados que crudos darían >20h; fusionados dan la ventana real.
  const points = [
    seg(2, '2026-06-19T22:30:00-04:00', '2026-06-20T07:00:00-04:00'), // 8.5h
    seg(4, '2026-06-19T23:00:00-04:00', '2026-06-20T06:30:00-04:00'),
    seg(5, '2026-06-20T00:00:00-04:00', '2026-06-20T03:00:00-04:00'),
    seg(6, '2026-06-20T03:00:00-04:00', '2026-06-20T05:00:00-04:00'),
  ];
  const h = sleepHoursByNight(points)['2026-06-20'];
  assert.equal(h, 8.5, 'la unión de todos los solapados es 22:30→07:00 = 8.5h');
  assert.ok(h <= MAX_SLEEP_H, 'superó el techo fisiológico: quedó algo sin fusionar');
});

test('descarta estados despierto/fuera de cama (1 y 3)', () => {
  const points = [
    seg(4, '2026-06-19T23:00:00-04:00', '2026-06-20T05:00:00-04:00'), // 6h dormido
    seg(1, '2026-06-20T05:00:00-04:00', '2026-06-20T06:00:00-04:00'), // 1h despierto en cama → NO cuenta
    seg(3, '2026-06-20T06:00:00-04:00', '2026-06-20T06:30:00-04:00'), // fuera de cama → NO cuenta
  ];
  assert.equal(sleepHoursByNight(points)['2026-06-20'], 6.0);
});

test('atribuye la noche a la fecha local del despertar (fin del segmento)', () => {
  // Duerme el 19 en la noche, despierta el 20 → la noche es "2026-06-20".
  const points = [seg(4, '2026-06-19T23:30:00-04:00', '2026-06-20T06:30:00-04:00')];
  const byNight = sleepHoursByNight(points);
  assert.deepEqual(Object.keys(byNight), ['2026-06-20']);
  assert.equal(byNight['2026-06-20'], 7.0);
});

test('separa noches distintas', () => {
  const points = [
    seg(4, '2026-06-19T23:00:00-04:00', '2026-06-20T05:00:00-04:00'), // noche del 20 → 6h
    seg(4, '2026-06-20T23:00:00-04:00', '2026-06-21T04:30:00-04:00'), // noche del 21 → 5.5h
  ];
  const byNight = sleepHoursByNight(points);
  assert.equal(byNight['2026-06-20'], 6.0);
  assert.equal(byNight['2026-06-21'], 5.5);
});

test('localDateKey usa America/Santiago (no UTC)', () => {
  // 03:00 UTC del 20 = 23:00 del 19 en Chile (UTC-4 en invierno). La fecha local es el 19.
  const ms = Date.parse('2026-06-20T03:00:00Z');
  assert.equal(localDateKey(ms), '2026-06-19');
});

test('mergeIntervals colapsa solapados y contiguos, ordena por inicio', () => {
  const merged = mergeIntervals([
    { start: 100, end: 200 },
    { start: 150, end: 250 }, // solapa
    { start: 250, end: 300 }, // contiguo
    { start: 500, end: 600 }, // disjunto
  ]);
  assert.deepEqual(merged, [{ start: 100, end: 300 }, { start: 500, end: 600 }]);
});

test('deriveMets = kcal/(kg·h) a 1 decimal, y descarta insumos inválidos', () => {
  // 693 kcal, 90 kg, 62 min → 693 / (90 * 1.0333) ≈ 7.45 → 7.5
  assert.equal(deriveMets(693, 90, 62 / 60), 7.5);
  assert.equal(deriveMets(0, 90, 1), null, 'kcal 0 → null');
  assert.equal(deriveMets(500, 0, 1), null, 'peso 0 → null (no dividir por 0)');
  assert.equal(deriveMets(500, 90, 0), null, 'horas 0 → null');
  assert.equal(deriveMets(99999, 90, 0.01), null, '>30 METs no es humano → null');
});
