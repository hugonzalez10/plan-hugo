// Test de mergeRemoteState / mergeDay — el merge 3-way local⊕remoto del Gist (sin pérdida).
// applyRemoteState pisa lo local (correcto solo con equipo limpio); ante conflicto real
// (editaste local Y la nube avanzó) mergeRemoteState UNE por id/fecha y conserva ambos lados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRemoteState, mergeDay } from '../src/sync.mjs';

const baseState = (over = {}) => ({
  userProfile: null,
  days: {},
  weights: [],
  energy: [],
  snackBank: [], proteinBank: [], dessertBank: [], recipeBank: [], rules: [], favorites: [],
  settings: {},
  bridge: { importedIds: [], removedBridgeIds: [], pushedIds: [] },
  ...over,
});
const mkDay = (over = {}) => ({ eaten: {}, extras: [], exercise: [], water: { ml: 0, log: [] }, ...over });
const AT = '2026-06-20T00:00:00.000Z';

test('día editado en ambos lados → extras unidos, sin duplicar por id', () => {
  const prev = baseState({ days: { '2026-06-10': mkDay({ extras: [{ id: 'a', name: 'Manzana', kcal: 80 }] }) } });
  const remote = baseState({ days: { '2026-06-10': mkDay({ extras: [{ id: 'a', name: 'Manzana', kcal: 80 }, { id: 'b', name: 'Pan', kcal: 120 }] }) } });
  const m = mergeRemoteState(prev, remote, AT);
  const ids = m.days['2026-06-10'].extras.map((x) => x.id).sort();
  assert.deepEqual(ids, ['a', 'b']);
});

test('día presente solo en remoto se conserva (no se pierde)', () => {
  const prev = baseState({ days: { '2026-06-10': mkDay({ extras: [{ id: 'a' }] }) } });
  const remote = baseState({ days: { '2026-06-11': mkDay({ extras: [{ id: 'z' }] }) } });
  const m = mergeRemoteState(prev, remote, AT);
  assert.deepEqual(Object.keys(m.days).sort(), ['2026-06-10', '2026-06-11']);
});

test('peso nuevo en cada lado → ambos sobreviven (union por id)', () => {
  const prev = baseState({ weights: [{ id: 'w-local', date: '2026-06-10', weightKg: 90 }] });
  const remote = baseState({ weights: [{ id: 'w-remote', date: '2026-06-11', weightKg: 89 }] });
  const m = mergeRemoteState(prev, remote, AT);
  assert.equal(m.weights.length, 2);
});

test('peso sin id se dedupea por fecha+peso (no duplica el mismo pesaje)', () => {
  const prev = baseState({ weights: [{ date: '2026-06-10', weightKg: 90 }] });
  const remote = baseState({ weights: [{ date: '2026-06-10', weightKg: 90 }] });
  const m = mergeRemoteState(prev, remote, AT);
  assert.equal(m.weights.length, 1);
});

test('banco con item agregado en cada lado → union por id', () => {
  const prev = baseState({ snackBank: [{ id: 's1', name: 'Yogur' }] });
  const remote = baseState({ snackBank: [{ id: 's2', name: 'Almendras' }] });
  const m = mergeRemoteState(prev, remote, AT);
  assert.equal(m.snackBank.length, 2);
});

test('favorites (ids sueltos) se unen como conjunto', () => {
  const prev = baseState({ favorites: ['x', 'y'] });
  const remote = baseState({ favorites: ['y', 'z'] });
  const m = mergeRemoteState(prev, remote, AT);
  assert.deepEqual([...m.favorites].sort(), ['x', 'y', 'z']);
});

test('secretos locales se preservan (el remoto viene sanitizado sin PAT)', () => {
  const prev = baseState({ settings: { githubPAT: 'TOK', bridgeToken: 'BT', autoSync: true } });
  const remote = baseState({ settings: {} });
  const m = mergeRemoteState(prev, remote, AT);
  assert.equal(m.settings.githubPAT, 'TOK');
  assert.equal(m.settings.bridgeToken, 'BT');
  assert.equal(m.settings.lastRemoteUpdatedAt, AT);
});

test('remoto corrupto (forma inválida) → no pisa, devuelve lo local', () => {
  const prev = baseState({ days: { '2026-06-10': mkDay() } });
  const m = mergeRemoteState(prev, { days: 'no-es-objeto' }, AT);
  assert.equal(m, prev);
});

test('idempotencia: re-mergear el mismo remoto no agrega ni duplica', () => {
  const prev = baseState({
    days: { '2026-06-10': mkDay({ extras: [{ id: 'a' }] }) },
    weights: [{ id: 'w1', date: '2026-06-10', weightKg: 90 }],
    snackBank: [{ id: 's1', name: 'Yogur' }],
  });
  const remote = baseState({
    days: { '2026-06-10': mkDay({ extras: [{ id: 'b' }] }) },
    weights: [{ id: 'w2', date: '2026-06-11', weightKg: 89 }],
    snackBank: [{ id: 's2', name: 'Almendras' }],
  });
  const once = mergeRemoteState(prev, remote, AT);
  const twice = mergeRemoteState(once, remote, AT);
  assert.deepEqual(twice.days['2026-06-10'].extras.map((x) => x.id).sort(), ['a', 'b']);
  assert.equal(twice.weights.length, 2);
  assert.equal(twice.snackBank.length, 2);
});

test('mergeDay: water.log se une y ml se recomputa como la suma', () => {
  const a = mkDay({ water: { ml: 500, log: [{ id: 'w1', ml: 500 }] } });
  const b = mkDay({ water: { ml: 250, log: [{ id: 'w2', ml: 250 }] } });
  const d = mergeDay(a, b);
  assert.equal(d.water.log.length, 2);
  assert.equal(d.water.ml, 750);
});

test('mergeDay: escalares prefieren el local; marcas se unen', () => {
  const a = mkDay({ snackId1: 'x', skipped: ['cena'] });
  const b = mkDay({ snackId1: 'y', skipped: ['colacion1'] });
  const d = mergeDay(a, b);
  assert.equal(d.snackId1, 'x');
  assert.deepEqual([...d.skipped].sort(), ['cena', 'colacion1']);
});

test('mergeDay: ejercicio nuevo en cada lado → ambos (union por id)', () => {
  const a = mkDay({ exercise: [{ id: 'e1', name: 'Press' }] });
  const b = mkDay({ exercise: [{ id: 'e2', name: 'Sentadilla' }] });
  const d = mergeDay(a, b);
  assert.equal(d.exercise.length, 2);
});
