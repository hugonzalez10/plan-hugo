// Parseo de rutina .docx: normalizeRoutine (dedup de rampa por ejercicio) y
// parseRoutineTemplate (formato Speediance con celdas sueltas de mammoth).
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoutine, parseRoutineTemplate } from '../src/parsing.mjs';

test('normalizeRoutine anula ex.ramp cuando duplica la rampa del día', () => {
  const r = normalizeRoutine({
    title: 'Rutina',
    days: [{
      label: 'Día 2 — Empuje',
      ramp: 'Rampa en press de banca.',
      exercises: [
        { name: 'Press de banca con barra', pesoInicio: '42,5 kg', seriesReps: '4 × 8', ramp: 'Rampa en press de banca' },
        { name: 'Press de hombro de pie con barra', pesoInicio: '37,5 kg', seriesReps: '4 × 8', ramp: '2 series ligeras antes del peso de trabajo' },
      ],
    }],
  });
  const [banca, hombro] = r.days[0].exercises;
  assert.equal(r.days[0].ramp, 'Rampa en press de banca.');
  assert.equal(banca.ramp, null, 'rampa idéntica a la del día (salvo puntuación/mayúsculas) se anula');
  assert.equal(hombro.ramp, '2 series ligeras antes del peso de trabajo', 'rampa distinta se conserva');
});

test('normalizeRoutine conserva ex.ramp si el día no tiene rampa', () => {
  const r = normalizeRoutine({
    days: [{ label: 'Día 1', exercises: [{ name: 'Sentadilla', ramp: 'Rampa de aproximación' }] }],
  });
  assert.equal(r.days[0].exercises[0].ramp, 'Rampa de aproximación');
});

test('parseRoutineTemplate: celdas sueltas de mammoth, ancla ⚓ y coma decimal', () => {
  // Unidas con \n\n como hace mammoth.extractRawText (una línea en blanco entre celdas):
  // el parser debe saltarse los huecos o no calza ningún ejercicio.
  const raw = [
    'Día 2 — Empuje (~50 min)',
    'Calentamiento (3-4 min): bici suave.',
    'Ejercicio', 'Peso inicio', 'Series × Reps', 'Descanso',
    '⚓ Press de banca con barra', '42,5 kg', '4 × 8', '2-3 min',
    'Elevaciones laterales doble mango', '8 kg', '3 × 15', '45-60 s',
    'Pallof press con cable (core antirrotación)', 'ajustar', '3 × 12 c/lado', '45-60 s',
    'Cardio de cierre: trote suave 15-20 min conversable.',
  ].join('\n\n');
  const routine = normalizeRoutine(parseRoutineTemplate(raw));
  assert.equal(routine.days.length, 1);
  const day = routine.days[0];
  assert.equal(day.label, 'Día 2 — Empuje');
  assert.equal(day.durationMin, 50);
  assert.equal(day.warmup, 'bici suave.');
  assert.equal(day.cardioClose, 'trote suave 15-20 min conversable.');
  assert.equal(day.exercises.length, 3);
  const [banca, laterales, pallof] = day.exercises;
  assert.equal(banca.name, 'Press de banca con barra');
  assert.equal(banca.anchor, true);
  assert.equal(banca.pesoInicio, '42,5 kg');
  assert.equal(banca.seriesReps, '4 × 8');
  assert.equal(banca.descanso, '2-3 min');
  assert.ok(banca.slug, 'cada ejercicio sale con slug para cruzar videos');
  assert.equal(laterales.anchor, false);
  assert.equal(laterales.descanso, '45-60 s');
  assert.equal(pallof.pesoInicio, 'ajustar', 'peso "ajustar" (core sin carga fija) también es fila válida');
  assert.equal(pallof.seriesReps, '3 × 12 c/lado');
});
