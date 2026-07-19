// Lógica pura de la métrica de sueño (src/sleep.mjs): umbrales del semáforo, formato
// Xh Ymin, saneo de minutos y las estadísticas de la tarjeta (última noche, promedio 7d,
// serie de 14 días). El promedio de 7 días es lo que colorea el semáforo (centinela <6h).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLEEP_FLOOR_MIN, SLEEP_TARGET_MIN,
  fmtSleepMin, sleepTone, sleepSentinelTripped, sanitizeSleepMin, sleepStats,
} from '../src/sleep.mjs';

test('umbrales: 6h piso y 6h30 objetivo (en minutos)', () => {
  assert.equal(SLEEP_FLOOR_MIN, 360);
  assert.equal(SLEEP_TARGET_MIN, 390);
});

test('fmtSleepMin: Xh Ymin / bordes', () => {
  assert.equal(fmtSleepMin(387), '6h 27min');
  assert.equal(fmtSleepMin(360), '6h');
  assert.equal(fmtSleepMin(45), '45min');
  assert.equal(fmtSleepMin(390.4), '6h 30min'); // promedio con decimales → redondea
  assert.equal(fmtSleepMin(null), '—');
});

test('sleepTone: <6h rojo · 6h–6h30 ámbar · ≥6h30 verde', () => {
  assert.equal(sleepTone(359), 'red');
  assert.equal(sleepTone(360), 'amber');
  assert.equal(sleepTone(389), 'amber');
  assert.equal(sleepTone(390), 'green');
  assert.equal(sleepTone(null), null);
});

test('sleepSentinelTripped: solo bajo el piso', () => {
  assert.equal(sleepSentinelTripped(350), true);
  assert.equal(sleepSentinelTripped(360), false);
  assert.equal(sleepSentinelTripped(null), false);
});

test('sanitizeSleepMin: descarta basura y >14h (misma cota que sleepHours)', () => {
  assert.equal(sanitizeSleepMin(387), 387);
  assert.equal(sanitizeSleepMin('387'), 387);
  assert.equal(sanitizeSleepMin(0), null);
  assert.equal(sanitizeSleepMin(-10), null);
  assert.equal(sanitizeSleepMin(15 * 60), null, '>14h es muestra corrupta');
  assert.equal(sanitizeSleepMin('abc'), null);
});

test('sleepStats: última noche, promedio 7d SOLO con kind:daily, serie de 14 días', () => {
  const today = '2026-07-19';
  const entries = [
    { date: '2026-07-17', kind: 'daily', asleepMin: 360 },
    { date: '2026-07-18', kind: 'daily', asleepMin: 350 },
    { date: '2026-07-19', kind: 'daily', asleepMin: 400, bedtime: '23:42' },
    // Promedio semanal y una noche fuera de la ventana de 7 días: NO deben entrar al avg7
    { date: '2026-07-19', kind: 'weekly', asleepMin: 100 },
    { date: '2026-07-01', kind: 'daily', asleepMin: 100 },
  ];
  const s = sleepStats(entries, today);
  assert.equal(s.last.date, '2026-07-19');
  assert.equal(s.last.asleepMin, 400);
  assert.equal(s.avg7Count, 3);
  assert.equal(Math.round(s.avg7), Math.round((360 + 350 + 400) / 3));
  assert.equal(s.tone, 'amber');
  assert.equal(s.series14.length, 14);
  assert.equal(s.series14[13].date, today);
  assert.equal(s.series14[13].asleepMin, 400);
  assert.equal(s.series14[0].asleepMin, null, 'día sin registro → null');
});

test('sleepStats: noches duplicadas de la misma fecha → gana la última; implausibles se descartan', () => {
  const s = sleepStats([
    { date: '2026-07-19', kind: 'daily', asleepMin: 300 },
    { date: '2026-07-19', kind: 'daily', asleepMin: 380 },
    { date: '2026-07-18', kind: 'daily', asleepMin: 20 * 60 }, // >14h → fuera
  ], '2026-07-19');
  assert.equal(s.avg7Count, 1);
  assert.equal(s.last.asleepMin, 380);
});

test('sleepStats: sin datos → todo null y semáforo apagado', () => {
  const s = sleepStats([], '2026-07-19');
  assert.equal(s.last, null);
  assert.equal(s.avg7, null);
  assert.equal(s.tone, null);
  assert.equal(s.series14.length, 14);
});
