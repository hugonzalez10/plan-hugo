// Parsers del export CSV de HeartWatch (resumen diario + entrenamientos). Cubren: detección por
// header, mapeo de columnas, número con coma decimal (103,3 → 103.3) vs punto, duración/zonas en
// HH:MM:SS → minutos, y que los signos vitales vacíos/0 se descarten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRows, parseHeartWatchDaily, parseHeartWatchWorkouts } from '../src/parsing.mjs';

test('parseCsvRows respeta comas dentro de comillas', () => {
  const rows = parseCsvRows('"a","domingo, 14 jun.","c"\n"1","2","3"');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ['a', 'domingo, 14 jun.', 'c']);
  assert.deepEqual(rows[1], ['1', '2', '3']);
});

const DAILY = [
  '"ISO","Fecha","Tiempo dormido","Sueño-lpm","Sueño-ba-lpm","Sueño-al-lpm","Sueño-HRV-ms","Despertar-lpm","Despertar-HRV-ms","Diario-Medio.-lpm","Diario-ba-lpm","Diario-al-lpm","Sed-Medio.-lpm","Sed-ba-lpm","Sed-<50lpm-%","Sed-al-lpm","Sed->100lpm-%","PA (am)-Sis","PA (am)-Dias","PA (pm)-Sis","PA (pm)-Dias","Temperatura-°","SpO2 Diaria-%","SpO2 Durmiendo-%","Glucosa al despertar-","Glucosa diaria-","Glucosa diaria-ba","Glucosa diaria-al","Movimiento-Cals","Pasos","Distancia-km","Entrenos-mins.","Entrenos-lpm","Entrenos-%","Entrenos-al-lpm","Entrenos-al-%","Recuperación de 2 min-lpm","Entrenos-Cals","Entrenos-Carga","Entrenos-km","Peso-kg","Cintura-cm","Gordo-%"',
  '"2026-06-18T04:00:00-04:00","jueves, 18 jun.","05:25:11","57.7","52","65","69","59","29","72.0","55","108","71.2","57","","97","","","","","","","94.0","95.6","","","","","1088","4960","3,63","140","117.1","63.9","129.0","70.4","31","1101","","","103,3","","31,6"',
  // fila sin HRV de sueño (vacío) ni recuperación: igual aporta SpO₂
  '"2026-06-19T04:00:00-04:00","viernes, 19 jun.","04:49:40","57.1","52","71","58","55","117","70.1","50","107","70.4","52","","100","0.6","","","","","","93.9","94.4","","","","","643","4520","3,30","","","","","","","643","","","","",""',
].join('\n');

test('parseHeartWatchDaily mapea recuperación y descarta vacíos', () => {
  const r = parseHeartWatchDaily(DAILY);
  assert.equal(r.ok, true);
  assert.equal(r.days.length, 2);
  const d18 = r.days[0];
  assert.equal(d18.date, '2026-06-18');
  assert.equal(d18.hrvSleep, 69);
  assert.equal(d18.hrvWake, 29);
  assert.equal(d18.sleepingHr, 57.7);
  assert.equal(d18.sedentaryHr, 71.2);
  assert.equal(d18.spo2Daily, 94);
  assert.equal(d18.spo2Sleep, 95.6);
  assert.equal(d18.recovery2min, 31);
  assert.equal(d18.sleepHours, +(((5 * 3600 + 25 * 60 + 11) / 3600).toFixed(2)), 'sueño HH:MM:SS → horas');
  const d19 = r.days[1];
  assert.equal(d19.spo2Daily, 93.9);
  assert.ok(!('recovery2min' in d19), 'recuperación vacía no debe aparecer');
});

test('parseHeartWatchDaily rechaza el CSV equivocado', () => {
  const r = parseHeartWatchDaily('"ISO","Tipo","Duración"\n"x","Remo","00:05:00"');
  assert.equal(r.ok, false);
  assert.equal(r.days.length, 0);
});

const WORKOUTS = [
  '"ISO","Fecha","desde","a","Duración","Tipo","lpm-Medio.","lpm-%","lpm-ba","lpm-al","lpm-90%+-%","90%+-mins.","lpm-80-90%-%","80-90%-mins.","lpm-70-80%-%","70-80%-mins.","lpm-60-70%-%","60-70%-mins.","lpm-50-60%-%","50-60%-mins.","rpe","Carga","Cals","Cals/h","km","km/h","/km"',
  '"2026-06-15T06:57:26-04:00","lunes, 15 jun.","06:57","07:42","00:44:49","Entrenamiento con pesas","122.8","67.0","100.0","149.0","","","0.9","00:00:24","30.2","00:13:33","59.7","00:26:46","9.1","00:04:04","6","254","342.2","458.0","","",""',
  '"2026-06-16T07:27:51-04:00","martes, 16 jun.","07:27","07:44","00:16:55","Carrera","141.7","77.4","91.0","156.0","","","30.4","00:05:08","58.8","00:09:57","6.9","00:01:09","3.4","00:00:34","7","118","234.4","830.9","2,58","9.2","00:06:33"',
].join('\n');

test('parseHeartWatchWorkouts mapea tipo, zonas (HH:MM:SS→min), carga y km con coma', () => {
  const r = parseHeartWatchWorkouts(WORKOUTS);
  assert.equal(r.ok, true);
  assert.equal(r.sessions.length, 2);
  const pesas = r.sessions[0];
  assert.equal(pesas.date, '2026-06-15');
  assert.equal(pesas.type, 'strength');
  assert.equal(pesas.avgHr, 122.8);
  assert.equal(pesas.rpe, 6);
  assert.equal(pesas.trainingLoad, 254);
  assert.equal(pesas.calsPerHour, 458);
  assert.equal(pesas.minutes, +(((44 * 60 + 49) / 60).toFixed(1)));
  // 80-90% = 00:00:24 = 0.4 min; 70-80% = 00:13:33 = 13.55 min
  assert.equal(pesas.hrZones.z80, 0.4);
  assert.equal(pesas.hrZones.z70, 13.6);
  assert.ok(!('z90' in pesas.hrZones), 'zona vacía no debe aparecer');
  const carrera = r.sessions[1];
  assert.equal(carrera.type, 'cardio');
  assert.equal(carrera.distanceKm, 2.58, 'km con coma decimal');
});
