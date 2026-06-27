// computeRoutineExerciseProgress cruza la rutina (español limpio) con los nombres de Speediance
// (otra jerga para el mismo movimiento) vía sinónimos + alias. Antes solo calzaban ~4/19; este test
// fija el cruce real: Sentadilla↔Squat, Peso muerto↔Deadlift, Remo↔Fila, Jalón↔Lat Pulldown, etc.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeExerciseStats, computeRoutineExerciseProgress } from '../src/analytics.mjs';

const ex = (name, w, vol, reps) => ({ name, muscle: 'x', weightKg: w, volumeKg: vol, reps, oneRepMaxKg: null });
const day = (date, exs) => ({ exercise: [{ id: 'w' + date, ts: Date.parse(date + 'T12:00:00'), name: 'Speediance', type: 'strength', kcal: 300, exercises: exs }] });

// Nombres tal como los registra Speediance.
const days = {
  '2026-06-15': day('2026-06-15', [
    ex('Squat con barra', 75, 2400, 8),
    ex('Barbell Rumano Deadlift', 100, 2800, 8),
    ex('Barrena Deadlift', 60, 1800, 10),
    ex('Rack de doble mango split Squat', 40, 2400, 10),
    ex('Manchón de cadera', 60, 2160, 12),
  ]),
  '2026-06-18': day('2026-06-18', [
    ex('Barbell repartido por la fila', 50, 2030, 8),
    ex('Sellada Barbell Lat Pulldown', 55, 1670, 10),
    ex('Fila alterna de pie', 24, 1576, 12),
    ex('Fila de doble manija de pie', 20, 1308, 12),
    ex('Curl para bíceps con barra de pie', 30, 1032, 12),
    ex('Curl de bíceps en polea alta con accesorio de cuerda', 15, 673, 15),
  ]),
};

// Rutina con los nombres limpios en español (como vienen del .docx).
const routine = { title: 'Rutina', days: [
  { id: 'dia-1', label: 'Pierna', exercises: [
    { slug: 'sentadilla-con-barra', name: 'Sentadilla con barra' },
    { slug: 'peso-muerto-rumano-bisagra-de-cadera-isquiotibiales-y-gluteos', name: 'Peso muerto rumano (bisagra de cadera: isquiotibiales y glúteos)' },
    { slug: 'peso-muerto-piernas-rigidas', name: 'Peso muerto piernas rígidas' },
    { slug: 'split-squat-con-doble-mango-una-pierna-adelante', name: 'Split squat con doble mango (una pierna adelante)' },
    { slug: 'empuje-de-cadera-con-barra-hip-thrust', name: 'Empuje de cadera con barra (hip thrust)' },
  ]},
  { id: 'dia-4', label: 'Tracción', exercises: [
    { slug: 'remo-con-barra-de-pie-traccion-horizontal', name: 'Remo con barra de pie (tracción horizontal)' },
    { slug: 'jalon-al-pecho-con-barra-traccion-vertical', name: 'Jalón al pecho con barra (tracción vertical)' },
    { slug: 'remo-a-un-brazo-de-pie', name: 'Remo a un brazo de pie' },
    { slug: 'remo-con-doble-manija-de-pie', name: 'Remo con doble manija de pie' },
    { slug: 'curl-de-biceps-con-barra-de-pie', name: 'Curl de bíceps con barra de pie' },
    { slug: 'curl-de-biceps-en-polea-con-doble-asa', name: 'Curl de bíceps en polea con doble asa' },
  ]},
]};

test('cruza rutina↔Speediance vía sinónimos/alias: todos con datos', () => {
  const stats = computeExerciseStats(days, '2026-06-20', 8);
  const rp = computeRoutineExerciseProgress(stats, routine, '2026-06-20');
  assert.equal(rp.hasRoutine, true);
  const withData = rp.routine.filter((x) => x.entries.length > 0);
  assert.equal(withData.length, 11, 'los 11 ejercicios de la rutina deben calzar con datos');
});

test('cada ejercicio trae su PR y su historial con reps', () => {
  const stats = computeExerciseStats(days, '2026-06-20', 8);
  const rp = computeRoutineExerciseProgress(stats, routine, '2026-06-20');
  const sent = rp.routine.find((x) => x.slug === 'sentadilla-con-barra');
  assert.equal(sent.bestWeight, 75);
  assert.equal(sent.entries[0].reps, 8);
  const jalon = rp.routine.find((x) => x.slug === 'jalon-al-pecho-con-barra-traccion-vertical');
  assert.equal(jalon.bestWeight, 55, 'Jalón debe calzar con Sellada Barbell Lat Pulldown');
});

test('ningún registro Speediance se asigna a dos ejercicios de la rutina', () => {
  const stats = computeExerciseStats(days, '2026-06-20', 8);
  const rp = computeRoutineExerciseProgress(stats, routine, '2026-06-20');
  // 11 registros únicos, todos consumidos → others vacío
  assert.equal(rp.others.length, 0);
});
